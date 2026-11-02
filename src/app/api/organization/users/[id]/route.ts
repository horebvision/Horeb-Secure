import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { membershipService } from '@/lib/organizations/membership-service';
import { ClientService } from '@/lib/clients/client-service';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import type { UserRole } from '@/modules/users/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { role, status } = body;

    // 1. Récupération directe du collaborateur cible en base
    const { data: targetUser, error: findErr } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, role, organization_id, is_active, phone')
      .eq('id', id)
      .maybeSingle();

    if (findErr || !targetUser) {
      return NextResponse.json(
        { success: false, error: 'Collaborateur introuvable' },
        { status: 404 }
      );
    }

    // 2. Contrôle de cloisonnement d'organisation
    const targetOrgId = targetUser.organization_id || user.organizationId;
    const requestedOrgCookie = req.cookies.get('securia_org_id')?.value;
    const isSameOrg =
      targetUser.organization_id === user.organizationId ||
      (requestedOrgCookie && targetUser.organization_id === requestedOrgCookie);

    if (!isSameOrg && !user.isPlatformAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Accès refusé. Cet utilisateur n'appartient pas à votre organisation.",
          code: 'CROSS_ORGANIZATION_FORBIDDEN',
        },
        { status: 403 }
      );
    }

    // Protection : Seul un Super Admin peut attribuer le rôle SUPER_ADMIN ou modifier le compte racine
    if (!user.isPlatformAdmin && (role === 'SUPER_ADMIN' || id === 'dddddddd-dddd-dddd-dddd-dddddddddddd')) {
      return NextResponse.json(
        { success: false, error: 'Permissions insuffisantes pour cette opération.' },
        { status: 403 }
      );
    }

    const validRoles: UserRole[] = ['ADMIN', 'SECURITY_MANAGER', 'SECRETARY', 'AGENT', 'USER'];
    if (role && !validRoles.includes(role as UserRole)) {
      return NextResponse.json(
        { success: false, error: `Rôle invalide. Rôles autorisés: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // 3. Mise à jour autoritaire dans public.users
    const userUpdatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (role) {
      userUpdatePayload.role = role;
    }
    if (status) {
      userUpdatePayload.is_active = status === 'ACTIVE';
    }

    const { data: updatedDbUser, error: updateDbErr } = await supabaseAdmin
      .from('users')
      .update(userUpdatePayload)
      .eq('id', id)
      .select('id, email, full_name, role, organization_id, is_active')
      .single();

    if (updateDbErr) {
      console.error('[PATCH /api/organization/users] Erreur DB users update:', updateDbErr);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la mise à jour du profil en base' },
        { status: 500 }
      );
    }

    // 4. Synchronisation des métadonnées Supabase Auth (auth.users)
    try {
      const authMetadataUpdates: Record<string, any> = {};
      if (role) authMetadataUpdates.role = role;
      if (status) authMetadataUpdates.is_active = status === 'ACTIVE';

      await supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: authMetadataUpdates,
      });
    } catch (authErr) {
      console.warn('[PATCH /api/organization/users] Note auth.admin update:', authErr);
    }

    // 5. Gestion de la table security_agents (Flotte Terrain)
    try {
      if (role === 'AGENT') {
        // Si promu AGENT, s'assurer qu'une fiche security_agents existe et est active
        const { data: existingAgent } = await supabaseAdmin
          .from('security_agents')
          .select('id')
          .eq('user_id', id)
          .maybeSingle();

        if (!existingAgent) {
          const badgePrefix = (targetUser.full_name || 'AGT').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'A');
          const badgeNumber = `AGT-${badgePrefix}-${id.substring(0, 4).toUpperCase()}`;
          const { data: center } = await supabaseAdmin
            .from('security_centers')
            .select('id')
            .eq('organization_id', targetOrgId)
            .maybeSingle();

          await supabaseAdmin.from('security_agents').insert({
            user_id: id,
            organization_id: targetOrgId,
            security_center_id: center?.id || null,
            badge_number: badgeNumber,
            duty_status: 'AVAILABLE',
            patrol_vehicle: 'Patrouille Alpha Securia',
            is_active: true,
          });
        } else {
          await supabaseAdmin
            .from('security_agents')
            .update({ is_active: true, duty_status: 'AVAILABLE' })
            .eq('user_id', id);
        }
      } else if (role && role !== 'AGENT' && targetUser.role === 'AGENT') {
        // Si rétrogradé ou muté vers un autre rôle, désactiver la fiche terrain
        await supabaseAdmin
          .from('security_agents')
          .update({ is_active: false, duty_status: 'OFF_DUTY' })
          .eq('user_id', id);
      }
    } catch (agentSyncErr) {
      console.warn('[PATCH /api/organization/users] Note sync security_agents:', agentSyncErr);
    }

    // 6. Synchronisation du store applicatif des memberships
    await membershipService.updateMembership(id, targetOrgId, { role: role as UserRole, status }, user.id);

    return NextResponse.json({
      success: true,
      message: 'Rôle et habilitations mis à jour avec succès',
      user: {
        id: updatedDbUser.id,
        email: updatedDbUser.email,
        fullName: updatedDbUser.full_name,
        full_name: updatedDbUser.full_name,
        role: updatedDbUser.role,
        status: updatedDbUser.is_active ? 'ACTIVE' : 'SUSPENDED',
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || "Erreur lors de la modification de l'utilisateur");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Les gestionnaires de sécurité (SECURITY_MANAGER) et les administrateurs (ADMIN) peuvent supprimer des membres
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant invalide' }, { status: 400 });
    }

    let targetUserId = id;

    // Résolution flexible : si l'ID passé est celui d'une fiche agent (security_agents), retrouver le user_id associé
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      const { data: agentById } = await supabaseAdmin
        .from('security_agents')
        .select('id, user_id, organization_id')
        .eq('id', id)
        .maybeSingle();

      if (agentById?.user_id) {
        targetUserId = agentById.user_id;
      }
    }

    // Protection contre l'auto-suppression accidentelle
    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Action interdite : vous ne pouvez pas supprimer votre propre compte.' },
        { status: 400 }
      );
    }

    // Protection des comptes administrateurs racine plateforme
    if (targetUserId === 'dddddddd-dddd-dddd-dddd-dddddddddddd') {
      return NextResponse.json(
        { success: false, error: 'Action interdite sur le compte administrateur racine de la plateforme.' },
        { status: 403 }
      );
    }

    // Vérifier l'appartenance tenant de la cible et récupérer ses métadonnées
    let targetUserOrgId: string | null = null;
    let targetUserEmail: string | null = null;
    let targetUserClientId: string | null = null;
    let targetUserRole: string | null = null;

    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      const { data: uRow } = await supabaseAdmin
        .from('users')
        .select('organization_id, email, client_id, role')
        .eq('id', targetUserId)
        .maybeSingle();

      if (uRow) {
        targetUserOrgId = uRow.organization_id;
        targetUserEmail = uRow.email;
        targetUserClientId = uRow.client_id;
        targetUserRole = uRow.role;
      }
    }

    const targetMemberships = await membershipService.getUserMemberships(targetUserId);
    const membershipInOrg = targetMemberships.find(
      (m) => m.organization_id === user.organizationId
    );
    const belongsToOrg = (targetUserOrgId && targetUserOrgId === user.organizationId) || Boolean(membershipInOrg);

    if (!belongsToOrg && !user.isPlatformAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Accès refusé. Cet utilisateur n'appartient pas à votre organisation.",
          code: 'CROSS_ORGANIZATION_FORBIDDEN',
        },
        { status: 403 }
      );
    }

    // Cascade applicative de suppression réelle
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      // 1. Suppression / cascade de la fiche client correspondante
      // Si l'utilisateur est un client (USER), ou lié à un client_id, ou si une fiche client existe avec cet email
      try {
        await ClientService.cascadeDeleteForUser({
          userId: targetUserId,
          organizationId: user.organizationId,
          email: targetUserEmail,
          clientId: targetUserClientId,
          userRole: targetUserRole,
          actorUserId: user.id,
        });
      } catch (clientCascadeErr) {
        console.warn(`[API DELETE /organization/users] Note cascade client (${targetUserId}):`, clientCascadeErr);
      }

      // 2. Suppression / détachement des fiches d'agent (security_agents)
      const { data: agentRows } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .or(`user_id.eq.${targetUserId},id.eq.${id}`);

      const agentIds = (agentRows || []).map((a) => a.id);
      if (agentIds.length > 0) {
        // Détacher les alertes assignées à cet agent
        await supabaseAdmin
          .from('alerts')
          .update({ assigned_agent_id: null })
          .in('assigned_agent_id', agentIds);

        // Supprimer les fiches d'agent de la flotte
        await supabaseAdmin
          .from('security_agents')
          .delete()
          .in('id', agentIds);
      }

      // 2. Supprimer les notifications destinées à l'utilisateur
      await supabaseAdmin.from('notifications').delete().eq('user_id', targetUserId);

      // 3. Supprimer de public.users (avec fallback de désactivation si contrainte d'audit)
      const { error: delUserErr } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', targetUserId)
        .eq('organization_id', user.organizationId);

      if (delUserErr) {
        await supabaseAdmin
          .from('users')
          .update({ is_active: false, organization_id: null })
          .eq('id', targetUserId);
      }

      // 4. Supprimer de auth.users dans Supabase Auth
      try {
        await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      } catch (authDelErr) {
        console.warn(`[API DELETE /organization/users] Note suppression auth.users (${targetUserId}):`, authDelErr);
      }
    }

    // 5. Retirer le membership
    await membershipService.removeMembership(targetUserId, user.organizationId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Profil supprimé et accès révoqué avec succès.',
      userId: targetUserId,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la suppression du profil');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * GET /api/admin/users
 * Récupère tous les comptes utilisateurs créés sur la plateforme SECURIA.
 * Habilitation stricte : Rôle ADMIN uniquement.
 * Filtrage multi-tenant :
 * - Tenant Admin : Uniquement les utilisateurs de son organisation.
 * - Platform Admin : Vue consolidée globale.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const db = await getScopedDatabaseClient(req);
    const { searchParams } = new URL(req.url);

    // 1. Récupérer les utilisateurs
    let query = db
      .from('users')
      .select(`
        id,
        email,
        full_name,
        role,
        phone,
        organization_id,
        security_center_id,
        is_active,
        created_at,
        updated_at,
        organizations:organization_id (
          id,
          name,
          code
        ),
        security_agents (
          id,
          badge_number,
          duty_status,
          patrol_vehicle
        )
      `);

    const paramOrg = searchParams.get('organization_id');
    const targetOrg = (paramOrg && isValidUuid(paramOrg)) ? paramOrg : user.organizationId;

    if (targetOrg && targetOrg !== 'ALL') {
      query = query.eq('organization_id', targetOrg);
    } else if (!user.isPlatformAdmin) {
      return NextResponse.json({
        success: true,
        count: 0,
        users: [],
        organizations: [],
        note: 'Aucune organisation associée à ce compte administrateur',
      });
    }

    const { data: rawUsers, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return safeErrorResponse(error, 'Impossible de récupérer la liste des utilisateurs');
    }

    const users = (rawUsers || []).map((u: any) => ({
      ...u,
      organizations: u.organizations ? {
        ...u.organizations,
        commercial_name: u.organizations.name,
      } : null,
    }));

    // 2. Récupérer la liste des organisations autorisées pour les formulaires d'attribution
    let orgsQuery = db.from('organizations').select('id, name, code');
    if (!user.isPlatformAdmin && user.organizationId) {
      orgsQuery = orgsQuery.eq('id', user.organizationId);
    }
    const { data: rawOrgs } = await orgsQuery.order('name', { ascending: true });
    const orgs = (rawOrgs || []).map((o: any) => ({
      ...o,
      commercial_name: o.name,
    }));

    return NextResponse.json({
      success: true,
      count: users?.length || 0,
      users: users || [],
      organizations: orgs || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des utilisateurs');
  }
}

/**
 * POST /api/admin/users
 * Crée un nouvel utilisateur (avec compte Auth et profil public.users).
 * Habilitation stricte : Rôle ADMIN uniquement.
 * Isolation multi-tenant :
 * - Tenant Admin : Ne peut créer que dans sa propre organisation (user.organizationId).
 * - Platform Admin : Peut créer dans n'importe quelle organisation existante ou sans organisation.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      email,
      full_name,
      phone,
      role = 'USER',
      organization_id,
      password,
      badge_number,
      patrol_vehicle,
      is_active = true,
    } = body;

    // 1. Validation de l'email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Une adresse email valide est obligatoire.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = (full_name || cleanEmail.split('@')[0]).trim();
    const cleanPhone = (phone || '').trim();

    // 2. Validation du rôle
    const validRoles = ['ADMIN', 'SECURITY_MANAGER', 'AGENT', 'USER', 'SECRETARY'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: `Rôle invalide. Rôles autorisés: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // 3. Validation de l'isolation multi-tenant
    let targetOrgId: string | null = null;
    if (user.isPlatformAdmin) {
      targetOrgId = organization_id || user.organizationId || null;
    } else {
      if (!user.organizationId) {
        return NextResponse.json(
          { success: false, error: 'Votre compte administrateur n\'est rattaché à aucune organisation.' },
          { status: 403 }
        );
      }
      targetOrgId = user.organizationId;
    }

    if (targetOrgId && !isValidUuid(targetOrgId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant d\'organisation invalide (UUID attendu).' },
        { status: 400 }
      );
    }

    // 4. Contrôle strict des quotas SaaS de l'organisation
    if (targetOrgId) {
      try {
        const { QuotaService } = await import('@/lib/billing/quota-service');
        const quotaKey = role === 'AGENT' ? 'maxAgents' : 'maxUsers';
        await QuotaService.assertCanConsume(targetOrgId, quotaKey);
      } catch (quotaErr: any) {
        if (quotaErr.code === 'QUOTA_EXCEEDED') {
          return NextResponse.json(
            {
              success: false,
              code: 'QUOTA_EXCEEDED',
              error: quotaErr.message,
              limit: quotaErr.limit,
              current: quotaErr.current,
              plan: quotaErr.plan,
            },
            { status: 403 }
          );
        }
        console.warn('[Admin Create User] Note vérification quota:', quotaErr?.message);
      }
    }

    // 5. Génération sécurisée de mot de passe temporaire
    const generateSecurePassword = () => {
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
      let res = 'Sec@';
      for (let i = 0; i < 8; i++) {
        res += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return res;
    };

    const initialPassword = password && password.trim().length >= 6
      ? password.trim()
      : generateSecurePassword();

    let targetUserId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 6. Création dans Supabase Auth (auth.users)
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      try {
        const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: initialPassword,
          email_confirm: true,
          user_metadata: {
            full_name: cleanFullName,
            phone: cleanPhone,
            role,
            organization_id: targetOrgId,
          },
        });

        if (!authErr && authCreated?.user?.id) {
          targetUserId = authCreated.user.id;
        } else if (authErr) {
          // Si l'utilisateur existe déjà dans auth.users
          const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id, organization_id')
            .eq('email', cleanEmail)
            .maybeSingle();

          // Un admin d'entreprise ne peut pas rattacher à son tenant un compte appartenant à un autre
          if (existingUser?.id && !user.isPlatformAdmin && existingUser.organization_id !== targetOrgId) {
            return NextResponse.json(
              {
                success: false,
                code: 'EMAIL_ALREADY_REGISTERED',
                error: 'Un compte existe déjà avec cette adresse email en dehors de votre organisation.',
              },
              { status: 409 }
            );
          }

          if (existingUser?.id) {
            targetUserId = existingUser.id;
          } else {
            console.warn('[Admin Create User] Erreur auth.admin.createUser:', authErr);
          }
        }
      } catch (authEx) {
        console.warn('[Admin Create User] Exception auth.admin.createUser:', authEx);
      }
    }

    // 6. Insertion / Upsert dans public.users
    const { data: createdProfile, error: dbError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: targetUserId,
        email: cleanEmail,
        full_name: cleanFullName,
        phone: cleanPhone,
        role,
        organization_id: targetOrgId,
        is_active: is_active !== false,
        created_at: now,
        updated_at: now,
      })
      .select('id, email, full_name, role, phone, organization_id, is_active, created_at')
      .single();

    if (dbError) {
      console.error('[Admin Create User] Erreur DB:', dbError);
      return safeErrorResponse(dbError, 'Erreur lors de l\'enregistrement du compte utilisateur');
    }

    // 7. Si le rôle est AGENT, provisionner security_agents
    let agentRecord: any = null;
    if (role === 'AGENT') {
      const badge = badge_number?.trim() || `AGT-${cleanFullName.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      const vehicle = patrol_vehicle?.trim() || 'Véhicule Patrouille Securia';

      const { data: existingAgent } = await supabaseAdmin
        .from('security_agents')
        .select('id, duty_status')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (existingAgent) {
        const { data: updatedAg } = await supabaseAdmin
          .from('security_agents')
          .update({
            organization_id: targetOrgId,
            badge_number: badge,
            patrol_vehicle: vehicle,
            duty_status: existingAgent.duty_status || 'OFF_DUTY',
            is_active: is_active !== false,
            updated_at: now,
          })
          .eq('id', existingAgent.id)
          .select()
          .single();
        agentRecord = updatedAg;
      } else {
        const { data: newAg } = await supabaseAdmin
          .from('security_agents')
          .insert({
            id: crypto.randomUUID(),
            user_id: targetUserId,
            organization_id: targetOrgId,
            badge_number: badge,
            patrol_vehicle: vehicle,
            duty_status: 'OFF_DUTY',
            is_active: is_active !== false,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        agentRecord = newAg;
      }
    }

    // 8. Journalisation d'audit
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_CREATE_USER',
        entity_type: 'USER',
        entity_id: targetUserId,
        details: {
          email: cleanEmail,
          role,
          organization_id: targetOrgId,
          is_active: is_active !== false,
          created_by: user.id,
        },
        created_at: now,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Compte ${cleanEmail} créé avec succès.`,
      user: {
        ...createdProfile,
        security_agents: agentRecord,
      },
      credentials: {
        email: cleanEmail,
        fullName: cleanFullName,
        temporaryPassword: initialPassword,
        loginUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/login`,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la création de l\'utilisateur');
  }
}

/**
 * PATCH /api/admin/users
 * Modifie un compte utilisateur (rôle, activation/désactivation, organisation, téléphone, nom, agent).
 * Habilitation stricte : Rôle ADMIN uniquement.
 * Isolation multi-tenant :
 * - Tenant Admin : Ne peut modifier que les utilisateurs de sa propre organisation.
 * - Platform Admin : Peut modifier n'importe quel utilisateur.
 * Règles de sécurité :
 * - Un administrateur ne peut pas désactiver son propre compte.
 * - Un administrateur ne peut pas révoquer son propre rôle d'administrateur.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.id || body.user_id;

    if (!targetUserId || !isValidUuid(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant utilisateur valide (UUID) obligatoire.' },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur cible
    const { data: targetUser, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, phone, role, organization_id, is_active')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !targetUser) {
      return NextResponse.json({ success: false, error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    // Vérification multi-tenant
    if (!user.isPlatformAdmin && targetUser.organization_id !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé. Vous ne pouvez modifier que les utilisateurs de votre organisation.' },
        { status: 403 }
      );
    }

    // Sécurité : Interdiction d'auto-désactivation ou d'auto-rétrogradation
    const isSelf = targetUserId === user.id;
    if (isSelf && body.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Action interdite : Vous ne pouvez pas désactiver votre propre compte administrateur.' },
        { status: 400 }
      );
    }
    if (isSelf && body.role && body.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Action interdite : Vous ne pouvez pas révoquer votre propre statut d\'administrateur.' },
        { status: 400 }
      );
    }

    // Sécurité Métier : Empêcher la désactivation d'un agent ayant une mission active en cours
    if (body.is_active === false) {
      const { data: agCheck } = await supabaseAdmin
        .from('security_agents')
        .select('id, duty_status')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (agCheck) {
        const { data: activeMissions } = await supabaseAdmin
          .from('interventions')
          .select('id, status')
          .eq('agent_id', agCheck.id)
          .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

        if (activeMissions && activeMissions.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Action refusée : Cet agent est affecté à ${activeMissions.length} intervention(s) active(s) en cours. Veuillez réaffecter ou clôturer ses missions avant de désactiver son compte.`,
            },
            { status: 400 }
          );
        }
      }
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
    };

    if (body.full_name !== undefined) {
      updateData.full_name = String(body.full_name).trim();
    }
    if (body.phone !== undefined) {
      updateData.phone = String(body.phone).trim();
    }
    if (body.role !== undefined) {
      const validRoles = ['ADMIN', 'SECURITY_MANAGER', 'AGENT', 'USER', 'SECRETARY'];
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { success: false, error: `Rôle invalide: ${body.role}` },
          { status: 400 }
        );
      }
      updateData.role = body.role;
    }
    if (body.is_active !== undefined) {
      updateData.is_active = Boolean(body.is_active);
    }
    if (body.organization_id !== undefined) {
      if (user.isPlatformAdmin) {
        updateData.organization_id = body.organization_id ? String(body.organization_id) : null;
      }
    }

    // Mise à jour de public.users
    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', targetUserId)
      .select('id, email, full_name, role, phone, organization_id, is_active, updated_at')
      .single();

    if (updateErr) {
      return safeErrorResponse(updateErr, 'Erreur lors de la mise à jour de l\'utilisateur');
    }

    // Gestion de l'agent de sécurité si le rôle est ou devient AGENT
    const newRole = updateData.role || targetUser.role;
    let agentRecord: any = null;

    if (newRole === 'AGENT') {
      const { data: existingAg } = await supabaseAdmin
        .from('security_agents')
        .select('id, duty_status')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const badge = body.badge_number?.trim();
      const vehicle = body.patrol_vehicle?.trim();
      const agentIsActive = updateData.is_active !== undefined ? updateData.is_active : targetUser.is_active;

      const agUpdateData: Record<string, any> = {
        updated_at: now,
        is_active: agentIsActive,
      };
      if (badge) agUpdateData.badge_number = badge;
      if (vehicle !== undefined) agUpdateData.patrol_vehicle = vehicle;
      if (updateData.organization_id !== undefined) agUpdateData.organization_id = updateData.organization_id;
      if (agentIsActive === false) agUpdateData.duty_status = 'OFF_DUTY';

      if (existingAg) {
        const { data: agRes } = await supabaseAdmin
          .from('security_agents')
          .update(agUpdateData)
          .eq('id', existingAg.id)
          .select()
          .single();
        agentRecord = agRes;
      } else {
        const { data: agRes } = await supabaseAdmin
          .from('security_agents')
          .insert({
            id: crypto.randomUUID(),
            user_id: targetUserId,
            organization_id: updateData.organization_id || targetUser.organization_id,
            badge_number: badge || `AGT-${targetUserId.substring(0, 6).toUpperCase()}`,
            patrol_vehicle: vehicle || 'Véhicule Patrouille',
            duty_status: 'OFF_DUTY',
            is_active: agentIsActive,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        agentRecord = agRes;
      }
    } else if (body.is_active === false) {
      // Si l'utilisateur est désactivé et qu'il avait un profil agent
      await supabaseAdmin
        .from('security_agents')
        .update({ is_active: false, duty_status: 'OFF_DUTY', updated_at: now })
        .eq('user_id', targetUserId);
    }

    // Mise à jour métadonnées auth si service_role actif
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      try {
        const metaUpdates: Record<string, any> = {};
        if (updateData.full_name) metaUpdates.full_name = updateData.full_name;
        if (updateData.phone) metaUpdates.phone = updateData.phone;
        if (updateData.role) metaUpdates.role = updateData.role;
        if (updateData.organization_id !== undefined) metaUpdates.organization_id = updateData.organization_id;

        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          user_metadata: metaUpdates,
        });
      } catch (authErr) {
        console.warn('[Admin Patch User] Note sync auth.admin:', authErr);
      }
    }

    // Journalisation d'audit
    try {
      const auditAction =
        body.is_active !== undefined && body.is_active !== targetUser.is_active
          ? body.is_active
            ? 'ADMIN_ACTIVATE_USER'
            : 'ADMIN_DEACTIVATE_USER'
          : 'ADMIN_UPDATE_USER';

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: auditAction,
        entity_type: 'USER',
        entity_id: targetUserId,
        details: {
          changes: updateData,
          previous: {
            role: targetUser.role,
            is_active: targetUser.is_active,
            organization_id: targetUser.organization_id,
          },
          updated_by: user.id,
        },
        created_at: now,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Compte ${targetUser.email} mis à jour avec succès.`,
      user: {
        ...updatedProfile,
        security_agents: agentRecord,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour de l\'utilisateur');
  }
}

/**
 * DELETE /api/admin/users
 * Supprime un compte utilisateur individuel spécifique.
 * Nettoie en cascade toutes ses dépendances relationnelles (alertes, interventions, patrouilles, sites).
 * Si la clé de service est configurée ou la procédure RPC active, supprime également de auth.users.
 * 
 * SÉCURITÉ P0 : La purge globale est formellement interdite et désactivée.
 * Seule la suppression d'un utilisateur individuel validé par son UUID et son isolation de tenant est autorisée.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    // SÉCURITÉ ABSOLUE : REJET STRICT DE TOUTE TENTATIVE DE PURGE GLOBALE
    const isPurgeAttempt =
      searchParams.get('purge_test_accounts') === 'true' ||
      body.action === 'PURGE_TEST_ACCOUNTS';

    if (isPurgeAttempt) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Action interdite : La purge globale de comptes est définitivement désactivée pour protéger les données de production. Utilisez la suppression individuelle ciblée.',
        },
        { status: 400 }
      );
    }

    const targetUserId = searchParams.get('id') || body.user_id || body.id;

    const db = await getScopedDatabaseClient(req);
    const hasServiceRole = isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const adminDb = hasServiceRole ? supabaseAdmin : db;

    // SUPPRESSION D'UN COMPTE UTILISATEUR INDIVIDUEL (CIBLÉ ET SÉCURISÉ)
    if (!targetUserId || !isValidUuid(targetUserId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant utilisateur valide (UUID) obligatoire.' },
        { status: 400 }
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Action interdite : Vous ne pouvez pas supprimer votre propre compte administrateur.' },
        { status: 400 }
      );
    }

    // Vérifier l'appartenance tenant si l'utilisateur n'est pas Platform Admin
    const { data: targetUser } = await adminDb
      .from('users')
      .select('id, organization_id, role, email')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ success: false, error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    if (!user.isPlatformAdmin && targetUser.organization_id !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé. Vous ne pouvez pas supprimer un utilisateur d\'une autre entreprise.' },
        { status: 403 }
      );
    }

    // Sécurité Métier : Interdiction de supprimer un agent de sécurité avec une mission en cours
    const { data: agCheck } = await adminDb
      .from('security_agents')
      .select('id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (agCheck) {
      const { data: activeMissions } = await adminDb
        .from('interventions')
        .select('id, status')
        .eq('agent_id', agCheck.id)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (activeMissions && activeMissions.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Action refusée : Cet agent est affecté à ${activeMissions.length} intervention(s) active(s). Veuillez réaffecter ou clôturer ses missions avant de supprimer ce compte.`,
          },
          { status: 400 }
        );
      }
    }

    // 1. Tenter la procédure stockée atomique RPC si installée
    try {
      const { data: rpcRes, error: rpcErr } = await (db as any).rpc('admin_delete_user_account', {
        p_target_user_id: targetUserId,
      });
      if (!rpcErr && rpcRes && rpcRes.success) {
        return NextResponse.json({
          success: true,
          message: 'Compte utilisateur et données associées supprimés avec succès (RPC).',
          authDeleted: true,
        });
      }
    } catch {
      // Fallback cascade applicative
    }

    // 2. Cascade applicative
    await adminDb.from('notifications').delete().eq('user_id', targetUserId);

    const { data: userAlerts } = await adminDb.from('alerts').select('id').eq('user_id', targetUserId);
    const alertIds = (userAlerts || []).map((a) => a.id);

    if (alertIds.length > 0) {
      await adminDb.from('alert_events').delete().in('alert_id', alertIds);
      await adminDb.from('interventions').delete().in('alert_id', alertIds);
      await adminDb.from('alerts').delete().in('id', alertIds);
    }

    const { data: agentRec } = await adminDb.from('security_agents').select('id').eq('user_id', targetUserId).maybeSingle();
    if (agentRec) {
      await adminDb.from('interventions').delete().eq('agent_id', agentRec.id);
      await adminDb.from('security_agents').delete().eq('id', agentRec.id);
    }

    await adminDb.from('alert_events').delete().eq('actor_id', targetUserId);
    await adminDb.from('site_members').delete().eq('user_id', targetUserId);
    await adminDb.from('emergency_contacts').delete().eq('user_id', targetUserId);
    await adminDb.from('protected_sites').delete().eq('owner_id', targetUserId);

    const { error: delUserError } = await adminDb.from('users').delete().eq('id', targetUserId);
    if (delUserError) {
      return safeErrorResponse(delUserError, 'Erreur lors de la suppression du profil utilisateur');
    }

    let authDeleted = false;
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(targetUserId);
        authDeleted = true;
      } catch (authEx) {
        console.warn(`[Admin Delete User] Erreur auth.admin.deleteUser (${targetUserId}):`, authEx);
      }
    }

    // Journalisation d'audit
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_DELETE_USER',
        entity_type: 'USER',
        entity_id: targetUserId,
        details: {
          email: targetUser.email,
          role: targetUser.role,
          organization_id: targetUser.organization_id,
          deleted_by: user.id,
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Compte utilisateur et données associées supprimés avec succès.',
      authDeleted,
      authRequiresSqlNotice: !authDeleted,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la suppression de l’utilisateur');
  }
}

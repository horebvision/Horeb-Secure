import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  safeErrorResponse,
  getTenantOrgId,
} from '@/lib/security/api-guard';

const DEFAULT_CENTER_ID = '202a6970-8afb-44cf-9455-aa16e2c7cbd1';

/**
 * PATCH /api/agent/duty-status
 * Modifie le statut de garde de l'agent (AVAILABLE / BUSY / OFF_DUTY).
 * Enregistre la modification avec vérification stricte des permissions.
 */
export async function PATCH(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls l'agent lui-même ou les superviseurs peuvent changer son statut
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Accès refusé. Habilitation insuffisante.' }, { status: 403 })
      );
    }

    const body = await req.json();
    const dutyStatus = body.duty_status;

    if (!['AVAILABLE', 'BUSY', 'OFF_DUTY', 'DISPATCHED'].includes(dutyStatus)) {
      return NextResponse.json(
        { error: 'Statut de garde invalide. Valeurs permises: AVAILABLE, BUSY, OFF_DUTY' },
        { status: 400 }
      );
    }

    let targetAgentId = body.agent_id;
    const db = await getScopedDatabaseClient(req);

    // Si c'est un agent connecté, cibler son propre compte
    if (user.role === 'AGENT') {
      const { data: agentRec } = await db
        .from('security_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (agentRec) {
        targetAgentId = agentRec.id;
      }
    }

    if (!targetAgentId) {
      return NextResponse.json(
        { error: 'Identifiant d’agent requis pour la mise à jour.' },
        { status: 400 }
      );
    }

    // Mise à jour directe de security_agents
    const updatePayload: any = {
      duty_status: dutyStatus,
      updated_at: new Date().toISOString(),
    };

    if (body.latitude !== undefined && body.longitude !== undefined) {
      const lat = Number(body.latitude);
      const lon = Number(body.longitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        updatePayload.current_latitude = lat;
        updatePayload.current_longitude = lon;
        updatePayload.last_location_update = new Date().toISOString();
      }
    }

    const { data: updatedAgent, error: updateErr } = await db
      .from('security_agents')
      .update(updatePayload)
      .eq('id', targetAgentId)
      .select('id, user_id, badge_number, duty_status, current_latitude, current_longitude')
      .maybeSingle();

    if (updateErr) {
      return safeErrorResponse(updateErr, 'Erreur lors de la mise à jour du statut de garde');
    }

    return NextResponse.json({
      success: true,
      agent: updatedAgent,
      agent_id: targetAgentId,
      duty_status: dutyStatus,
      updated_at: new Date().toISOString(),
      message: `Statut de garde mis à jour : ${dutyStatus}`,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour du statut');
  }
}

/**
 * GET /api/agent/duty-status
 * Retourne la liste réelle des agents de sécurité de l'organisation.
 * Auto-provisionne les agents inscrits dans public.users s'ils n'ont pas encore de fiche.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Accès refusé. Habilitation insuffisante.' }, { status: 403 })
      );
    }

    const orgId = getTenantOrgId(user);
    const hasOrgOverride = Boolean(req.cookies.get('securia_org_id')?.value);
    const isSuperAdminAll = user.isPlatformAdmin && !hasOrgOverride;

    const db = await getScopedDatabaseClient(req);

    // 1. Auto-provisioning : Vérifier si des utilisateurs actifs role=AGENT existent sans fiche security_agents
    let agentUsersQuery = db
      .from('users')
      .select('id, full_name, email, phone, organization_id, security_center_id')
      .eq('role', 'AGENT')
      .eq('is_active', true);
    
    if (!isSuperAdminAll) {
      agentUsersQuery = agentUsersQuery.eq('organization_id', orgId);
    }

    const { data: agentUsers } = await agentUsersQuery;

    if (agentUsers && agentUsers.length > 0) {
      for (const u of agentUsers) {
        // Use scoped client for provisioning — RLS INSERT policy requires SECURITY_MANAGER/ADMIN
        const { data: existingAgent } = await db
          .from('security_agents')
          .select('id')
          .eq('user_id', u.id)
          .maybeSingle();

        if (!existingAgent) {
          const badge = `AGT-${u.id.substring(0, 6).toUpperCase()}`;
          await db.from('security_agents').insert({
            user_id: u.id,
            organization_id: u.organization_id || orgId,
            security_center_id: u.security_center_id || DEFAULT_CENTER_ID,
            badge_number: badge,
            duty_status: 'AVAILABLE',
            patrol_vehicle: 'Patrouille Alpha Securia',
            is_active: true,
          });
        }
      }
    }

    // 2. Récupération exhaustive des agents de l'organisation
    let agentsQuery = db
      .from('security_agents')
      .select(`
        id,
        user_id,
        badge_number,
        duty_status,
        patrol_vehicle,
        current_latitude,
        current_longitude,
        last_location_update,
        is_active,
        organization_id,
        users:user_id (
          id,
          full_name,
          email,
          phone,
          role
        )
      `)
      .eq('is_active', true);

    if (!isSuperAdminAll) {
      agentsQuery = agentsQuery.eq('organization_id', orgId);
    }

    const { data: dbAgents, error } = await agentsQuery;

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération des agents');
    }

    const formattedAgents = (dbAgents || []).map((ag: any) => {
      const lat = ag.current_latitude !== null && ag.current_latitude !== undefined ? Number(ag.current_latitude) : null;
      const lon = ag.current_longitude !== null && ag.current_longitude !== undefined ? Number(ag.current_longitude) : null;
      const hasValidCoords = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);

      return {
        id: ag.id,
        user_id: ag.user_id,
        full_name: ag.users?.full_name || `Agent ${ag.badge_number}`,
        email: ag.users?.email || '',
        phone: ag.users?.phone || '',
        role: 'AGENT' as const,
        badge_number: ag.badge_number,
        agent_status: ag.duty_status || 'AVAILABLE',
        duty_status: ag.duty_status || 'AVAILABLE',
        patrol_vehicle: ag.patrol_vehicle || 'Patrouille d’intervention',
        latitude: hasValidCoords ? lat : null,
        longitude: hasValidCoords ? lon : null,
        current_latitude: hasValidCoords ? lat : null,
        current_longitude: hasValidCoords ? lon : null,
        last_location_update: ag.last_location_update || ag.updated_at,
        has_gps: hasValidCoords,
        organization_id: ag.organization_id,
      };
    });

    return NextResponse.json({
      success: true,
      agents: formattedAgents,
      count: formattedAgents.length,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des agents');
  }
}

/**
 * DELETE /api/agent/duty-status
 * Retire un agent de la flotte active (réservé aux superviseurs et administrateurs).
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Accès refusé. Habilitation insuffisante.' }, { status: 403 })
      );
    }

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const targetAgentId = searchParams.get('agent_id') || body.agent_id || searchParams.get('id') || body.id;

    if (!targetAgentId) {
      return NextResponse.json({ error: 'Identifiant agent requis' }, { status: 400 });
    }

    const db = await getScopedDatabaseClient(req);

    // 1. Récupérer l'agent
    const { data: agentRec } = await db
      .from('security_agents')
      .select('id, user_id, organization_id')
      .or(`id.eq.${targetAgentId},user_id.eq.${targetAgentId}`)
      .maybeSingle();

    if (!agentRec) {
      return NextResponse.json({ success: true, message: 'Agent introuvable ou déjà retiré' });
    }

    // Vérifier l'organisation
    if (agentRec.organization_id !== user.organizationId && !user.isPlatformAdmin) {
      return NextResponse.json({ error: 'Accès refusé pour cette organisation' }, { status: 403 });
    }

    // Détacher les alertes
    await db
      .from('alerts')
      .update({ assigned_agent_id: null })
      .eq('assigned_agent_id', agentRec.id);

    // Supprimer la fiche agent
    await db.from('security_agents').delete().eq('id', agentRec.id);

    // Si un user_id est lié, supprimer ou désactiver dans users
    if (agentRec.user_id) {
      await db
        .from('users')
        .delete()
        .eq('id', agentRec.user_id)
        .eq('organization_id', user.organizationId);
    }

    return NextResponse.json({
      success: true,
      message: 'Agent retiré de la flotte avec succès',
      agent_id: agentRec.id,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du retrait de l’agent');
  }
}


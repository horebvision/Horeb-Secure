import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/agents
 * Récupère la liste réelle des agents de sécurité de la plateforme SECURIA.
 * Habilitation stricte : Rôle ADMIN uniquement.
 * Filtrage multi-tenant :
 * - Tenant Admin : Uniquement les agents de sa propre organisation.
 * - Platform Admin : Vue consolidée globale avec filtrage par organisation optionnel.
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

    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get('search')?.trim().toLowerCase() || '';
    const dutyStatusFilter = searchParams.get('duty_status');
    const isActiveFilter = searchParams.get('is_active');
    const orgFilter = searchParams.get('organization_id');
    const centerFilter = searchParams.get('security_center_id');

    const db = await getScopedDatabaseClient(req);

    // 1. Requête principale des agents de sécurité
    let query = db
      .from('security_agents')
      .select(`
        id,
        user_id,
        organization_id,
        security_center_id,
        badge_number,
        duty_status,
        patrol_vehicle,
        current_latitude,
        current_longitude,
        last_location_update,
        is_active,
        created_at,
        updated_at,
        user:users!user_id (
          id,
          email,
          full_name,
          phone,
          role,
          is_active,
          avatar_url,
          created_at
        ),
        organization:organizations!organization_id (
          id,
          name,
          code
        ),
        security_center:security_centers!security_center_id (
          id,
          name,
          code,
          city
        )
      `);

    // Cloisonnement multi-tenant strict
    const targetOrg = (user.isPlatformAdmin && orgFilter && orgFilter !== 'ALL' && isValidUuid(orgFilter)) ? orgFilter : user.organizationId;
    if (targetOrg && targetOrg !== 'ALL') {
      query = query.eq('organization_id', targetOrg);
    } else if (!user.isPlatformAdmin) {
      return NextResponse.json({
        success: true,
        count: 0,
        agents: [],
        organizations: [],
        securityCenters: [],
      });
    }

    if (dutyStatusFilter && dutyStatusFilter !== 'ALL') {
      query = query.eq('duty_status', dutyStatusFilter);
    }

    if (isActiveFilter === 'true') {
      query = query.eq('is_active', true);
    } else if (isActiveFilter === 'false') {
      query = query.eq('is_active', false);
    }

    if (centerFilter && centerFilter !== 'ALL' && isValidUuid(centerFilter)) {
      query = query.eq('security_center_id', centerFilter);
    }

    const { data: rawAgents, error: agentsErr } = await query.order('created_at', { ascending: false });

    if (agentsErr) {
      return safeErrorResponse(agentsErr, 'Erreur lors de la récupération des agents de sécurité');
    }

    let agents = rawAgents || [];

    // Filtrage textuel applicatif (nom, email, téléphone, matricule, véhicule)
    if (searchQuery) {
      agents = agents.filter((a: any) => {
        const name = (a.user?.full_name || '').toLowerCase();
        const email = (a.user?.email || '').toLowerCase();
        const phone = (a.user?.phone || '').toLowerCase();
        const badge = (a.badge_number || '').toLowerCase();
        const vehicle = (a.patrol_vehicle || '').toLowerCase();
        const orgName = (a.organization?.name || '').toLowerCase();
        const centerName = (a.security_center?.name || '').toLowerCase();

        return (
          name.includes(searchQuery) ||
          email.includes(searchQuery) ||
          phone.includes(searchQuery) ||
          badge.includes(searchQuery) ||
          vehicle.includes(searchQuery) ||
          orgName.includes(searchQuery) ||
          centerName.includes(searchQuery)
        );
      });
    }

    // 2. Récupérer les interventions actives en cours pour chaque agent
    const agentIds = agents.map((a: any) => a.id).filter(Boolean);
    let activeInterventionsMap: Record<string, any> = {};

    if (agentIds.length > 0) {
      const { data: activeMissions } = await db
        .from('interventions')
        .select(`
          id,
          agent_id,
          alert_id,
          status,
          assigned_at,
          accepted_at,
          en_route_at,
          arrived_at,
          alerts:alert_id (
            id,
            alert_number,
            type,
            status,
            location_address
          )
        `)
        .in('agent_id', agentIds)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (activeMissions) {
        for (const m of activeMissions) {
          if (m.agent_id && !activeInterventionsMap[m.agent_id]) {
            activeInterventionsMap[m.agent_id] = m;
          }
        }
      }
    }

    const enrichedAgents = agents.map((a: any) => ({
      ...a,
      organization: a.organization ? {
        ...a.organization,
        commercial_name: a.organization.name,
      } : null,
      active_mission: activeInterventionsMap[a.id] || null,
    }));

    // 3. Récupérer les organisations et centres de sécurité autorisés pour les filtres et modales
    let orgsQuery = db.from('organizations').select('id, name, code');
    let centersQuery = db.from('security_centers').select('id, name, code, organization_id, city, is_active');

    if (!user.isPlatformAdmin && user.organizationId) {
      orgsQuery = orgsQuery.eq('id', user.organizationId);
      centersQuery = centersQuery.eq('organization_id', user.organizationId);
    }

    const [{ data: rawOrgs }, { data: centers }] = await Promise.all([
      orgsQuery.order('name', { ascending: true }),
      centersQuery.order('name', { ascending: true }),
    ]);

    const orgs = (rawOrgs || []).map((o: any) => ({
      ...o,
      commercial_name: o.name,
    }));

    return NextResponse.json({
      success: true,
      count: enrichedAgents.length,
      agents: enrichedAgents,
      organizations: orgs || [],
      securityCenters: centers || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des agents');
  }
}

/**
 * PATCH /api/admin/agents
 * Met à jour un agent de sécurité (matricule, véhicule, centre de sécurité, statut opérationnel, activation).
 * Synchronise les données avec le profil public.users associé.
 * Respecte l'isolation multi-tenant et la règle métier interdisant la désactivation silencieuse
 * en cas de mission d'intervention en cours.
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
    const targetAgentId = body.id || body.agent_id;

    if (!targetAgentId || !isValidUuid(targetAgentId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant agent valide (UUID) obligatoire.' },
        { status: 400 }
      );
    }

    // 1. Récupération de la fiche agent
    const { data: targetAgent, error: fetchErr } = await supabaseAdmin
      .from('security_agents')
      .select('id, user_id, organization_id, security_center_id, badge_number, duty_status, patrol_vehicle, is_active')
      .or(`id.eq.${targetAgentId},user_id.eq.${targetAgentId}`)
      .maybeSingle();

    if (fetchErr || !targetAgent) {
      return NextResponse.json(
        { success: false, error: 'Fiche d\'agent de sécurité introuvable.' },
        { status: 404 }
      );
    }

    // 2. Contrôle d'isolation multi-tenant
    if (!user.isPlatformAdmin && targetAgent.organization_id !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé. Vous ne pouvez modifier que les agents de votre organisation.' },
        { status: 403 }
      );
    }

    // 3. Règle Métier Sécurité : Empêcher la désactivation ou la mise hors service si une mission est active
    const isDeactivationRequested = body.is_active === false;
    const isOffDutyRequested = body.duty_status === 'OFF_DUTY';

    if (isDeactivationRequested || isOffDutyRequested) {
      const { data: activeMissions } = await supabaseAdmin
        .from('interventions')
        .select('id, status, alert_id')
        .eq('agent_id', targetAgent.id)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (activeMissions && activeMissions.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Action refusée : Cet agent est affecté à ${activeMissions.length} intervention(s) en cours d'exécution. Veuillez réaffecter ou clôturer la mission avant de modifier son statut opérationnel ou de désactiver son compte.`,
            code: 'ACTIVE_INTERVENTION_CONFLICT',
          },
          { status: 400 }
        );
      }
    }

    // 4. Validation du matricule (unicité)
    if (body.badge_number !== undefined) {
      const cleanBadge = String(body.badge_number).trim();
      if (!cleanBadge) {
        return NextResponse.json(
          { success: false, error: 'Le matricule (badge) ne peut pas être vide.' },
          { status: 400 }
        );
      }

      const { data: badgeConflict } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .eq('badge_number', cleanBadge)
        .neq('id', targetAgent.id)
        .maybeSingle();

      if (badgeConflict) {
        return NextResponse.json(
          { success: false, error: `Le matricule "${cleanBadge}" est déjà attribué à un autre agent.` },
          { status: 409 }
        );
      }
    }

    // 5. Validation du centre de sécurité
    let targetCenterId = targetAgent.security_center_id;
    if (body.security_center_id !== undefined) {
      if (body.security_center_id === null || body.security_center_id === '') {
        targetCenterId = null;
      } else {
        if (!isValidUuid(body.security_center_id)) {
          return NextResponse.json(
            { success: false, error: 'Identifiant de centre de sécurité invalide.' },
            { status: 400 }
          );
        }

        const { data: center } = await supabaseAdmin
          .from('security_centers')
          .select('id, organization_id')
          .eq('id', body.security_center_id)
          .maybeSingle();

        if (!center) {
          return NextResponse.json(
            { success: false, error: 'Centre de sécurité introuvable.' },
            { status: 404 }
          );
        }

        const targetOrg =
          user.isPlatformAdmin && body.organization_id ? body.organization_id : targetAgent.organization_id;
        if (center.organization_id !== targetOrg) {
          return NextResponse.json(
            { success: false, error: 'Le centre de sécurité sélectionné n\'appartient pas à l\'organisation de l\'agent.' },
            { status: 400 }
          );
        }

        targetCenterId = center.id;
      }
    }

    // 6. Validation du statut opérationnel (Règle : jamais 'AVAILABLE' automatiquement lors d'une simple activation)
    const validDutyStatuses = ['OFF_DUTY', 'AVAILABLE', 'BUSY', 'DISPATCHED'];
    let targetDutyStatus = targetAgent.duty_status;

    if (body.duty_status !== undefined) {
      if (!validDutyStatuses.includes(body.duty_status)) {
        return NextResponse.json(
          { success: false, error: `Statut opérationnel invalide: ${body.duty_status}` },
          { status: 400 }
        );
      }
      targetDutyStatus = body.duty_status;
    } else if (body.is_active === false) {
      targetDutyStatus = 'OFF_DUTY';
    }

    // Vérification de quota si réactivation de l'agent
    if (body.is_active === true && targetAgent.is_active === false) {
      try {
        const { QuotaService } = await import('@/lib/billing/quota-service');
        await QuotaService.assertCanConsume(targetAgent.organization_id, 'maxAgents');
      } catch (quotaErr: any) {
        if (quotaErr.code === 'QUOTA_EXCEEDED') {
          return NextResponse.json(
            {
              success: false,
              code: 'QUOTA_EXCEEDED',
              error: quotaErr.message,
              limit: quotaErr.limit,
              current: quotaErr.current,
            },
            { status: 403 }
          );
        }
      }
    }

    const now = new Date().toISOString();

    // 7. Mise à jour de la table security_agents
    const agentUpdatePayload: Record<string, any> = {
      updated_at: now,
    };

    if (body.badge_number !== undefined) {
      agentUpdatePayload.badge_number = String(body.badge_number).trim();
    }
    if (body.patrol_vehicle !== undefined) {
      agentUpdatePayload.patrol_vehicle = body.patrol_vehicle ? String(body.patrol_vehicle).trim() : null;
    }
    if (body.security_center_id !== undefined) {
      agentUpdatePayload.security_center_id = targetCenterId;
    }
    if (body.duty_status !== undefined || body.is_active === false) {
      agentUpdatePayload.duty_status = targetDutyStatus;
    }
    if (body.is_active !== undefined) {
      agentUpdatePayload.is_active = Boolean(body.is_active);
    }
    if (user.isPlatformAdmin && body.organization_id) {
      agentUpdatePayload.organization_id = body.organization_id;
    }

    const { data: updatedAgent, error: agentUpdateErr } = await supabaseAdmin
      .from('security_agents')
      .update(agentUpdatePayload)
      .eq('id', targetAgent.id)
      .select()
      .single();

    if (agentUpdateErr) {
      return safeErrorResponse(agentUpdateErr, 'Erreur lors de la mise à jour de la fiche agent');
    }

    // 8. Synchronisation avec public.users
    const userUpdatePayload: Record<string, any> = {
      updated_at: now,
    };

    if (body.full_name !== undefined && String(body.full_name).trim()) {
      userUpdatePayload.full_name = String(body.full_name).trim();
    }
    if (body.phone !== undefined) {
      userUpdatePayload.phone = body.phone ? String(body.phone).trim() : null;
    }
    if (body.is_active !== undefined) {
      userUpdatePayload.is_active = Boolean(body.is_active);
    }
    if (body.security_center_id !== undefined) {
      userUpdatePayload.security_center_id = targetCenterId;
    }
    if (user.isPlatformAdmin && body.organization_id) {
      userUpdatePayload.organization_id = body.organization_id;
    }

    if (Object.keys(userUpdatePayload).length > 1) {
      await supabaseAdmin
        .from('users')
        .update(userUpdatePayload)
        .eq('id', targetAgent.user_id);
    }

    // 9. Journalisation d'audit
    try {
      const auditAction =
        body.is_active !== undefined && body.is_active !== targetAgent.is_active
          ? body.is_active
            ? 'ADMIN_ACTIVATE_SECURITY_AGENT'
            : 'ADMIN_DEACTIVATE_SECURITY_AGENT'
          : 'ADMIN_UPDATE_SECURITY_AGENT';

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: auditAction,
        entity_type: 'SECURITY_AGENT',
        entity_id: targetAgent.id,
        details: {
          badge_number: updatedAgent.badge_number,
          duty_status: updatedAgent.duty_status,
          is_active: updatedAgent.is_active,
          organization_id: updatedAgent.organization_id,
          security_center_id: updatedAgent.security_center_id,
          previous_duty_status: targetAgent.duty_status,
          previous_active: targetAgent.is_active,
        },
        created_at: now,
      });
    } catch (auditErr) {
      console.warn('[PATCH /api/admin/agents] Note audit log:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: `Fiche agent (${updatedAgent.badge_number}) mise à jour avec succès.`,
      agent: updatedAgent,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour de l\'agent');
  }
}

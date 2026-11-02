import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * GET /api/agent/dashboard
 * Récupère l'ensemble des données du tableau de bord de l'agent de manière strictement cloisonnée :
 * - Profil agent et statut de service (AVAILABLE, BUSY, OFF_DUTY)
 * - Alerte active en cours (avec site, digicode, localisation GPS, client, intervention)
 * - Liste et historique des interventions de cet agent
 * Isolation stricte par organisation et agent.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès refusé. Habilitation insuffisante.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // Si un agent réel est connecté, il ne peut voir QUE son propre tableau de bord (anti-IDOR)
    let agentIdentifier = searchParams.get('agent_id') || searchParams.get('user_id');

    if (user.role === 'AGENT') {
      agentIdentifier = user.id;

      // Auto-provisioning sécurisé de la fiche security_agents via supabaseAdmin si absente
      const { data: existingAg } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingAg) {
        const badge = `AGT-${user.id.substring(0, 6).toUpperCase()}`;
        const targetOrg = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
        const { data: center } = await supabaseAdmin
          .from('security_centers')
          .select('id')
          .eq('organization_id', targetOrg)
          .maybeSingle();

        await supabaseAdmin.from('security_agents').insert({
          user_id: user.id,
          organization_id: targetOrg,
          security_center_id: user.securityCenterId || center?.id || null,
          badge_number: badge,
          duty_status: 'AVAILABLE',
          patrol_vehicle: 'Patrouille Alpha Securia',
          is_active: true,
        });
      }
    }

    if (!agentIdentifier) {
      // Pour régulateur / admin sans agent spécifié, résoudre le premier agent de l'organisation
      const { data: firstAgent } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .eq('organization_id', user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517')
        .limit(1)
        .maybeSingle();

      agentIdentifier = firstAgent?.id || null;
    }

    if (!agentIdentifier) {
      return NextResponse.json({
        success: true,
        agent: null,
        active_alert: null,
        interventions: [],
        message: 'Aucun agent de patrouille assigné pour le moment.',
      });
    }

    // 1. Tenter l'appel de la procédure stockée PostgreSQL
    const db = await getScopedDatabaseClient(req);
    let rpcData: any = null;

    try {
      const { data, error } = await db.rpc('get_agent_dashboard_data', {
        p_agent_identifier: agentIdentifier,
      });
      if (!error && data && !data.error) {
        rpcData = data;
      }
    } catch {
      rpcData = null;
    }

    // 2. Si la procédure stockée a fonctionné et a retourné un agent, vérifier l'isolation tenant et renvoyer
    if (rpcData?.agent) {
      if (
        user.role !== 'ADMIN' &&
        user.organizationId &&
        rpcData.agent.organization_id &&
        rpcData.agent.organization_id !== user.organizationId
      ) {
        return NextResponse.json(
          { error: 'Accès refusé : Cet agent appartient à une autre organisation.' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        agent: rpcData.agent,
        active_alert: rpcData.active_alert,
        interventions: rpcData.interventions || [],
      });
    }

    // 3. Fallback direct et relationnel avec supabaseAdmin
    const { data: agentRec } = await supabaseAdmin
      .from('security_agents')
      .select(`
        id,
        user_id,
        badge_number,
        duty_status,
        patrol_vehicle,
        organization_id,
        security_center_id,
        users:user_id (
          full_name,
          email,
          phone
        )
      `)
      .or(`id.eq.${agentIdentifier},user_id.eq.${agentIdentifier}`)
      .maybeSingle();

    if (!agentRec) {
      return NextResponse.json({ error: 'Agent introuvable' }, { status: 404 });
    }

    if (
      user.role !== 'ADMIN' &&
      user.organizationId &&
      agentRec.organization_id &&
      agentRec.organization_id !== user.organizationId
    ) {
      return NextResponse.json(
        { error: 'Accès refusé : Cet agent appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    const formattedAgent = {
      id: agentRec.id,
      user_id: agentRec.user_id,
      badge_number: agentRec.badge_number,
      duty_status: agentRec.duty_status,
      patrol_vehicle: agentRec.patrol_vehicle,
      organization_id: agentRec.organization_id,
      security_center_id: agentRec.security_center_id,
      full_name: (agentRec.users as any)?.full_name || user.fullName,
      email: (agentRec.users as any)?.email || user.email,
      phone: (agentRec.users as any)?.phone || '',
    };

    // Récupérer l'alerte active assignée
    const { data: dbAlerts } = await supabaseAdmin
      .from('alerts')
      .select(`
        id,
        alert_number,
        type,
        priority,
        status,
        created_at,
        latitude,
        longitude,
        location_address,
        client_notes,
        users:user_id (
          full_name,
          phone,
          email
        ),
        protected_sites (
          name,
          address,
          city,
          postal_code,
          latitude,
          longitude,
          access_instructions
        )
      `)
      .or(`assigned_agent_id.eq.${agentRec.id},assigned_agent_id.eq.${agentRec.user_id}`)
      .not('status', 'in', '("RESOLVED","CANCELLED","FALSE_ALARM")')
      .order('created_at', { ascending: false })
      .limit(1);

    let activeAlert: any = null;
    const rawAlert = dbAlerts?.[0];

    if (rawAlert) {
      // Trouver l'intervention associée
      const { data: dbIntervention } = await supabaseAdmin
        .from('interventions')
        .select('id, status, assigned_at, accepted_at, en_route_at, arrived_at, resolved_at, report')
        .eq('alert_id', rawAlert.id)
        .or(`agent_id.eq.${agentRec.id},agent_id.eq.${agentRec.user_id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      activeAlert = {
        id: rawAlert.id,
        alert_number: rawAlert.alert_number,
        type: rawAlert.type,
        priority: rawAlert.priority,
        status: rawAlert.status,
        created_at: rawAlert.created_at,
        latitude: rawAlert.latitude,
        longitude: rawAlert.longitude,
        location_address: rawAlert.location_address,
        client_notes: rawAlert.client_notes,
        client: rawAlert.users,
        site: rawAlert.protected_sites,
        intervention: dbIntervention || null,
      };
    }

    // Récupérer l'historique complet des interventions pour cet agent
    const { data: dbInterventions } = await supabaseAdmin
      .from('interventions')
      .select(`
        id,
        status,
        assigned_at,
        accepted_at,
        en_route_at,
        arrived_at,
        resolved_at,
        report,
        created_at,
        alerts:alert_id (
          id,
          alert_number,
          type,
          priority,
          status,
          created_at,
          location_address,
          protected_sites (name, address),
          users:user_id (full_name)
        )
      `)
      .or(`agent_id.eq.${agentRec.id},agent_id.eq.${agentRec.user_id}`)
      .order('created_at', { ascending: false });

    const formattedInterventions = (dbInterventions || []).map((item: any) => ({
      id: item.id,
      status: item.status,
      assigned_at: item.assigned_at,
      accepted_at: item.accepted_at,
      en_route_at: item.en_route_at,
      arrived_at: item.arrived_at,
      resolved_at: item.resolved_at,
      report: item.report,
      created_at: item.created_at,
      alert: item.alerts
        ? {
            id: item.alerts.id,
            alert_number: item.alerts.alert_number,
            type: item.alerts.type,
            priority: item.alerts.priority,
            status: item.alerts.status,
            created_at: item.alerts.created_at,
            location_address: item.alerts.location_address,
            site_name: item.alerts.protected_sites?.name,
            site_address: item.alerts.protected_sites?.address,
            client_name: item.alerts.users?.full_name,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      agent: formattedAgent,
      active_alert: activeAlert,
      interventions: formattedInterventions,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors du traitement du tableau de bord agent');
  }
}

/**
 * SECURIA V2 — SMART DISPATCH SERVICE
 * Récupération des candidats en base de données, isolation organisationnelle
 * et génération de la recommandation opérationnelle.
 * RÈGLE : Zéro requête N+1, filtrage strict par organization_id côté serveur.
 */

import {
  DispatchAgentInput,
  DispatchAlertInput,
  SmartDispatchRecommendation,
  DispatchContext,
} from './dispatch-types';
import { generateSmartDispatchRecommendation } from './dispatch-engine';
import { isValidUuid } from '@/lib/security/api-guard';

export class SmartDispatchService {
  /**
   * Récupère l'alerte, ses candidats éligibles et calcule la recommandation optimale.
   * @param alertId Identifiant UUID de l'alerte
   * @param db Client Supabase (scoped ou admin)
   * @param callerOrgId Organisation de l'utilisateur appelant (pour contrôle anti-IDOR)
   * @param isSuperAdmin Vrai si rôle ADMIN avec droit multi-organisation
   */
  public static async getRecommendationForAlert(
    alertId: string,
    db: any,
    callerOrgId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<SmartDispatchRecommendation> {
    if (!alertId || !isValidUuid(alertId)) {
      throw new Error('Identifiant d’alerte (UUID) invalide.');
    }

    // 1. Récupération de l'alerte avec son site protégé et son déclarant
    const { data: alert, error: alertErr } = await db
      .from('alerts')
      .select(`
        id,
        alert_number,
        organization_id,
        security_center_id,
        type,
        priority,
        status,
        latitude,
        longitude,
        location_address,
        client_notes,
        assigned_agent_id,
        created_at,
        user:users!user_id(id, full_name, phone),
        site:protected_sites!site_id(id, name, address, latitude, longitude),
        security_center:security_centers!security_center_id(id, name, code, is_active)
      `)
      .eq('id', alertId)
      .maybeSingle();

    if (alertErr || !alert) {
      throw new Error('Alerte de sécurité introuvable.');
    }

    // 2. Contrôle strict d'isolation organisationnelle
    const targetOrgId = alert.organization_id;
    if (!isSuperAdmin && callerOrgId && targetOrgId && callerOrgId !== targetOrgId) {
      throw new Error('Accès refusé : Cette alerte appartient à une autre organisation.');
    }

    // Résolution des coordonnées géographiques (Appareil déclarant ou Site protégé)
    const effectiveLat =
      alert.latitude !== null && alert.latitude !== undefined && !isNaN(Number(alert.latitude))
        ? Number(alert.latitude)
        : alert.site?.latitude !== null && alert.site?.latitude !== undefined
        ? Number(alert.site.latitude)
        : null;

    const effectiveLon =
      alert.longitude !== null && alert.longitude !== undefined && !isNaN(Number(alert.longitude))
        ? Number(alert.longitude)
        : alert.site?.longitude !== null && alert.site?.longitude !== undefined
        ? Number(alert.site.longitude)
        : null;

    const alertInput: DispatchAlertInput = {
      id: alert.id,
      alertNumber: alert.alert_number,
      organizationId: targetOrgId || '',
      type: alert.type,
      priority: alert.priority,
      status: alert.status,
      latitude: effectiveLat,
      longitude: effectiveLon,
      locationAddress: alert.location_address || alert.site?.address || 'Position d’urgence',
      clientNotes: alert.client_notes,
      assignedAgentId: alert.assigned_agent_id,
      createdAt: alert.created_at,
      siteName: alert.site?.name,
      clientName: alert.user?.full_name,
    };

    // 3. Récupération optimisée de tous les agents de la MÊME organisation
    let agentsQuery = db
      .from('security_agents')
      .select(`
        id,
        user_id,
        organization_id,
        badge_number,
        duty_status,
        patrol_vehicle,
        current_latitude,
        current_longitude,
        last_location_update,
        is_active,
        user:users!user_id(id, full_name, phone, email, role, is_active)
      `)
      .eq('is_active', true);

    if (targetOrgId) {
      agentsQuery = agentsQuery.eq('organization_id', targetOrgId);
    }

    const { data: rawAgents, error: agentsErr } = await agentsQuery;

    if (agentsErr) {
      throw new Error(`Erreur lors de la récupération des agents : ${agentsErr.message}`);
    }

    const candidateAgents = rawAgents || [];

    // 4. Batch query pour calculer la charge opérationnelle de chaque agent (Anti N+1)
    const agentIds = candidateAgents.map((ag: any) => ag.id);
    const activeInterventionsMap = new Map<string, number>();

    if (agentIds.length > 0) {
      const { data: ongoingInterventions } = await db
        .from('interventions')
        .select('id, agent_id, status')
        .in('agent_id', agentIds)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      (ongoingInterventions || []).forEach((item: any) => {
        const currentCount = activeInterventionsMap.get(item.agent_id) || 0;
        activeInterventionsMap.set(item.agent_id, currentCount + 1);
      });
    }

    // 5. Transformation normalisée des candidats
    const agentInputs: DispatchAgentInput[] = candidateAgents.map((ag: any) => {
      const lat =
        ag.current_latitude !== null && ag.current_latitude !== undefined
          ? Number(ag.current_latitude)
          : null;
      const lon =
        ag.current_longitude !== null && ag.current_longitude !== undefined
          ? Number(ag.current_longitude)
          : null;

      const hasValidCoords =
        lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);

      return {
        id: ag.id,
        userId: ag.user_id,
        organizationId: ag.organization_id,
        fullName: ag.user?.full_name || `Agent ${ag.badge_number}`,
        badgeNumber: ag.badge_number,
        phone: ag.user?.phone || null,
        email: ag.user?.email || null,
        dutyStatus: ag.duty_status || 'AVAILABLE',
        patrolVehicle: ag.patrol_vehicle || 'Patrouille Alpha Securia',
        latitude: hasValidCoords ? lat : null,
        longitude: hasValidCoords ? lon : null,
        lastLocationUpdate: ag.last_location_update,
        isActive: !!ag.is_active && (!ag.user || ag.user.is_active !== false),
        activeInterventionsCount: activeInterventionsMap.get(ag.id) || 0,
      };
    });

    // 6. Récupération des centres de sécurité opérationnels de l'organisation
    let centersQuery = db
      .from('security_centers')
      .select('id, name, code, is_active')
      .eq('is_active', true);
    if (targetOrgId) {
      centersQuery = centersQuery.eq('organization_id', targetOrgId);
    }
    const { data: orgCenters } = await centersQuery;

    // 7. Génération déterministe de la recommandation
    const context: DispatchContext = {
      now: new Date(),
    };

    const recommendation = generateSmartDispatchRecommendation(agentInputs, alertInput, context);

    return {
      ...recommendation,
      alertStatus: alert.status,
      siteName: alert.site?.name || null,
      clientName: alert.user?.full_name || null,
      securityCenter: alert.security_center || null,
      securityCenters: orgCenters || [],
    };
  }
}

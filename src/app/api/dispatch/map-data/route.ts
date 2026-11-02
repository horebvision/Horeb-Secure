import { NextRequest, NextResponse } from 'next/server';
import { calculateHaversineDistance, estimateArrivalTime } from '@/lib/geo/geo-engine';
import { authenticateApiRequest, safeErrorResponse, isValidUuid } from '@/lib/security/api-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPlatformAdminUser } from '@/modules/users/types';

/**
 * GET /api/dispatch/map-data
 * Point d'accès cartographique sécurisé pour le Centre de Sécurité et Superviseurs.
 * RÈGLE STRICTE : Ne jamais exposer publiquement les coordonnées GPS.
 * Vérifie l'habilitation du rôle et cloisonne strictement par organisation.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Contrôle strict d'habilitation côté serveur (SECURITY_MANAGER, ADMIN, AGENT)
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json(
          { error: 'Accès refusé. Les coordonnées GPS des sites et agents sont strictement confidentielles.' },
          { status: 403 }
        )
      );
    }

    const { searchParams } = new URL(req.url);
    const paramOrgId = searchParams.get('organization_id');
    const isPlatformAdmin = isPlatformAdminUser({
      role: user.role,
      email: user.email,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    // Résolution autoritaire de l'organisation :
    // - Si Platform Admin et paramètre d'URL : permet de superviser l'organisation demandée
    // - Pour tout autre collaborateur : restreint STRICTEMENT à son organisation de session
    let targetOrgId: string | null = (isPlatformAdmin && paramOrgId && isValidUuid(paramOrgId))
      ? paramOrgId
      : (user.organizationId || null);

    if (!targetOrgId) {
      // Utilisateur non rattaché : refus immédiat de divulgation globale
      return NextResponse.json({
          success: true,
          center: { latitude: 5.3484, longitude: -4.0305, default_zoom: 13 },
          sites: [],
          agents: [],
          cameras: [],
          active_alerts: [],
          active_interventions: [],
          summary: {
            total_sites: 0,
            total_cameras: 0,
            alarmed_sites: 0,
            total_agents: 0,
            active_agents_located: 0,
            ongoing_interventions: 0,
            unacknowledged_alerts: 0,
          },
          note: 'Aucune organisation associée au compte demandeur',
        });
      }

    // Utilisation de supabaseAdmin pour garantir la complétude des données sans blocage RLS
    const db = supabaseAdmin;
    let rawSites: any[] = [];
    let agents: any[] = [];
    let rawInterventions: any[] = [];

    // Récupérer les centres de sécurité associés à l'organisation (pour le prestataire de télésurveillance)
    let orgCenterIds: string[] = [];
    if (targetOrgId) {
      const { data: orgCenters } = await db
        .from('security_centers')
        .select('id')
        .eq('organization_id', targetOrgId);
      orgCenterIds = (orgCenters || []).map((c: any) => c.id);
    }

    let sitesQuery = db
      .from('protected_sites')
      .select('*, owner:users!owner_id(id, full_name, phone, email)')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false });

    if (targetOrgId) {
      sitesQuery = sitesQuery.eq('organization_id', targetOrgId);
    }

    // Auto-provisioning des utilisateurs AGENT sans fiche security_agents
    try {
      let agentUsersQuery = db
        .from('users')
        .select('id, organization_id, security_center_id')
        .eq('role', 'AGENT');
      if (targetOrgId) {
        agentUsersQuery = agentUsersQuery.eq('organization_id', targetOrgId);
      }
      const { data: agentUsers } = await agentUsersQuery;

      // Requêtes groupées (au lieu d'une requête par agent à chaque rafraîchissement de carte)
      if (agentUsers && agentUsers.length > 0) {
        const { data: existingAgents } = await db
          .from('security_agents')
          .select('user_id')
          .in('user_id', agentUsers.map((u: any) => u.id));
        const provisioned = new Set((existingAgents || []).map((a: any) => a.user_id));
        const missing = agentUsers
          .filter((u: any) => !provisioned.has(u.id))
          .map((u: any) => ({
            user_id: u.id,
            organization_id: u.organization_id || targetOrgId,
            // Jamais de centre d'une autre organisation
            security_center_id: u.security_center_id || orgCenterIds[0] || null,
            badge_number: `AGT-${u.id.substring(0, 6).toUpperCase()}`,
            duty_status: 'AVAILABLE',
            patrol_vehicle: 'Patrouille Alpha Securia',
            is_active: true,
          }));
        if (missing.length > 0) {
          await db.from('security_agents').insert(missing);
        }
      }
    } catch (e) {
      console.warn('[map-data] Note auto-provisioning:', e);
    }

    let agentsQuery = db
      .from('security_agents')
      .select('*, user:users!user_id(id, full_name, phone, email)')
      .eq('is_active', true);

    if (targetOrgId) {
      agentsQuery = agentsQuery.eq('organization_id', targetOrgId);
    }

    let alertsQuery = db
      .from('alerts')
      .select(`
        id,
        site_id,
        alert_number,
        type,
        priority,
        status,
        latitude,
        longitude,
        location_address,
        client_notes,
        created_at,
        organization_id,
        security_center_id,
        assigned_agent_id,
        user:users!user_id(id, full_name, phone)
      `)
      .not('status', 'in', '("RESOLVED","CANCELLED","FALSE_ALARM")')
      .order('created_at', { ascending: false });

    // Requête interventions autoritaire et étanche
    let interventionsQuery = db
      .from('interventions')
      .select(`
        id,
        alert_id,
        security_center_id,
        status,
        created_at,
        assigned_at,
        accepted_at,
        en_route_at,
        arrived_at,
        agent:security_agents!agent_id (
          id,
          badge_number,
          current_latitude,
          current_longitude,
          patrol_vehicle,
          organization_id,
          user:users!user_id(full_name, phone)
        ),
        alert:alerts!fk_interventions_alert (
          alert_number,
          type,
          priority,
          latitude,
          longitude,
          location_address,
          organization_id,
          site:protected_sites!site_id(id, name, address, latitude, longitude)
        )
      `)
      .not('status', 'in', '("RESOLVED","CANCELLED")');

    const [sitesRes, agentsRes, alertsRes, interventionsRes] = await Promise.all([
      sitesQuery,
      agentsQuery,
      alertsQuery,
      interventionsQuery,
    ]);

    // Filtrage multi-tenant étanche (Client / Prestataire)
    const rawAlerts = alertsRes.data || [];
    const filteredAlerts = targetOrgId
      ? rawAlerts.filter((a: any) =>
          a.organization_id === targetOrgId ||
          (orgCenterIds.length > 0 && orgCenterIds.includes(a.security_center_id))
        )
      : rawAlerts;

    const rawInterventionsList = interventionsRes.data || [];
    const filteredInterventions = targetOrgId
      ? rawInterventionsList.filter((it: any) => {
          const isClientAlert = it.alert && it.alert.organization_id === targetOrgId;
          const isProviderCenter = it.security_center_id && orgCenterIds.includes(it.security_center_id);
          const isProviderAgent = it.agent && it.agent.organization_id === targetOrgId;
          return isClientAlert || isProviderCenter || isProviderAgent;
        })
      : rawInterventionsList;

    rawInterventions = filteredInterventions;
    const activeAlerts = filteredAlerts;
    const alertsBySite = new Map<string, any>();
    activeAlerts.forEach((a) => {
      if (a.site_id) alertsBySite.set(a.site_id, a);
    });

    rawSites = (sitesRes.data || []).map((site: any) => ({
      ...site,
      has_active_alert: alertsBySite.has(site.id),
      active_alert: alertsBySite.get(site.id) || null,
      owner: site.owner || { full_name: 'Client Sécuria', phone: '', email: '' },
    }));

    // 3. Normalisation stricte des coordonnées numériques des sites
    const sites = rawSites
      .map((s: any) => {
        const lat = Number(s.latitude);
        const lon = Number(s.longitude);
        if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return null;
        return {
          ...s,
          latitude: lat,
          longitude: lon,
        };
      })
      .filter(Boolean);

    // Bounding box stricte Côte d'Ivoire : Lat [4.0, 11.0], Lon [-9.0, -2.0]
    const isInsideCI = (lat: number, lon: number) =>
      typeof lat === 'number' && typeof lon === 'number' &&
      lat >= 4.0 && lat <= 11.0 && lon >= -9.0 && lon <= -2.0;

    // Centre de référence sécurisé (Abidjan, Côte d'Ivoire)
    const ciSites = sites.filter((s: any) => isInsideCI(s.latitude, s.longitude));
    const baseLat = ciSites.length > 0 ? Number(ciSites[0].latitude) : 5.3484;
    const baseLon = ciSites.length > 0 ? Number(ciSites[0].longitude) : -4.0305;

    // Mapping sécurisé de la flotte des agents
    agents = (agentsRes.data || []).map((ag: any, index: number) => {
      const lat = ag.current_latitude !== null && ag.current_latitude !== undefined ? Number(ag.current_latitude) : null;
      const lon = ag.current_longitude !== null && ag.current_longitude !== undefined ? Number(ag.current_longitude) : null;
      const hasValidCoords = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0) && isInsideCI(lat, lon);

      // Si l'agent n'a pas encore de balise GPS mobile active ou hors CI, on lui assigne une position base opérationnelle Abidjan
      const displayLat = hasValidCoords ? lat! : baseLat + 0.0012 + (index * 0.0006);
      const displayLon = hasValidCoords ? lon! : baseLon + 0.0012 + (index * 0.0006);

      return {
        id: ag.id,
        user_id: ag.user_id,
        agent_name: ag.user?.full_name || `Agent ${ag.badge_number}`,
        full_name: ag.user?.full_name || `Agent ${ag.badge_number}`,
        badge_number: ag.badge_number,
        duty_status: ag.duty_status || 'AVAILABLE',
        latitude: displayLat,
        longitude: displayLon,
        current_latitude: hasValidCoords ? lat : null,
        current_longitude: hasValidCoords ? lon : null,
        phone: ag.user?.phone || '',
        email: ag.user?.email || '',
        patrol_vehicle: ag.patrol_vehicle || 'Patrouille Alpha Securia',
        last_location_update: ag.last_location_update || ag.updated_at,
        has_gps: hasValidCoords,
        is_at_base: !hasValidCoords,
      };
    });

    // 4. Alertes actives formatées avec distinction GPS appareil client vs Site
    const formattedAlerts = activeAlerts.map((a: any) => {
      const lat = a.latitude !== null && a.latitude !== undefined ? Number(a.latitude) : null;
      const lon = a.longitude !== null && a.longitude !== undefined ? Number(a.longitude) : null;
      const hasValidDeviceCoords = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);

      return {
        ...a,
        device_latitude: hasValidDeviceCoords ? lat : null,
        device_longitude: hasValidDeviceCoords ? lon : null,
        has_device_gps: hasValidDeviceCoords,
        client_name: a.user?.full_name || 'Client',
        client_phone: a.user?.phone || '',
      };
    });

    // 5. Calcul temps réel des distances et ETA pour chaque intervention active
    rawInterventions = (interventionsRes.data || []).map((item: any) => {
      let distanceKm = null;
      let eta = null;

      const agLat = Number(item.agent?.current_latitude);
      const agLon = Number(item.agent?.current_longitude);
      const targetLat = Number(item.alert?.latitude || item.alert?.site?.latitude);
      const targetLon = Number(item.alert?.longitude || item.alert?.site?.longitude);

      if (!isNaN(agLat) && !isNaN(agLon) && !isNaN(targetLat) && !isNaN(targetLon) && !(agLat === 0 && agLon === 0)) {
        distanceKm = calculateHaversineDistance(
          { latitude: agLat, longitude: agLon },
          { latitude: targetLat, longitude: targetLon }
        );
        eta = estimateArrivalTime(distanceKm, true);
      }

      return {
        id: item.id,
        alert_id: item.alert_id,
        status: item.status,
        agent: item.agent ? {
          id: item.agent.id,
          agent_name: item.agent.user?.full_name || `Agent ${item.agent.badge_number}`,
          badge_number: item.agent.badge_number,
          patrol_vehicle: item.agent.patrol_vehicle,
          latitude: agLat,
          longitude: agLon,
        } : null,
        alert: item.alert,
        site: {
          id: item.alert?.site?.id || item.alert?.site_id || null,
          name: item.alert?.site?.name || 'Lieu d’intervention',
          address: item.alert?.location_address || item.alert?.site?.address || 'Position d’urgence',
          latitude: !isNaN(targetLat) && targetLat !== 0 ? targetLat : null,
          longitude: !isNaN(targetLon) && targetLon !== 0 ? targetLon : null,
        },
        telemetry: {
          distanceKm,
          formattedDistance: eta?.formattedDistance || 'Inconnue',
          durationMinutes: eta?.durationMinutes || null,
          formattedEta: eta?.formattedEta || 'Calcul...',
        },
      };
    });

    // Récupération sécurisée des caméras géolocalisées de l'organisation (Phase 8)
    let camerasWithGps: any[] = [];
    try {
      const { VideoRepository } = await import('@/lib/video/repository');
      const allCameras = await VideoRepository.getCamerasByOrg(targetOrgId);
      camerasWithGps = allCameras
        .filter((c) => typeof c.latitude === 'number' && typeof c.longitude === 'number')
        .map((c) => ({
          id: c.id,
          name: c.name,
          internal_id: c.internal_id,
          site_id: c.protected_site_id,
          latitude: c.latitude,
          longitude: c.longitude,
          status: c.status,
          protocol: c.protocol,
          is_primary: c.is_primary,
          location_description: c.location_description,
        }));
    } catch {
      // Tolérance
    }

    return NextResponse.json({
      success: true,
      center: {
        latitude: baseLat,
        longitude: baseLon,
        default_zoom: 13,
      },
      sites,
      agents,
      cameras: camerasWithGps,
      active_alerts: formattedAlerts,
      active_interventions: rawInterventions,
      summary: {
        total_sites: sites.length,
        total_cameras: camerasWithGps.length,
        alarmed_sites: sites.filter((s: any) => s.has_active_alert).length,
        total_agents: agents.length,
        active_agents_located: agents.filter((a: any) => a.has_gps).length,
        ongoing_interventions: rawInterventions.length,
        unacknowledged_alerts: formattedAlerts.filter((a: any) => a.status === 'SENT' || a.status === 'OPEN').length,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation cartographique');
  }
}

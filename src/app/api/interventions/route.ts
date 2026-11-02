import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/modules/notifications/notification.service';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  isValidUuid,
  sanitizeString,
  validateGeoCoordinates,
  safeErrorResponse,
} from '@/lib/security/api-guard';
import {
  InterventionLifecycleService,
  AgentLifecycleAction,
} from '@/lib/interventions/lifecycle-service';


/**
 * GET /api/interventions
 * Récupère les interventions de manière strictement cloisonnée selon le rôle de l'utilisateur :
 * - AGENT : uniquement ses propres interventions
 * - USER : uniquement les interventions liées à ses alertes
 * - SECURITY_MANAGER / ADMIN : supervision de l'organisation
/**
 * GET /api/interventions
 * Récupère les interventions de manière strictement cloisonnée selon le modèle multi-tenant :
 * - AGENT : uniquement ses propres interventions assignées
 * - USER : uniquement les interventions liées à ses propres alertes ou sites clients
 * - SECRETARY : uniquement les interventions de son organisation cliente
 * - SECURITY_MANAGER / ADMIN :
 *     * Platform Admin : vue globale ou filtrée par organisation
 *     * Tenant Admin / Manager : interventions où l'organisation est SOIT le client (alerte),
 *       SOIT le prestataire de sécurité (centre de sécurité ou agent de patrouille).
 * En cas d'échec ou d'organisation indéterminée, échoue de manière fermée (fail-closed).
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN', 'SECRETARY'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedAgentId = searchParams.get('agent_id');
    const status = searchParams.get('status');
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);

    // Résolution de l'agent si l'utilisateur est un patrouilleur
    let agentIdToUse: string | null = requestedAgentId || null;
    if (user.role === 'AGENT') {
      agentIdToUse = requestedAgentId || null;
      const { data: agentRec } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (agentRec) {
        agentIdToUse = agentRec.id;
      }
    }

    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
    const rawFacet = searchParams.get('facet')?.toUpperCase();
    const facet = rawFacet && ['CLIENT', 'PROVIDER', 'ANY'].includes(rawFacet) ? rawFacet : 'ANY';

    // Résolution sécurisée de l'organisation cible (Multi-tenant)
    const isPlatformAdmin = user.isPlatformAdmin === true;
    const userOrgId = user.organizationId;
    const requestedOrg = searchParams.get('organization_id');

    let targetOrgId: string | null = null;
    if (isPlatformAdmin) {
      targetOrgId = requestedOrg || userOrgId || null;
      if (!targetOrgId) {
        return NextResponse.json({
          success: true,
          count: 0,
          interventions: [],
          note: 'Paramètre organization_id requis pour filtrer les interventions en mode administrateur de plateforme',
        });
      }
    } else {
      if (!userOrgId) {
        // Utilisateur sans rattachement d'organisation : refus strict de déversement global
        return NextResponse.json({
          success: true,
          count: 0,
          interventions: [],
          note: 'Aucune organisation associée au compte demandeur',
        });
      }
      targetOrgId = userOrgId;
    }

    // Appel autoritaire de la procédure RPC sécurisée public.get_scoped_interventions_feed()
    // Le moteur PostgreSQL filtre directement à la source par client_organization_id / provider_organization_id
    const { data: scopedRows, error: rpcError } = await (supabaseAdmin as any).rpc(
      'get_scoped_interventions_feed',
      {
        p_org_id: targetOrgId,
        p_facet: facet,
        p_status: status || null,
        p_limit: limit,
        p_offset: offset,
      }
    );

    if (rpcError) {
      console.error('[API Interventions] Erreur RPC get_scoped_interventions_feed:', rpcError);
      return safeErrorResponse(rpcError, 'Erreur lors de la récupération sécurisée des interventions');
    }

    if (!scopedRows || scopedRows.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        interventions: [],
      });
    }

    const scopedIds = (scopedRows as any[]).map((r: any) => r.id).filter(Boolean);
    if (scopedIds.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        interventions: [],
      });
    }

    // Hydratation des relations nécessaires à l'interface exclusivement pour les interventions autorisées
    const { data: enrichedList, error: queryError } = await supabaseAdmin
      .from('interventions')
      .select(`
        id,
        status,
        report,
        assigned_at,
        accepted_at,
        en_route_at,
        arrived_at,
        resolved_at,
        created_at,
        updated_at,
        agent_id,
        security_center_id,
        alert_id,
        client_organization_id,
        provider_organization_id,
        alert:alerts!fk_interventions_alert (
          id,
          alert_number,
          type,
          priority,
          status,
          created_at,
          user_id,
          organization_id,
          site:protected_sites (
            id,
            name,
            address,
            client_id
          ),
          user:users (
            id,
            full_name,
            phone
          )
        ),
        security_center:security_centers (
          id,
          name,
          organization_id
        ),
        agent:security_agents (
          id,
          badge_number,
          patrol_vehicle,
          organization_id,
          user:users (
            full_name
          )
        )
      `)
      .in('id', scopedIds)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('[API Interventions] Erreur hydratation des interventions:', queryError);
      return safeErrorResponse(queryError, 'Erreur lors du chargement des détails des interventions');
    }

    // Filtrage complémentaire par rôle utilisateur spécifique (Défense en profondeur)
    let finalList = enrichedList || [];

    if (user.role === 'USER') {
      // Client final : restreint à ses propres alertes ou sites
      finalList = finalList.filter(
        (item: any) =>
          item.alert &&
          (item.alert.user_id === user.id ||
            (user.clientId && item.alert.site?.client_id === user.clientId))
      );
    } else if (user.role === 'AGENT') {
      // Agent patrouilleur : restreint à ses propres interventions assignées
      finalList = finalList.filter((item: any) =>
        agentIdToUse ? item.agent_id === agentIdToUse : false
      );
    }

    return NextResponse.json({
      success: true,
      count: finalList.length,
      interventions: finalList,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors du traitement des interventions');
  }
}

/**
 * PATCH /api/interventions
 * Met à jour le cycle de vie d'une intervention par l'agent :
 * Actions supportées : ACCEPT, DEPART, ARRIVE, COMPLETE, ABORT
 * Enregistre systématiquement chaque transition dans alert_events et audit_logs.
 */
export async function PATCH(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls les AGENTS, RÉGULATEURS et ADMINS peuvent modifier une intervention
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
    const {
      alert_id,
      action,
      notes = null,
      latitude = null,
      longitude = null,
    } = body;

    // 2. Validation des identifiants et entrées
    if (!alert_id || !isValidUuid(alert_id)) {
      return NextResponse.json(
        { error: 'alert_id valide (format UUID) est obligatoire' },
        { status: 400 }
      );
    }

    // Normaliser les alias d'actions (ex: EN_ROUTE -> DEPART, ARRIVED -> ARRIVE, RESOLVE -> COMPLETE)
    let normalizedAction = action;
    if (action === 'EN_ROUTE') normalizedAction = 'DEPART';
    if (action === 'ARRIVED') normalizedAction = 'ARRIVE';
    if (action === 'RESOLVE') normalizedAction = 'COMPLETE';

    const allowedActions = ['ACCEPT', 'DEPART', 'ARRIVE', 'COMPLETE', 'ABORT'];
    if (!normalizedAction || !allowedActions.includes(normalizedAction)) {
      return NextResponse.json(
        { error: "action obligatoire. Valeurs permises: ACCEPT, DEPART, ARRIVE, COMPLETE, ABORT (ou alias EN_ROUTE, ARRIVED, RESOLVE)" },
        { status: 400 }
      );
    }

    const sanitizedNotes = notes ? sanitizeString(notes, 2000) : null;

    if (normalizedAction === 'ABORT' && (!sanitizedNotes || sanitizedNotes.trim() === '')) {
      return NextResponse.json(
        { error: "Un motif d'impossibilité d'intervenir est obligatoire" },
        { status: 400 }
      );
    }

    if (normalizedAction === 'COMPLETE' && (!sanitizedNotes || sanitizedNotes.trim() === '')) {
      return NextResponse.json(
        { error: "Un compte-rendu d'intervention est obligatoire pour clôturer la mission" },
        { status: 400 }
      );
    }

    const geoValidation = validateGeoCoordinates(latitude, longitude);
    if (!geoValidation.valid) {
      return NextResponse.json(
        { error: geoValidation.error || 'Coordonnées GPS invalides' },
        { status: 400 }
      );
    }

    let inputAgentId = body.agent_id;
    if (user.role === 'AGENT') {
      inputAgentId = user.id;
    }

    const db = await getScopedDatabaseClient(req);
    let resolvedAgentId = inputAgentId;
    const { data: matchedAgent } = await db
      .from('security_agents')
      .select('id, user_id')
      .or(`id.eq.${inputAgentId},user_id.eq.${inputAgentId}`)
      .maybeSingle();

    if (matchedAgent) {
      resolvedAgentId = matchedAgent.id;
    }

    // 3. Vérification d'habilitation multi-tenant sur l'alerte et l'intervention
    const { data: targetAlert, error: alertFetchErr } = await supabaseAdmin
      .from('alerts')
      .select('id, organization_id, security_center_id, assigned_agent_id, status')
      .eq('id', alert_id)
      .maybeSingle();

    if (alertFetchErr || !targetAlert) {
      return NextResponse.json({ error: 'Alerte introuvable' }, { status: 404 });
    }

    if (!user.isPlatformAdmin) {
      if (user.role === 'AGENT') {
        if (targetAlert.assigned_agent_id && targetAlert.assigned_agent_id !== resolvedAgentId) {
          return NextResponse.json(
            { error: 'Accès refusé : intervention non assignée à cet agent' },
            { status: 403 }
          );
        }
      } else {
        let isAuthorized = false;
        if (user.organizationId) {
          if (targetAlert.organization_id === user.organizationId) {
            isAuthorized = true;
          } else if (targetAlert.security_center_id) {
            const { data: centerRec } = await supabaseAdmin
              .from('security_centers')
              .select('organization_id')
              .eq('id', targetAlert.security_center_id)
              .maybeSingle();
            if (centerRec && centerRec.organization_id === user.organizationId) {
              isAuthorized = true;
            }
          }
        }
        if (!isAuthorized) {
          return NextResponse.json(
            { error: 'Accès refusé : violation d\'isolation multi-tenant pour cette intervention' },
            { status: 403 }
          );
        }
      }
    }

    // 4. Exécution coordonnée du cycle de vie via la RPC atomique unifiée
    let result: any = null;
    try {
      result = await InterventionLifecycleService.executeAgentTransition({
        alertId: alert_id,
        agentId: resolvedAgentId,
        action: normalizedAction as AgentLifecycleAction,
        actorUserId: user.id,
        notes: sanitizedNotes,
        latitude: geoValidation.lat || null,
        longitude: geoValidation.lon || null,
      });
    } catch (transitionErr: any) {
      const httpStatus = transitionErr.status || 500;
      if (httpStatus >= 400 && httpStatus < 500) {
        return NextResponse.json(
          { success: false, error: transitionErr.message },
          { status: httpStatus }
        );
      }
      throw transitionErr;
    }

    // 5. Traçabilité des notifications :
    // La procédure atomique transition_intervention_lifecycle a déjà persisté de manière indivisible :
    // - Les notifications IN_APP (immédiates avec diffusion Realtime)
    // - Les notifications externes PUSH / SMS / EMAIL dans l'Outbox (statut PENDING)
    // Les canaux externes seront dépilés par le worker Outbox durable dès sa mise en service.

    return NextResponse.json({
      success: true,
      alert_id,
      agent_id: resolvedAgentId,
      action: normalizedAction,
      idempotent: Boolean(result?.idempotent),
      result,
      message: result?.message || `Action ${normalizedAction} enregistrée avec succès`,
    });
  } catch (err: any) {
    return safeErrorResponse(err, "Erreur interne lors de la mise à jour de l'intervention");
  }
}

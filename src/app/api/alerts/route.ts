import { NextRequest, NextResponse } from 'next/server';
import { AlertEngine } from '@/modules/alerts/alert-engine.service';
import { createClient } from '@/lib/supabase/server';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  checkRateLimit,
  sanitizeString,
  validateGeoCoordinates,
  isValidAlertType,
  normalizeAlertType,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * POST /api/alerts
 * Point d'entrée central du moteur d'alerte SECURIA
 * Conforme aux 10 étapes du protocole : validation stricte, résolution localisation,
 * idempotence, anti-spam, attribution centre, création alert_events et diffusion temps réel.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. PROTECTION ANTI-SPAM / RATE LIMITING
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const limit = process.env.NODE_ENV === 'production' ? 15 : 120;
    const rateLimit = await checkRateLimit(`alert_post_${ip}`, limit, 60000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Trop de requêtes. Veuillez patienter ${rateLimit.resetInSeconds}s avant de relancer.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();

    // 2. VALIDATION STRICTE DES ENTRÉES
    if (!body.type || !isValidAlertType(body.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Type d'urgence invalide ou manquant. Types permis: INTRUSION, AGRESSION, INCENDIE, MEDICAL, URGENCE, SUSPECT, DISCRETE, AUTRE",
        },
        { status: 400 }
      );
    }

    // Validation des coordonnées GPS
    const geoValidation = validateGeoCoordinates(body.latitude, body.longitude);
    if (!geoValidation.valid) {
      return NextResponse.json(
        { success: false, error: geoValidation.error || 'Coordonnées GPS invalides' },
        { status: 400 }
      );
    }

    // Assainissement des chaînes de caractères (anti-XSS et injection)
    const sanitizedAddress = sanitizeString(body.address || body.location_address || '', 300);
    const sanitizedNotes = sanitizeString(body.clientNotes || body.client_notes || '', 1000);
    const rawIdempotency =
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key') ||
      body.idempotency_key ||
      body.idempotencyKey ||
      null;
    const sanitizedIdempotency = rawIdempotency ? sanitizeString(rawIdempotency, 128) : null;

    // 3. VÉRIFICATION D'AUTHENTIFICATION & EMPÊCHEMENT D'USURPATION D'IDENTITÉ
    const supabase = await createClient();
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser(bearerToken);

    let resolvedUserId: string;

    if (sessionUser) {
      // Un utilisateur connecté ne peut JAMAIS usurper l'identité d'un autre résident (headers ignorés)
      resolvedUserId = sessionUser.id;
    } else {
      // Fallback réservé aux tests et bancs d'essai (STRICTEMENT INTERDIT EN PRODUCTION)
      const isTestAuthAllowed = process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true';
      if (!isTestAuthAllowed) {
        return NextResponse.json(
          { success: false, error: 'Non authentifié. Jeton de session requis.' },
          { status: 401 }
        );
      }

      // Mode test local explicite uniquement
      const testHeaderUser = req.headers.get('x-user-id') || req.headers.get('x-test-user-id');
      const providedUserId = testHeaderUser || body.userId || body.user_id;
      if (providedUserId && isValidUuid(providedUserId)) {
        resolvedUserId = providedUserId;
      } else {
        return NextResponse.json(
          { success: false, error: 'Identifiant utilisateur valide (UUID) obligatoire en mode test' },
          { status: 400 }
        );
      }
    }

    // 4. EXÉCUTION DU MOTEUR D'ALERTE
    const normalizedType = normalizeAlertType(body.type) as any;
    const isDiscrete = String(body.type).toUpperCase().trim() === 'DISCRETE' || !!(body.isSilent || body.is_silent);

    const result = await AlertEngine.processAlert({
      id: body.id && isValidUuid(body.id) ? body.id : undefined,
      userId: resolvedUserId,
      siteId: body.siteId || body.site_id || null,
      type: normalizedType,
      priority: body.priority,
      latitude: geoValidation.lat,
      longitude: geoValidation.lon,
      address: sanitizedAddress || null,
      isSilent: isDiscrete,
      clientNotes: sanitizedNotes || null,
      idempotencyKey: sanitizedIdempotency,
      escalationTimeoutSeconds: typeof body.escalationTimeoutSeconds === 'number' ? body.escalationTimeoutSeconds : undefined,
    });

    if (result.isCooldown) {
      return NextResponse.json(result, { status: 429 });
    }

    const statusCode = result.isDuplicate ? 200 : 201;
    return NextResponse.json(result, { status: statusCode });
  } catch (error: any) {
    return safeErrorResponse(error, "Erreur interne lors du traitement de l'alerte");
  }
}

/**
 * GET /api/alerts
 * Consultation et monitoring sécurisés des alertes selon le rôle et le tenant de l'utilisateur
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = await getScopedDatabaseClient(req);
    const { searchParams } = new URL(req.url);

    const status = searchParams.get('status');
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);

    const isPlatformAdmin = user.isPlatformAdmin === true;
    const userOrgId = user.organizationId;

    if (!isPlatformAdmin && !userOrgId && user.role !== 'USER') {
      return NextResponse.json({
        success: true,
        count: 0,
        alerts: [],
        note: 'Aucune organisation associée au compte demandeur',
      });
    }

    let query = supabase
      .from('alerts')
      .select(`
        *,
        user:user_id (id, full_name, email, phone),
        site:site_id (id, name, address, city, access_instructions, site_type, client_id),
        assigned_agent:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(full_name, phone)),
        interventions (id, status, report, resolved_at, en_route_at, arrived_at),
        alert_events (*)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (user.role === 'USER') {
      query = query.eq('user_id', user.id);
    } else {
      const requestedOrg = searchParams.get('organization_id');
      const targetOrg = (isPlatformAdmin && requestedOrg && isValidUuid(requestedOrg)) ? requestedOrg : userOrgId;
      if (targetOrg && targetOrg !== 'ALL') {
        query = query.eq('organization_id', targetOrg);
      } else if (!isPlatformAdmin) {
        return NextResponse.json({ success: true, count: 0, alerts: [] });
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: alertsList, error } = await query;

    if (error) {
      // Fallback avec respect strict du même périmètre multi-tenant
      let fallbackQuery = supabase
        .from('alerts')
        .select('*, alert_events(*)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (user.role === 'USER') {
        fallbackQuery = fallbackQuery.eq('user_id', user.id);
      } else {
        const requestedOrg = searchParams.get('organization_id');
        const targetOrg = (isPlatformAdmin && requestedOrg && isValidUuid(requestedOrg)) ? requestedOrg : userOrgId;
        if (targetOrg && targetOrg !== 'ALL') {
          fallbackQuery = fallbackQuery.eq('organization_id', targetOrg);
        } else if (!isPlatformAdmin) {
          return NextResponse.json({ success: true, count: 0, alerts: [] });
        }
      }

      if (status) {
        fallbackQuery = fallbackQuery.eq('status', status);
      }

      const { data: simpleAlerts, error: fallbackErr } = await fallbackQuery;
      if (fallbackErr) {
        return safeErrorResponse(fallbackErr, 'Erreur lors du chargement des alertes');
      }

      return NextResponse.json({
        success: true,
        count: simpleAlerts?.length || 0,
        alerts: simpleAlerts || [],
      });
    }

    // Enrichissement autoritaire avec les contacts d'urgence réels de chaque déclarant
    if (alertsList && alertsList.length > 0) {
      const userIds = Array.from(new Set(alertsList.map((a: any) => a.user_id).filter(Boolean)));
      if (userIds.length > 0) {
        try {
          const { data: contactsData } = await supabase
            .from('emergency_contacts')
            .select('id, user_id, name, relation, phone, priority_order, is_active')
            .in('user_id', userIds)
            .eq('is_active', true)
            .order('priority_order', { ascending: true })
            .order('created_at', { ascending: true });

          const contactsByUserId = new Map<string, any[]>();
          (contactsData || []).forEach((c: any) => {
            if (!contactsByUserId.has(c.user_id)) {
              contactsByUserId.set(c.user_id, []);
            }
            contactsByUserId.get(c.user_id)!.push(c);
          });

          alertsList.forEach((a: any) => {
            const userContacts = contactsByUserId.get(a.user_id) || [];
            if (a.user) {
              a.user.emergency_contacts = userContacts;
            } else {
              a.user = { id: a.user_id, emergency_contacts: userContacts };
            }
          });
        } catch (cErr) {
          console.warn('[API /api/alerts] Note enrichissement contacts:', cErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: alertsList?.length || 0,
      alerts: alertsList || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des alertes');
  }
}

/**
 * PATCH /api/alerts
 * Annulation ou mise à jour de statut d'alerte (clôture, fausse alerte).
 * Sécurité stricte :
 * - Un client (USER) ne peut annuler QUE ses propres alertes (anti-IDOR vérifié côté serveur).
 * - Les superviseurs et admins peuvent clôturer n'importe quelle alerte de leur centre.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const body = await req.json();
    const { alert_id, status, reason } = body;

    if (!alert_id || !isValidUuid(alert_id)) {
      return NextResponse.json(
        { success: false, error: 'alert_id valide (format UUID) est requis' },
        { status: 400 }
      );
    }

    const allowedStatuses = ['CANCELLED', 'RESOLVED', 'FALSE_ALARM', 'ACKNOWLEDGED'];
    if (!status || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Statut invalide. Statuts permis: ${allowedStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Un agent ne peut pas annuler directement une alerte via cette route (doit utiliser /api/interventions)
    if (user.role === 'AGENT') {
      return NextResponse.json(
        {
          success: false,
          error: "Action non autorisée pour un patrouilleur. Utilisez la console d'intervention.",
        },
        { status: 403 }
      );
    }

    const sanitizedReason = reason
      ? sanitizeString(reason, 500)
      : status === 'CANCELLED'
      ? 'Alerte annulée par le résident (fausse manipulation)'
      : `Statut changé vers ${status}`;

    const supabase = await createClient();

    // Exécution de la procédure stockée atomique (qui valide existence, propriété et droits)
    const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
      'cancel_or_update_alert',
      {
        p_alert_id: alert_id,
        p_user_id: user.id,
        p_new_status: status,
        p_reason: sanitizedReason,
      }
    );

    if (rpcError) {
      return safeErrorResponse(rpcError, "Erreur lors de la mise à jour de l'alerte");
    }

    if (rpcResult && !rpcResult.success) {
      return NextResponse.json(
        { success: false, error: rpcResult.error },
        { status: rpcResult.code || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Alerte mise à jour avec succès (${status})`,
      alert_id,
      status,
    });
  } catch (err: any) {
    return safeErrorResponse(err, "Erreur interne lors de la mise à jour de l'alerte");
  }
}


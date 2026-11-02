import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/modules/notifications/notification.service';
import {
  authenticateApiRequest,
  isValidUuid,
  sanitizeString,
  safeErrorResponse,
} from '@/lib/security/api-guard';
import {
  InterventionLifecycleService,
  SecuriaAlertStatus,
} from '@/lib/interventions/lifecycle-service';

/**
 * GET /api/alerts/[id]
 * Récupère le dossier complet d'une alerte avec contrôle strict d'accès (anti-IDOR)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const rawAlertId = resolvedParams.id;

    if (!rawAlertId || typeof rawAlertId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Identifiant d\u2019alerte manquant' },
        { status: 400 }
      );
    }

    const alertId = sanitizeString(rawAlertId, 128);

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non authentifi\u00e9' }, { status: 401 });
    }

    let alert: any = null;
    let events: any[] = [];

    // Tenter l'appel RPC get_alert_detail
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('get_alert_detail', {
      p_alert_id: alertId,
    });

    if (!rpcError && rpcResult?.alert) {
      alert = rpcResult.alert;
      events = rpcResult.events || [];
    } else {
      // Fallback direct via tables relationnelles
      let alertQuery = supabaseAdmin
        .from('alerts')
        .select(`
          *,
          user:user_id (id, full_name, email, phone),
          site:site_id (*),
          assigned_agent:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(full_name, phone)),
          interventions (*),
          alert_events (*)
        `);

      if (isValidUuid(alertId)) {
        alertQuery = alertQuery.eq('id', alertId);
      } else {
        alertQuery = alertQuery.eq('alert_number', alertId);
      }

      const { data: dbAlert, error: dbErr } = await alertQuery.maybeSingle();

      if (dbErr || !dbAlert) {
        return NextResponse.json(
          { success: false, error: 'Dossier d’alerte introuvable' },
          { status: 404 }
        );
      }

      alert = dbAlert;
      events = dbAlert.alert_events || [];
    }

    // CONTRÔLE D'ACCÈS STRICT (Anti-IDOR & Isolation Multi-Organisations)
    if (user.role === 'USER') {
      if (alert.user_id !== user.id) {
        return NextResponse.json(
          { success: false, error: 'Accès interdit. Cette alerte appartient à un autre résident.' },
          { status: 403 }
        );
      }
    } else if (user.role === 'AGENT') {
      const isAssigned = alert.assigned_agent_id === user.id;
      const isSameOrg = !user.organizationId || !alert.organization_id || alert.organization_id === user.organizationId;
      if (!isAssigned && !isSameOrg) {
        return NextResponse.json(
          { success: false, error: 'Accès interdit. Cette alerte ne vous est pas affectée.' },
          { status: 403 }
        );
      }
    } else if (user.role === 'SECURITY_MANAGER' || (user.role === 'ADMIN' && !user.isPlatformAdmin)) {
      if (user.organizationId && alert.organization_id && alert.organization_id !== user.organizationId) {
        return NextResponse.json(
          { success: false, error: 'Accès interdit à une alerte d’une organisation tierce.' },
          { status: 403 }
        );
      }
    }

    // Enrichissement autoritaire avec les contacts d'urgence réels du déclarant
    if (alert.user_id) {
      try {
        const { data: contacts } = await supabaseAdmin
          .from('emergency_contacts')
          .select('id, user_id, name, relation, phone, priority_order, is_active')
          .eq('user_id', alert.user_id)
          .eq('is_active', true)
          .order('priority_order', { ascending: true })
          .order('created_at', { ascending: true });

        const userContacts = contacts || [];
        if (alert.user) {
          alert.user.emergency_contacts = userContacts;
        } else {
          alert.user = { id: alert.user_id, emergency_contacts: userContacts };
        }
      } catch (cErr) {
        console.warn('[API /api/alerts/[id]] Note contacts:', cErr);
      }
    }

    return NextResponse.json({
      success: true,
      alert,
      events,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation du dossier d\u2019alerte');
  }
}

/**
 * PATCH /api/alerts/[id]
 * Met à jour le statut opérationnel d'une alerte et synchronise les interventions associées :
 * - Prise en charge (ACKNOWLEDGED)
 * - Déplacement patrouille (EN_ROUTE)
 * - Arrivée sur site (ARRIVED)
 * - Clôture avec rapport (RESOLVED)
 * - Annulation ou fausse alerte (CANCELLED, FALSE_ALARM)
 * - Escalade services de secours (ESCALATED)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const rawAlertId = resolvedParams.id;

    if (!rawAlertId || typeof rawAlertId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Identifiant d’alerte manquant' },
        { status: 400 }
      );
    }

    const alertId = sanitizeString(rawAlertId, 128);

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { status, comment, report } = body;

    const validStatuses = [
      'CREATED',
      'SENT',
      'RECEIVED',
      'ACKNOWLEDGED',
      'ASSIGNED',
      'EN_ROUTE',
      'ARRIVED',
      'RESOLVED',
      'CANCELLED',
      'FALSE_ALARM',
      'ESCALATED',
    ];

    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Statut invalide. Statuts permis : ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Récupérer l'alerte actuelle
    let fetchQuery = supabaseAdmin.from('alerts').select('*');
    if (isValidUuid(alertId)) {
      fetchQuery = fetchQuery.eq('id', alertId);
    } else {
      fetchQuery = fetchQuery.or(`alert_number.eq.${alertId},idempotency_key.eq.${alertId}`);
    }
    const { data: currentAlert, error: fetchErr } = await fetchQuery.maybeSingle();

    if (fetchErr || !currentAlert) {
      return NextResponse.json(
        { success: false, error: 'Dossier d’alerte introuvable' },
        { status: 404 }
      );
    }

    // Contrôle d'accès strict selon le rôle :
    // - Un utilisateur (résident) ne peut que CANCEL son alerte
    if (user.role === 'USER') {
      if (currentAlert.user_id !== user.id && !user.isTestOrDemo) {
        return NextResponse.json({ success: false, error: 'Action non autorisée sur cette alerte' }, { status: 403 });
      }
      if (status !== 'CANCELLED') {
        return NextResponse.json({ success: false, error: 'Un résident peut uniquement annuler son alerte' }, { status: 403 });
      }
    } else if (user.role === 'AGENT') {
      const isAssigned = currentAlert.assigned_agent_id === user.id;
      if (!isAssigned) {
        return NextResponse.json({ success: false, error: 'Accès refusé : alerte non affectée à cet agent' }, { status: 403 });
      }
    } else if (user.role === 'SECURITY_MANAGER' || (user.role === 'ADMIN' && !user.isPlatformAdmin)) {
      if (user.organizationId && currentAlert.organization_id && currentAlert.organization_id !== user.organizationId) {
        return NextResponse.json({ success: false, error: 'Action interdite sur l’alerte d’une autre organisation.' }, { status: 403 });
      }
    }

    const sanitizedReport = report ? sanitizeString(report, 4000) : null;
    const sanitizedComment = comment ? sanitizeString(comment, 1000) : null;

    let socTransitionResult: any = null;
    try {
      socTransitionResult = await InterventionLifecycleService.executeSocTransition({
        alertId: currentAlert.id,
        targetStatus: status as SecuriaAlertStatus,
        actorUserId: user.id,
        actorRole: user.role,
        actorName: user.fullName || user.role,
        comment: sanitizedComment,
        report: sanitizedReport,
      });
    } catch (transErr: any) {
      if (transErr.status === 400 || transErr.status === 409) {
        return NextResponse.json(
          { success: false, error: transErr.message },
          { status: transErr.status }
        );
      }
      throw transErr;
    }

    const updatedAlert = socTransitionResult.alert || currentAlert;

    // 5. Notifications multi-canaux
    try {
      if (status === 'RESOLVED' && currentAlert.user_id) {
        await NotificationService.notifyInterventionCompleted({
          alertId: currentAlert.id,
          alertNumber: currentAlert.alert_number,
          clientUserId: currentAlert.user_id,
          reportSummary: sanitizedReport || 'Site inspecté et sécurisé avec succès.',
        });
      } else if (status === 'ACKNOWLEDGED' && currentAlert.user_id) {
        await NotificationService.notifyAlertAcknowledged({
          alertId: currentAlert.id,
          alertNumber: currentAlert.alert_number,
          clientUserId: currentAlert.user_id,
        });
      }
    } catch (notifErr) {
      console.warn('[API /api/alerts/[id]] Note notification:', notifErr);
    }

    return NextResponse.json({
      success: true,
      alert: updatedAlert,
      message: `Statut de l'alerte mis à jour vers ${status}`,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la modification de l’alerte');
  }
}

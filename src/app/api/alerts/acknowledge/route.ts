import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/modules/notifications/notification.service';
import {
  authenticateApiRequest,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

export async function POST(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls les RÉGULATEURS et ADMINS peuvent acquitter une alerte
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Habilitation superviseur requise.' }, { status: 403 })
      );
    }

    const body = await req.json();
    const alert_id = body.alert_id || body.alertId;

    if (!alert_id || !isValidUuid(alert_id)) {
      return NextResponse.json(
        { success: false, error: 'alert_id valide (format UUID) est requis' },
        { status: 400 }
      );
    }

    // 2. Contrôle d'existence et d'isolation multi-tenant
    const { data: currentAlert, error: alertFetchErr } = await supabaseAdmin
      .from('alerts')
      .select('id, organization_id, alert_number, user_id, status, acknowledged_at')
      .eq('id', alert_id)
      .maybeSingle();

    if (alertFetchErr || !currentAlert) {
      return NextResponse.json(
        { success: false, error: 'Dossier d’alerte introuvable' },
        { status: 404 }
      );
    }

    if (!user.isPlatformAdmin && user.role !== 'ADMIN' && user.organizationId && currentAlert.organization_id && user.organizationId !== currentAlert.organization_id) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé : cette alerte appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    const resolvedDispatcherId = user.id;
    let rpcSuccess = false;
    let data: any = null;

    // 3. Exécution de la procédure RPC sécurisée
    try {
      const rpcRes = await (supabaseAdmin as any).rpc('acknowledge_alert', {
        p_alert_id: alert_id,
        p_dispatcher_id: resolvedDispatcherId,
      });

      if (!rpcRes.error && rpcRes.data?.success !== false) {
        rpcSuccess = true;
        data = rpcRes.data;
      }
    } catch {
      rpcSuccess = false;
    }

    // 4. Fallback applicatif direct si la RPC est absente ou a échoué
    if (!rpcSuccess) {
      const nowIso = new Date().toISOString();
      const prevStatus = currentAlert.status;

      await supabaseAdmin
        .from('alerts')
        .update({
          status: 'ACKNOWLEDGED',
          acknowledged_at: currentAlert.acknowledged_at || nowIso,
          updated_at: nowIso,
        })
        .eq('id', alert_id);

      await supabaseAdmin.from('alert_events').insert({
        id: crypto.randomUUID(),
        alert_id,
        actor_id: resolvedDispatcherId,
        from_status: prevStatus,
        to_status: 'ACKNOWLEDGED',
        event_type: 'ALERT_ACKNOWLEDGED',
        comment: `Alerte prise en charge par le régulateur ${user.fullName || user.role}.`,
        created_at: nowIso,
      });

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: resolvedDispatcherId,
        action: 'ACKNOWLEDGE_ALERT',
        entity_type: 'ALERT',
        entity_id: alert_id,
        details: {
          alert_number: currentAlert.alert_number,
          previous_status: prevStatus,
          new_status: 'ACKNOWLEDGED',
        },
        created_at: nowIso,
      });

      data = {
        success: true,
        message: 'Alerte prise en charge avec succès',
        status: 'ACKNOWLEDGED',
      };
    }

    // 5. Notification multi-canal pour l'habitant et broadcast temps réel
    try {
      if (currentAlert.user_id) {
        await NotificationService.notifyAlertAcknowledged({
          alertId: alert_id,
          alertNumber: currentAlert.alert_number,
          clientUserId: currentAlert.user_id,
        });
      }
    } catch (notifErr) {
      console.warn('[API Acknowledge] Note notification:', notifErr);
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la prise en charge de l’alerte');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse, sanitizeString } from '@/lib/security/api-guard';
import {
  resolveInterventionWithAccess,
  serializeStructuredReport,
  StructuredAgentReport,
  InterventionLifecycleService,
} from '@/lib/interventions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/modules/notifications/notification.service';

/**
 * POST /api/interventions/[id]/report
 * Enregistrement ou soumission officielle du rapport d'intervention par le patrouilleur.
 * Supporte :
 * - Brouillon : status = 'REPORT_DRAFT'
 * - Soumission finale : status = 'REPORT_SUBMITTED'
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: 'Identifiant d’intervention invalide (format UUID)' },
        { status: 400 }
      );
    }

    const access = await resolveInterventionWithAccess(id, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!access.allowed || !access.proof) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await req.json();
    const isDraft = body.is_draft === true || body.report_status === 'REPORT_DRAFT';
    const reportStatus = isDraft ? 'REPORT_DRAFT' : 'REPORT_SUBMITTED';

    // Validation des champs
    const findings = sanitizeString(body.findings || '', 2000);
    const actionsTaken = sanitizeString(body.actions_taken || '', 2000);
    const outcome = sanitizeString(body.outcome || '', 1000);
    const observations = body.observations ? sanitizeString(body.observations, 1000) : undefined;
    const damages = body.damages ? sanitizeString(body.damages, 1000) : undefined;
    const recommendations = body.recommendations ? sanitizeString(body.recommendations, 1000) : undefined;

    if (!isDraft && (!findings.trim() || !actionsTaken.trim() || !outcome.trim())) {
      return NextResponse.json(
        {
          error:
            'Champs obligatoires manquants : Le constat initial, les actions menées et le résultat final doivent être renseignés pour soumettre le rapport.',
        },
        { status: 400 }
      );
    }

    // Checklist et photos
    const checklist = Array.isArray(body.checklist) ? body.checklist : access.proof.report.checklist;
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 6) : access.proof.report.photos;

    const structuredReport: StructuredAgentReport = {
      version: '2.0',
      report_status: reportStatus,
      findings: findings || access.proof.report.findings,
      actions_taken: actionsTaken || access.proof.report.actions_taken,
      outcome: outcome || access.proof.report.outcome,
      observations,
      damages,
      recommendations,
      checklist,
      photos,
      gps: {
        arrival_latitude: body.latitude || access.proof.gps.arrival_coordinates?.[0] || null,
        arrival_longitude: body.longitude || access.proof.gps.arrival_coordinates?.[1] || null,
        accuracy: body.accuracy || 8,
      },
      validation: access.proof.report.validation || {},
    };

    const serializedReport = serializeStructuredReport(structuredReport);

    // Résumé textuel court pour les flux légers
    const shortSummary = `${findings} — ${outcome}`;

    const nowIso = new Date().toISOString();

    // 1. Mise à jour de l'intervention
    const intUpdateData: any = {
      report: serializedReport,
      updated_at: nowIso,
    };

    if (!isDraft) {
      intUpdateData.status = 'COMPLETED';
      intUpdateData.resolved_at = access.intervention?.resolved_at || nowIso;
    }

    if (access.intervention?.id) {
      await supabaseAdmin
        .from('interventions')
        .update(intUpdateData)
        .eq('id', access.intervention.id);
    }

    // 2. Mise à jour de l'alerte
    const alertUpdateData: any = {
      resolution_report: serializedReport,
      updated_at: nowIso,
    };

    if (!isDraft) {
      alertUpdateData.status = 'RESOLVED';
      alertUpdateData.resolved_at = access.alert?.resolved_at || nowIso;
    }

    await supabaseAdmin
      .from('alerts')
      .update(alertUpdateData)
      .eq('id', access.alert.id);

    // 3. Journalisation dans alert_events
    await supabaseAdmin.from('alert_events').insert({
      alert_id: access.alert.id,
      actor_id: user.id,
      from_status: access.alert.status,
      to_status: isDraft ? access.alert.status : 'RESOLVED',
      event_type: isDraft ? 'REPORT_DRAFT' : 'REPORT_SUBMITTED',
      comment: isDraft
        ? 'Brouillon de rapport d’intervention sauvegardé par le patrouilleur.'
        : 'Rapport complet d’intervention soumis par le patrouilleur.',
      metadata: {
        report_status: reportStatus,
        has_photos: photos.length > 0,
        checklist_items_checked: checklist.filter((c: any) => c.checked).length,
      },
    });

    // 4. Libération sécurisée de l'agent et traçabilité d'audit lors de la soumission définitive
    if (!isDraft) {
      const agentToRelease = access.intervention?.agent_id || access.alert?.assigned_agent_id;
      if (agentToRelease) {
        const nextDuty = await InterventionLifecycleService.resolveAgentDutyStatusAfterMissionEnd(
          agentToRelease,
          access.intervention?.id
        );
        await supabaseAdmin
          .from('security_agents')
          .update({ duty_status: nextDuty, updated_at: nowIso })
          .eq('id', agentToRelease);
      }

      try {
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action: 'INTERVENTION_REPORT_SUBMITTED',
          entity_type: 'intervention',
          entity_id: access.intervention?.id || access.alert.id,
          details: {
            alert_number: access.alert.alert_number,
            photos_count: photos.length,
            checklist_count: checklist.filter((c: any) => c.checked).length,
          },
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1',
          user_agent: req.headers.get('user-agent') || 'Securia Agent Web',
        });
      } catch (auditErr) {
        console.warn('[Report Route] Audit log note:', auditErr);
      }
    }

    // 5. Notifications automatiques
    if (!isDraft) {
      try {
        await NotificationService.notifyInterventionCompleted({
          alertId: access.alert.id,
          alertNumber: access.alert.alert_number,
          clientUserId: access.client?.id || access.alert.user_id,
          reportSummary: shortSummary,
          clientEmail: access.client?.email,
        });
      } catch (notifErr) {
        console.warn('[Report API] Notification non bloquante erreur:', notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      report_status: reportStatus,
      message: isDraft
        ? 'Brouillon de rapport enregistré avec succès.'
        : 'Rapport d’intervention officiellement soumis au centre de sécurité.',
      report: structuredReport,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’enregistrement du rapport d’intervention');
  }
}

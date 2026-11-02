import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse, sanitizeString } from '@/lib/security/api-guard';
import { resolveInterventionWithAccess, serializeStructuredReport } from '@/lib/interventions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WebhookDispatcher } from '@/lib/webhooks/webhook-dispatcher';

/**
 * POST /api/interventions/[id]/validate
 * Validation officielle du rapport de mission par le responsable SOC ou administrateur.
 * Débloque la consultation et le téléchargement du Proof of Intervention côté client.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
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

    const body = await req.json().catch(() => ({}));
    const notes = body.notes ? sanitizeString(body.notes, 1000) : undefined;

    // Récupérer le nom complet du superviseur
    const { data: supervisorUser } = await supabaseAdmin
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const validatorName = supervisorUser?.full_name || 'Superviseur SOC';
    const nowIso = new Date().toISOString();

    const currentReport = access.proof.report;
    currentReport.report_status = 'REPORT_VALIDATED';
    currentReport.validation = {
      validated_at: nowIso,
      validated_by: user.id,
      validator_name: validatorName,
      notes: notes || null,
    };

    const serializedReport = serializeStructuredReport(currentReport);

    // 1. Mise à jour de l'intervention
    if (access.intervention?.id) {
      await supabaseAdmin
        .from('interventions')
        .update({
          report: serializedReport,
          updated_at: nowIso,
        })
        .eq('id', access.intervention.id);
    }

    // 2. Mise à jour de l'alerte
    await supabaseAdmin
      .from('alerts')
      .update({
        resolution_report: serializedReport,
        updated_at: nowIso,
      })
      .eq('id', access.alert.id);

    // 3. Journalisation d'audit
    await supabaseAdmin.from('alert_events').insert({
      alert_id: access.alert.id,
      actor_id: user.id,
      from_status: access.alert.status,
      to_status: 'RESOLVED',
      event_type: 'REPORT_VALIDATED',
      comment: `Rapport validé par le responsable SOC (${validatorName}). Dossier Proof of Intervention certifié et disponible.`,
      metadata: {
        validator_id: user.id,
        validator_name: validatorName,
        validated_at: nowIso,
        supervisor_notes: notes || null,
      },
    });

    // 4. Notification au client que son rapport d'intervention est validé
    try {
      const clientId = access.client?.id || access.alert.user_id;
      if (clientId) {
        await supabaseAdmin.from('notifications').insert({
          user_id: clientId,
          title: 'Rapport d’intervention validé',
          message: `Le rapport de l'intervention #${access.proof.alert_number} a été validé par le centre de sécurité et est disponible au téléchargement.`,
          type: 'REPORT_AVAILABLE',
          link: `/client-portal/interventions/${access.proof.id}`,
          alert_id: access.alert.id,
          intervention_id: access.proof.id,
          role: 'USER',
        });
      }
    } catch (notifErr) {
      console.warn('[Validate API] Notification client non bloquante erreur:', notifErr);
    }

    // 5. Expédition automatique des webhooks partenaires (Section 27 & 30)
    try {
      if (access.proof) {
        WebhookDispatcher.dispatchToPartners('REPORT_VALIDATED', access.proof).catch(err => {
          console.warn('[Validate API] Webhook dispatch async error:', err);
        });
      }
    } catch (whErr) {
      console.warn('[Validate API] Webhook dispatch non bloquant erreur:', whErr);
    }

    return NextResponse.json({
      success: true,
      report_status: 'REPORT_VALIDATED',
      message: 'Rapport d’intervention validé avec succès. Le document certifié est désormais accessible au client.',
      validated_at: nowIso,
      validator_name: validatorName,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la validation du rapport d’intervention');
  }
}

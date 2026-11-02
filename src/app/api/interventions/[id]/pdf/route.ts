import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { resolveInterventionWithAccess, generateProofOfInterventionPdf } from '@/lib/interventions';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/interventions/[id]/pdf
 * Génération et téléchargement sécurisé du document officiel PDF "PROOF OF INTERVENTION".
 * Contrôles stricts :
 * - Authentification valide
 * - Cloisonnement organisationnel & Anti-IDOR
 * - Contrôle de publication pour les clients (rapport soumis/validé ou alerte résolue)
 * - Traçabilité dans alert_events (PDF_GENERATED)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
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

    const result = await resolveInterventionWithAccess(id, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!result.allowed || !result.proof) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const proof = result.proof;

    // Règle métier client : Si l'utilisateur est un client (USER), le rapport doit être achevé ou validé
    if (user.role === 'USER') {
      const isResolved = ['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(proof.status);
      const isReportReady =
        proof.report.report_status === 'REPORT_VALIDATED' ||
        proof.report.report_status === 'REPORT_SUBMITTED' ||
        isResolved;

      if (!isReportReady) {
        return NextResponse.json(
          {
            error:
              'Le rapport d’intervention est en cours de rédaction par le patrouilleur et n’a pas encore été validé par le centre de sécurité.',
          },
          { status: 403 }
        );
      }
    }

    // Traçabilité de l'action dans les alert_events (sans bloquer)
    try {
      await supabaseAdmin.from('alert_events').insert({
        alert_id: proof.alert_id,
        actor_id: user.id,
        event_type: 'PDF_GENERATED',
        comment: `Téléchargement du document certifié Proof of Intervention par ${user.role} (${user.id}).`,
        metadata: {
          user_id: user.id,
          role: user.role,
          intervention_id: proof.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('[PDF API] Erreur journalisation audit trail (non bloquant):', auditErr);
    }

    // Génération du flux binaire PDF
    const pdfBuffer = await generateProofOfInterventionPdf(proof);

    const filename = `PROOF-OF-INTERVENTION-${proof.alert_number}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la génération du PDF d’intervention');
  }
}

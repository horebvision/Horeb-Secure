import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { QuotaService } from '@/lib/billing/quota-service';

// Store d'idempotence mémoire serveur pour éviter les doublons d'événements synchronisés
const serverProcessedEvents = new Map<string, { processedAt: string; status: string }>();

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'ADMIN', 'SECURITY_MANAGER'],
    });
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const organizationId = user.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Organisation introuvable pour cet agent' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { events = [], gps_points = [] } = body;

    const results: Record<string, { status: string; error?: string }> = {};

    // 1. Traitement séquentiel et idempotent des événements Outbox
    for (const event of events) {
      const clientEventId = event.client_event_id;
      if (!clientEventId) continue;

      // a) Règle d'idempotence : Déjà traité ?
      if (serverProcessedEvents.has(clientEventId)) {
        results[clientEventId] = {
          status: 'ALREADY_PROCESSED',
        };
        continue;
      }

      try {
        const { entity_type, operation, payload, entity_id } = event;

        // b) Vérification des quotas pour toute opération consommatrice
        if (entity_type === 'INTERVENTION_STATUS' && operation === 'STATUS_CHANGE') {
          // Contrôle de conflit : l'intervention est-elle déjà terminée ?
          if (payload?.target_status === 'ARRIVED' && payload?.current_server_status === 'RESOLVED') {
            results[clientEventId] = {
              status: 'CONFLICT',
              error: 'Conflit : L’intervention a déjà été clôturée par le superviseur',
            };
            continue;
          }

          // Contrôle de quota interventions du mois
          const quotaCheck = await QuotaService.canConsume(organizationId, 'MAX_INTERVENTIONS_MONTH');
          if (!quotaCheck.allowed) {
            results[clientEventId] = {
              status: 'FAILED',
              error: 'QUOTA_EXCEEDED : Le quota mensuel d’interventions est atteint',
            };
            continue;
          }
        }

        // c) Traitement du rapport d'intervention synchronisé
        if (entity_type === 'INTERVENTION_REPORT' && operation === 'REPORT_SUBMIT') {
          // Validation de la présence des informations obligatoires
          if (!payload?.findings && !payload?.actions_taken) {
            results[clientEventId] = {
              status: 'FAILED',
              error: 'Données de rapport incomplètes',
            };
            continue;
          }
        }

        // d) Enregistrement du succès
        serverProcessedEvents.set(clientEventId, {
          processedAt: new Date().toISOString(),
          status: 'SYNCED',
        });

        results[clientEventId] = {
          status: 'SYNCED',
        };
      } catch (itemErr: any) {
        results[clientEventId] = {
          status: 'FAILED',
          error: itemErr.message || 'Erreur lors du traitement',
        };
      }
    }

    return NextResponse.json({
      success: true,
      processed_count: Object.keys(results).length,
      results,
      gps_synced: Array.isArray(gps_points) && gps_points.length > 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return safeErrorResponse(err);
  }
}

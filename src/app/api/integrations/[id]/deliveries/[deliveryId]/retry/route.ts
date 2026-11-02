/**
 * POST /api/integrations/[id]/deliveries/[deliveryId]/retry
 * Déclenchement manuel d'un réessai de livraison webhook (Section 37)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, checkRateLimit } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';
import { WebhookDispatcher } from '@/lib/webhooks/webhook-dispatcher';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; deliveryId: string }> }
) {
  try {
    const { id, deliveryId } = await params;
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Rate Limiting : max 10 réessais par minute
    const rl = await checkRateLimit(`delivery_retry_${user.id}`, 10, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de réessais demandés. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const partner = await WebhookRepository.getPartnerById(id);

    if (!partner) {
      return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 });
    }

    // Isolation stricte par organisation (Section 41 & 54)
    if (partner.organization_id !== orgId) {
      return NextResponse.json({ error: 'Accès non autorisé à ce partenaire' }, { status: 403 });
    }

    const delivery = await WebhookRepository.getDeliveryById(deliveryId);
    if (!delivery || delivery.partner_id !== id) {
      return NextResponse.json({ error: 'Livraison introuvable pour ce partenaire' }, { status: 404 });
    }

    // Exécution du réessai
    const updatedDelivery = await WebhookDispatcher.retryDelivery(deliveryId);

    return NextResponse.json({
      success: updatedDelivery.status === 'SUCCESS',
      message: updatedDelivery.status === 'SUCCESS' ? 'Livraison réessayée avec succès' : `Échec du réessai (${updatedDelivery.last_error || 'Erreur'})`,
      delivery: {
        id: updatedDelivery.id,
        event_id: updatedDelivery.event_id,
        status: updatedDelivery.status,
        attempt_count: updatedDelivery.attempt_count,
        response_code: updatedDelivery.response_code,
        last_error: updatedDelivery.last_error,
        next_retry_at: updatedDelivery.next_retry_at,
        completed_at: updatedDelivery.completed_at,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du réessai de livraison');
  }
}

/**
 * GET /api/integrations/[id]/deliveries
 * Journalisation des livraisons de webhooks pour un partenaire donné (Section 37)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, getTenantOrgId } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const partner = await WebhookRepository.getPartnerById(id);

    if (!partner) {
      return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 });
    }

    // Protection IDOR / Isolation stricte par organisation (Section 41 & 54)
    if (partner.organization_id !== orgId) {
      return NextResponse.json({ error: 'Accès non autorisé à ce partenaire' }, { status: 403 });
    }

    const deliveries = await WebhookRepository.getDeliveriesByPartner(id);

    // Sanitisé : aucun secret exposé, payload nettoyé
    const sanitizedDeliveries = deliveries.map(d => ({
      id: d.id,
      partner_id: d.partner_id,
      event_id: d.event_id,
      event_type: d.event_type,
      status: d.status,
      attempt_count: d.attempt_count,
      response_code: d.response_code,
      last_error: d.last_error,
      next_retry_at: d.next_retry_at,
      sent_at: d.sent_at,
      created_at: d.created_at,
      completed_at: d.completed_at,
    }));

    return NextResponse.json({
      success: true,
      deliveries: sanitizedDeliveries,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des livraisons');
  }
}

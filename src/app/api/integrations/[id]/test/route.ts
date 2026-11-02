/**
 * POST /api/integrations/[id]/test
 * Déclenchement d'un événement de test synthétique explicitement tagué test: true (Section 38)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';
import { WebhookDispatcher } from '@/lib/webhooks/webhook-dispatcher';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

export async function POST(
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

    // Rate Limiting : max 5 tests par minute
    const rl = await checkRateLimit(`webhook_test_${user.id}`, 5, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de requêtes de test. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    const orgId = getTenantOrgId(user);
    const partner = await WebhookRepository.getPartnerById(id);

    if (!partner) {
      return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 });
    }

    // Isolation stricte / Anti-IDOR
    if (partner.organization_id !== orgId) {
      return NextResponse.json({ error: 'Accès non autorisé à ce partenaire' }, { status: 403 });
    }

    // Expédition du webhook synthétique
    const delivery = await WebhookDispatcher.sendTestWebhook(id);

    // Audit : WEBHOOK_TESTED (Section 48)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'WEBHOOK_TESTED',
      entity_type: 'webhook_deliveries',
      entity_id: delivery.id,
      details: {
        partner_id: id,
        event_id: delivery.event_id,
        status: delivery.status,
        response_code: delivery.response_code,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: delivery.status === 'SUCCESS',
      message: delivery.status === 'SUCCESS' ? 'Webhook de test délivré avec succès' : `Échec de livraison : ${delivery.last_error || 'Erreur inconnue'}`,
      delivery: {
        id: delivery.id,
        event_id: delivery.event_id,
        status: delivery.status,
        response_code: delivery.response_code,
        last_error: delivery.last_error,
        sent_at: delivery.sent_at,
        completed_at: delivery.completed_at,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du test du webhook');
  }
}

/**
 * POST /api/integrations/[id]/rotate-secret
 * Rotation cryptographique du secret HMAC du webhook (Section 29)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';
import { generatePartnerSecret, hashPartnerSecret } from '@/lib/webhooks/webhook-signer';
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

    // Rate Limiting : max 3 rotations par minute
    const rl = await checkRateLimit(`secret_rotate_${user.id}`, 3, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de rotations demandées. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    const orgId = getTenantOrgId(user);
    const partner = await WebhookRepository.getPartnerById(id);

    if (!partner) {
      return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 });
    }

    // Protection IDOR / Isolation stricte
    if (partner.organization_id !== orgId) {
      return NextResponse.json({ error: 'Accès non autorisé à ce partenaire' }, { status: 403 });
    }

    // Génération d'un nouveau secret cryptographique
    const rawSecret = generatePartnerSecret();
    const secretHash = hashPartnerSecret(rawSecret);

    // Mise à jour sécurisée
    WebhookRepository.updatePartnerSecret(id, rawSecret, secretHash);
    await WebhookRepository.updatePartner(id, { secret_hash: secretHash });

    // Audit : WEBHOOK_SECRET_ROTATED (Section 48) - SANS JAMAIS inclure le secret en clair
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'WEBHOOK_SECRET_ROTATED',
      entity_type: 'integration_partners',
      entity_id: id,
      details: {
        partner_id: id,
        organization_id: orgId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Secret régénéré avec succès. Conservez précieusement le secret affiché ci-dessous, il ne pourra plus être récupéré.',
      secret: rawSecret, // Affiché une seule fois
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la rotation du secret');
  }
}

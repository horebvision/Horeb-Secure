/**
 * GET /api/integrations
 * POST /api/integrations
 * Gestion des partenaires d'intégration (Assurances, Systèmes Métier) et configuration des webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';
import { generatePartnerSecret, hashPartnerSecret } from '@/lib/webhooks/webhook-signer';
import { validateWebhookUrl } from '@/lib/webhooks/ssrf-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const partners = await WebhookRepository.getPartnersByOrg(orgId);

    // Calcul des statistiques de livraison pour chaque partenaire
    const partnersWithStats = await Promise.all(
      partners.map(async (p) => {
        const deliveries = await WebhookRepository.getDeliveriesByPartner(p.id);
        const successCount = deliveries.filter(d => d.status === 'SUCCESS').length;
        const failureCount = deliveries.filter(d => d.status === 'FAILED').length;
        const lastDelivery = deliveries.length > 0 ? deliveries[0].sent_at || deliveries[0].created_at : null;

        return {
          id: p.id,
          organization_id: p.organization_id,
          name: p.name,
          type: p.type,
          status: p.status,
          endpoint_url: p.endpoint_url,
          events: p.events,
          created_at: p.created_at,
          updated_at: p.updated_at,
          stats: {
            total_deliveries: deliveries.length,
            success_count: successCount,
            failure_count: failureCount,
            last_delivery_at: lastDelivery,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      partners: partnersWithStats,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des partenaires');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Rate Limiting : max 10 créations par minute
    const rl = await checkRateLimit(`partner_create_${user.id}`, 10, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de requêtes. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = sanitizeString(body.name || '', 100);
    const type = body.type || 'INSURER';
    const endpointUrl = body.endpoint_url?.trim() || '';
    const events = Array.isArray(body.events) && body.events.length > 0 ? body.events : ['REPORT_VALIDATED'];

    if (!name) {
      return NextResponse.json({ error: 'Le nom du partenaire est obligatoire.' }, { status: 400 });
    }

    // Validation anti-SSRF & HTTPS (Section 27 & 40)
    const urlValidation = validateWebhookUrl(endpointUrl, { allowLocalhostInDev: true });
    if (!urlValidation.valid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }

    const orgId = getTenantOrgId(user);

    // Contrôles SaaS Phase 6 : Habilitation Webhooks & Quotas
    const { EntitlementService } = await import('@/lib/billing/entitlement-service');
    const { QuotaService } = await import('@/lib/billing/quota-service');
    await EntitlementService.assertFeature(orgId, 'WEBHOOKS');
    await QuotaService.assertCanConsume(orgId, 'maxWebhooks');

    // Génération cryptographique du secret (Section 28 & 29)
    const rawSecret = generatePartnerSecret();
    const secretHash = hashPartnerSecret(rawSecret);

    const newPartner = await WebhookRepository.createPartner({
      organization_id: orgId,
      name,
      type,
      status: 'ACTIVE',
      endpoint_url: urlValidation.sanitizedUrl!,
      secret_hash: secretHash,
      events,
      raw_secret: rawSecret,
    });

    // Audit : PARTNER_CREATED (Section 48)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'PARTNER_CREATED',
      entity_type: 'integration_partners',
      entity_id: newPartner.id,
      details: {
        partner_id: newPartner.id,
        name,
        type,
        endpoint_url: urlValidation.sanitizedUrl,
        events,
        organization_id: orgId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Partenaire configuré avec succès. Conservez précieusement le secret affiché ci-dessous, il ne pourra plus être récupéré.',
      partner: {
        id: newPartner.id,
        name: newPartner.name,
        type: newPartner.type,
        status: newPartner.status,
        endpoint_url: newPartner.endpoint_url,
        events: newPartner.events,
        created_at: newPartner.created_at,
      },
      secret: rawSecret, // Affiché une seule fois
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la configuration du partenaire');
  }
}

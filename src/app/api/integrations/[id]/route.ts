/**
 * PATCH /api/integrations/[id]
 * DELETE /api/integrations/[id]
 * Mise à jour et désactivation d'un partenaire d'intégration
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { WebhookRepository } from '@/lib/webhooks/repository';
import { validateWebhookUrl } from '@/lib/webhooks/ssrf-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

export async function PATCH(
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

    const body = await req.json().catch(() => ({}));
    const updates: any = {};

    if (body.name !== undefined) {
      const sanitizedName = sanitizeString(body.name, 100);
      if (!sanitizedName) {
        return NextResponse.json({ error: 'Le nom du partenaire ne peut pas être vide' }, { status: 400 });
      }
      updates.name = sanitizedName;
    }

    if (body.status !== undefined) {
      if (!['ACTIVE', 'INACTIVE'].includes(body.status)) {
        return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.type !== undefined) {
      if (!['INSURER', 'CLIENT_SYSTEM', 'SECURITY_PARTNER', 'OTHER'].includes(body.type)) {
        return NextResponse.json({ error: 'Type de partenaire invalide' }, { status: 400 });
      }
      updates.type = body.type;
    }

    if (body.events !== undefined) {
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return NextResponse.json({ error: 'Au moins un événement doit être sélectionné' }, { status: 400 });
      }
      updates.events = body.events;
    }

    if (body.endpoint_url !== undefined) {
      const urlValidation = validateWebhookUrl(body.endpoint_url, { allowLocalhostInDev: true });
      if (!urlValidation.valid) {
        return NextResponse.json({ error: urlValidation.error }, { status: 400 });
      }
      updates.endpoint_url = urlValidation.sanitizedUrl;
    }

    const updated = await WebhookRepository.updatePartner(id, updates);

    // Audit Trail (Section 48)
    const action = updates.status === 'INACTIVE' ? 'PARTNER_DISABLED' : 'PARTNER_UPDATED';
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action,
      entity_type: 'integration_partners',
      entity_id: id,
      details: {
        partner_id: id,
        updates,
        organization_id: orgId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      partner: {
        id: updated?.id,
        name: updated?.name,
        type: updated?.type,
        status: updated?.status,
        endpoint_url: updated?.endpoint_url,
        events: updated?.events,
        created_at: updated?.created_at,
        updated_at: updated?.updated_at,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la mise à jour du partenaire');
  }
}

export async function DELETE(
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

    // Désactivation sécurisée (Soft Delete)
    await WebhookRepository.updatePartner(id, { status: 'INACTIVE' });

    // Audit Trail : PARTNER_DISABLED (Section 48)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'PARTNER_DISABLED',
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
      message: 'Partenaire désactivé avec succès',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la désactivation du partenaire');
  }
}

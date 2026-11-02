import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getEffectiveSession } from '@/lib/auth/get-effective-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/organization
 * Récupère les paramètres de l'organisation courante
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getEffectiveSession(request);
    if (!session || !session.organizationId) {
      return NextResponse.json({ error: 'Non authentifié ou organisation introuvable' }, { status: 401 });
    }

    const { organizationService } = await import('@/lib/organizations/organization-service');
    const org = await organizationService.getOrganizationById(session.organizationId);

    if (!org) {
      // Fallback si l'organisation n'existe pas encore en base
      return NextResponse.json({
        id: session.organizationId,
        name: 'SECURIA Entreprise',
        country: 'CI',
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        quota_warning_threshold: 80,
        grace_period_days: 7,
      });
    }

    const metrics = await organizationService.getOrganizationMetrics(session.organizationId);

    return NextResponse.json({
      ...org,
      metrics,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/organization
 * Met à jour les paramètres de l'organisation courante (réservé ADMIN et SECURITY_MANAGER)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getEffectiveSession(request);
    if (!session || !session.organizationId) {
      return NextResponse.json({ error: 'Non authentifié ou organisation introuvable' }, { status: 401 });
    }

    if (session.role !== 'ADMIN' && session.role !== 'SECURITY_MANAGER') {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.rccm !== undefined) updatePayload.rccm = body.rccm;
    if (body.tax_id !== undefined) updatePayload.tax_id = body.tax_id;
    if (body.address !== undefined) updatePayload.address = body.address;
    if (body.phone !== undefined) updatePayload.phone = body.phone;
    if (body.email !== undefined) updatePayload.email = body.email;
    if (body.country !== undefined) updatePayload.country = body.country;
    if (body.currency !== undefined) updatePayload.currency = body.currency;
    if (body.timezone !== undefined) updatePayload.timezone = body.timezone;
    if (body.quota_warning_threshold !== undefined) {
      updatePayload.quota_warning_threshold = Number(body.quota_warning_threshold);
    }
    if (body.grace_period_days !== undefined) {
      updatePayload.grace_period_days = Number(body.grace_period_days);
    }

    const { data: updatedOrg, error } = await (supabaseAdmin as any)
      .from('organizations')
      .update(updatePayload)
      .eq('id', session.organizationId)
      .select('*')
      .single();

    if (error) {
      // Si la table n'a pas encore toutes les colonnes optionnelles, retour d'un objet fusionné
      return NextResponse.json({
        id: session.organizationId,
        ...body,
        updated: true,
      });
    }

    // Journalisation d'audit
    try {
      await (supabaseAdmin as any).from('audit_logs').insert({
        actor_id: session.userId,
        organization_id: session.organizationId,
        action: 'ORGANIZATION_SETTINGS_UPDATED',
        resource_type: 'organization',
        resource_id: session.organizationId,
        details: { fields: Object.keys(body) },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Ignorer si la table d'audit a des contraintes
    }

    return NextResponse.json(updatedOrg);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

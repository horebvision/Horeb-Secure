import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/security/api-guard';
import { ApiKeyService } from '@/lib/api-keys/api-key-service';
import { ApiKeyScope } from '@/lib/api-keys/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const orgId = user.organizationId || 'fa000000-0000-0000-0000-000000000001';
    const keys = await ApiKeyService.listApiKeys(orgId);

    return NextResponse.json({
      success: true,
      apiKeys: keys,
    });
  } catch (err: any) {
    console.error('Error listing API keys:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await req.json();
    const { name, scopes, expiresInDays } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Le nom de la clé API est obligatoire' }, { status: 400 });
    }

    const validScopes: ApiKeyScope[] = Array.isArray(scopes) && scopes.length > 0
      ? scopes
      : ['alerts:read', 'interventions:read'];

    const orgId = user.organizationId || 'fa000000-0000-0000-0000-000000000001';

    // Contrôles SaaS Phase 6 : Habilitation du module & Quota de clés
    const { EntitlementService } = await import('@/lib/billing/entitlement-service');
    const { QuotaService } = await import('@/lib/billing/quota-service');
    await EntitlementService.assertFeature(orgId, 'API_KEYS');
    await QuotaService.assertCanConsume(orgId, 'maxApiKeys');

    const result = await ApiKeyService.createApiKey({
      organization_id: orgId,
      name: name.trim(),
      scopes: validScopes,
      expires_in_days: expiresInDays ? Number(expiresInDays) : null,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      apiKey: result.apiKey,
      secretKey: result.fullSecretKey,
      message: 'Conservez précieusement cette clé secrète, elle ne sera plus jamais affichée.',
    }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating API key:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

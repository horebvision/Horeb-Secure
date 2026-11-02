/**
 * POST /api/exports
 * GET /api/exports?preview=true
 * Génération et prévisualisation d'exports multi-interventions (CSV + ZIP)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { ExportService } from '@/lib/exports/export-service';
import { ExportFilters } from '@/lib/exports/types';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filters: ExportFilters = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      siteId: searchParams.get('siteId') || undefined,
      status: searchParams.get('status') || undefined,
      incidentType: searchParams.get('incidentType') || undefined,
      severity: searchParams.get('severity') || undefined,
      slaStatus: searchParams.get('slaStatus') || undefined,
      agentId: searchParams.get('agentId') || undefined,
      searchQuery: searchParams.get('search') || undefined,
      includePhotos: searchParams.get('includePhotos') !== 'false',
    };

    const summary = await ExportService.getPreviewSummary(filters, user);
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la prévisualisation de l’export');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Rate Limiting : max 10 exports par minute
    const rl = await checkRateLimit(`export_${user.id}`, 10, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de requêtes d’export. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    // Contrôle SaaS Phase 6 : Habilitation EXPORTS
    const orgId = getTenantOrgId(user);
    const { EntitlementService } = await import('@/lib/billing/entitlement-service');
    await EntitlementService.assertFeature(orgId, 'EXPORTS');

    const body = await req.json().catch(() => ({}));
    const filters: ExportFilters = body.filters || {};

    const result = await ExportService.executeExport(filters, user);

    return NextResponse.json({
      success: true,
      job: result.job,
      download_url: result.downloadUrl,
      is_immediate: result.isImmediate,
      total_items: result.totalItems,
      csv_preview: result.csvPreview,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la création de l’export');
  }
}

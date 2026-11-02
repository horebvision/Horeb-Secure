import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { AnalyticsService } from '@/lib/analytics/analytics-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/analytics
 * API Publique v1 — Données analytiques et KPIs agrégés
 * Header requis : X-SECURIA-API-KEY ou session autorisée
 * Scope requis : analytics:read
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'analytics:read');
    if (response || !auth) return response!;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') as any) || '30d';
    const siteId = searchParams.get('site_id') || undefined;
    const incidentType = searchParams.get('type') || undefined;

    const summary = await AnalyticsService.getExecutiveKpis({
      organizationId: auth.organizationId,
      dateRange: range,
      siteId,
      incidentType,
    });

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

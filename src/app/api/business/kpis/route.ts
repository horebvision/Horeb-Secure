import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/security/api-guard';
import { AnalyticsService } from '@/lib/analytics/analytics-service';
import { DateRangeKey } from '@/lib/analytics/types';

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

    const { searchParams } = new URL(req.url);
    const dateRange = (searchParams.get('range') || '30d') as DateRangeKey;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const siteId = searchParams.get('siteId') || undefined;
    const incidentType = searchParams.get('type') || undefined;
    const severity = searchParams.get('severity') || undefined;

    const data = await AnalyticsService.getExecutiveKpis({
      organizationId: user.organizationId || 'fa000000-0000-0000-0000-000000000001',
      dateRange,
      startDate,
      endDate,
      siteId,
      incidentType,
      severity,
    });

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error('Error fetching executive KPIs:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

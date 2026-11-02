import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getTenantOrgId } from '@/lib/security/api-guard';
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

    const data = await AnalyticsService.getAgentPerformance({
      organizationId: getTenantOrgId(user),
      dateRange,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      agents: data,
    });
  } catch (err: any) {
    console.error('Error fetching agent performance analytics:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

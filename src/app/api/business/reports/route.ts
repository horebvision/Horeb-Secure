import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getTenantOrgId } from '@/lib/security/api-guard';
import { ExecutiveReportBuilder, ReportType } from '@/lib/reports/executive-report-builder';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/business/reports
 * Génère un rapport analytique exécutif pour l'organisation
 * Rôles autorisés : ADMIN, SECURITY_MANAGER
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });
    if (errorResponse || !user) return errorResponse!;

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') as ReportType) || 'MONTHLY';
    const format = searchParams.get('format') || 'json'; // json, csv, html
    const orgId = getTenantOrgId(user);

    const report = await ExecutiveReportBuilder.generateReport(type, {
      organizationId: orgId,
      dateRange: (searchParams.get('range') as any) || '30d',
    });

    if (format === 'csv' && report.csvContent) {
      return new NextResponse(report.csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="rapport_${type.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === 'html') {
      return new NextResponse(report.htmlContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

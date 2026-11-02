import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getTenantOrgId } from '@/lib/security/api-guard';
import { QuotaService } from '@/lib/billing/quota-service';
import type { UsageSummary } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/usage
 * Retourne la consommation réelle des quotas pour l'organisation
 * Adapté à la fois pour UsageSummary et OrganizationUsageStats
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const orgStats = await QuotaService.getOrganizationUsageStats(orgId);
    const m = orgStats.metrics || {};

    const summary: UsageSummary = {
      users: {
        used: m.maxUsers?.current || 0,
        limit: m.maxUsers?.max || 25,
        percentage: m.maxUsers?.percentage || 0,
      },
      agents: {
        used: m.maxAgents?.current || 0,
        limit: m.maxAgents?.max || 50,
        percentage: m.maxAgents?.percentage || 0,
      },
      sites: {
        used: m.maxSites?.current || 0,
        limit: m.maxSites?.max || 25,
        percentage: m.maxSites?.percentage || 0,
      },
      clients: {
        used: m.maxClients?.current || 0,
        limit: m.maxClients?.max || 50,
        percentage: m.maxClients?.percentage || 0,
      },
      interventions: {
        used: m.maxInterventionsMonth?.current || 0,
        limit: m.maxInterventionsMonth?.max || 100,
        percentage: m.maxInterventionsMonth?.percentage || 0,
      },
      apiKeys: {
        used: m.maxApiKeys?.current || 0,
        limit: m.maxApiKeys?.max || 5,
        percentage: m.maxApiKeys?.percentage || 0,
      },
      webhooks: {
        used: m.maxWebhooks?.current || 0,
        limit: m.maxWebhooks?.max || 5,
        percentage: m.maxWebhooks?.percentage || 0,
      },
    };

    return NextResponse.json({
      success: true,
      usage: summary,
      stats: orgStats,
    });
  } catch (err: any) {
    console.error('Error fetching usage stats:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de calculer les quotas' },
      { status: 500 }
    );
  }
}

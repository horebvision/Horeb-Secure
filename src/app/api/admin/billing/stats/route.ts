import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin } from '@/lib/security/api-guard';
import { CommercialStatsService } from '@/lib/billing/commercial-stats-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/billing/stats
 * Tableau de bord commercial et financier (MRR contractuel vs encaissé, ARR, statuts)
 * Habilitation stricte : Super Admin Plateforme (Platform Admin) exclusivement
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const stats = await CommercialStatsService.getDashboardStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('Error fetching admin billing stats:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de calculer les statistiques commerciales' },
      { status: 500 }
    );
  }
}

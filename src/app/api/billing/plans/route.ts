import { NextRequest, NextResponse } from 'next/server';
import { PlanCatalog } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/plans
 * Retourne le catalogue des offres commerciales en Francs CFA (XOF)
 */
export async function GET(req: NextRequest) {
  try {
    const plans = await PlanCatalog.getPlans(true);
    return NextResponse.json({
      success: true,
      currency: 'XOF',
      plans,
    });
  } catch (err: any) {
    console.error('Error fetching plans:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de récupérer les plans' },
      { status: 500 }
    );
  }
}

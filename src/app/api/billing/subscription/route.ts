import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getTenantOrgId } from '@/lib/security/api-guard';
import { SubscriptionService } from '@/lib/billing/subscription-service';
import { PlanCatalog } from '@/lib/billing/plans';
import { PlanCode, BillingCycle } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/subscription
 * Retourne l'abonnement actif de l'organisation connectée
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
    const subscription = await SubscriptionService.getSubscription(orgId);
    const plan = await PlanCatalog.getPlanByCode(subscription.planCode);

    return NextResponse.json({
      success: true,
      subscription,
      plan,
    });
  } catch (err: any) {
    console.error('Error fetching subscription:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de récupérer l’abonnement' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing/subscription
 * Change le plan ou le cycle de facturation
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'], // Réservé à l'administrateur de l'organisation
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const orgId = getTenantOrgId(user);
    const body = await req.json();
    const { planCode, billingCycle, reason } = body;

    if (!planCode) {
      return NextResponse.json({ success: false, error: 'Code de plan requis' }, { status: 400 });
    }

    const validPlan = await PlanCatalog.getPlanByCode(planCode);
    if (!validPlan) {
      return NextResponse.json({ success: false, error: 'Plan inexistant' }, { status: 400 });
    }

    const updated = await SubscriptionService.changePlan(
      orgId,
      planCode as PlanCode,
      (billingCycle as BillingCycle) || 'MONTHLY',
      reason
    );

    return NextResponse.json({
      success: true,
      subscription: updated,
      message: `Votre abonnement a été mis à jour vers l'offre ${validPlan.name}.`,
    });
  } catch (err: any) {
    console.error('Error updating subscription:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de modifier l’abonnement' },
      { status: 500 }
    );
  }
}

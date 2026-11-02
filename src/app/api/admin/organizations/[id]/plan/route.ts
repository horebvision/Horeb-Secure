import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';
import { SubscriptionService } from '@/lib/billing/subscription-service';
import { PlanCatalog } from '@/lib/billing/plans';

/**
 * GET /api/admin/organizations/[id]/plan
 * Récupère le plan actuel, quotas et détails d'abonnement de l'organisation.
 * Réservé exclusivement au Platform Admin (Super Admin).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant invalide' }, { status: 400 });
    }

    const org = await organizationService.getOrganizationById(id);
    if (!org) {
      return NextResponse.json({ success: false, error: 'Entreprise introuvable' }, { status: 404 });
    }

    const subscription = await SubscriptionService.getSubscription(id);
    const plan = await PlanCatalog.getPlanByCode(subscription.planCode);
    const availablePlans = await PlanCatalog.getPlans(true);

    return NextResponse.json({
      success: true,
      organization: org,
      subscription,
      plan,
      availablePlans,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la lecture du plan d\'abonnement');
  }
}

/**
 * PATCH /api/admin/organizations/[id]/plan
 * Modifie discrétionnairement le plan SaaS, le cycle et le statut de facturation.
 * Réservé exclusivement au Super Admin (Platform Admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const targetPlan = body.plan || body.planCode;

    if (!targetPlan) {
      return NextResponse.json(
        { success: false, error: 'Le code du plan est obligatoire (STARTER, PROFESSIONNEL, BUSINESS_OS, ENTERPRISE).' },
        { status: 400 }
      );
    }

    const result = await organizationService.updateOrganizationPlan(
      id,
      {
        plan: targetPlan,
        billingCycle: body.billingCycle,
        status: body.status,
        trialDays: body.trialDays,
        reason: body.reason,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      message: `Plan SaaS mis à jour vers "${result.organization.plan}" avec succès !`,
      organization: result.organization,
      subscription: result.subscription,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la modification du plan d\'abonnement');
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(req, context);
}

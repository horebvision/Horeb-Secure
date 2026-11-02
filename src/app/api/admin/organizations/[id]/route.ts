import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

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

    const metrics = await organizationService.getOrganizationMetrics(id);

    return NextResponse.json({
      success: true,
      organization: org,
      metrics,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des détails de l\'entreprise');
  }
}

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
    let updatedOrg: any = null;
    let updatedSub: any = null;

    // Si une modification de plan ou de cycle SaaS est demandée
    if (body.plan || body.planCode || body.billingCycle || body.status || body.trialDays !== undefined) {
      const planRes = await organizationService.updateOrganizationPlan(
        id,
        {
          plan: body.plan || body.planCode,
          billingCycle: body.billingCycle,
          status: body.status,
          trialDays: body.trialDays,
          reason: body.reason,
        },
        user.id
      );
      updatedOrg = planRes.organization;
      updatedSub = planRes.subscription;
    }

    // Mise à jour des informations générales de l'organisation si fournies
    const { plan, planCode, billingCycle, trialDays, reason, ...generalUpdates } = body;
    if (Object.keys(generalUpdates).length > 0) {
      updatedOrg = await organizationService.updateOrganization(id, generalUpdates, user.id);
    }

    if (!updatedOrg) {
      updatedOrg = await organizationService.getOrganizationById(id);
    }

    return NextResponse.json({
      success: true,
      message: 'Entreprise et plan SaaS mis à jour avec succès',
      organization: updatedOrg,
      subscription: updatedSub,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la mise à jour de l\'entreprise');
  }
}

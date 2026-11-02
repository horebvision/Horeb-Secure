import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * GET /api/admin/organizations
 * Liste toutes les entreprises de la plateforme avec leurs indicateurs SaaS.
 * Réservé exclusivement au Platform Admin (Super Admin).
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 })
      );
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const organizations = await organizationService.listOrganizations({
      status: status as any,
      search,
    });

    return NextResponse.json({
      success: true,
      count: organizations.length,
      organizations,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des entreprises');
  }
}

/**
 * POST /api/admin/organizations
 * Crée une nouvelle entreprise cliente (Tenant) avec souscription, quotas et administrateur initial.
 * Réservé exclusivement au Platform Admin.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 })
      );
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const body = await req.json().catch(() => ({}));

    if (!body.name || !body.adminEmail) {
      return NextResponse.json(
        {
          success: false,
          error: 'Le nom de l\'entreprise et l\'email de l\'administrateur sont obligatoires.',
        },
        { status: 400 }
      );
    }

    const result = await organizationService.createOrganization(
      {
        name: body.name,
        commercialName: body.commercialName,
        legalName: body.legalName,
        rccm: body.rccm,
        ncc: body.ncc,
        country: body.country || 'Côte d\'Ivoire',
        city: body.city || 'Abidjan',
        address: body.address,
        phone: body.phone,
        email: body.email,
        currency: body.currency || 'XOF',
        timezone: body.timezone || 'Africa/Abidjan',
        plan: body.plan || 'BUSINESS_OS',
        billingCycle: body.billingCycle || 'MONTHLY',
        trialDays: body.trialDays ?? 14,
        adminFullName: body.adminFullName || 'Administrateur Entreprise',
        adminEmail: body.adminEmail,
        adminPassword: body.adminPassword,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Entreprise créée avec succès',
      organization: result.organization,
      adminUser: result.adminUser,
      subscription: result.subscription,
      credentials: result.credentials,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la création de l\'entreprise');
  }
}

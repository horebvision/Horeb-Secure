import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * GET /api/admin/overview
 * Fournit les métriques consolidées SaaS de la plateforme SECURIA.
 * Réservé exclusivement au Platform Admin (Super Admin).
 */
export async function GET(req: NextRequest) {
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

    const overview = await organizationService.getPlatformOverview();

    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du calcul de la synthèse plateforme');
  }
}

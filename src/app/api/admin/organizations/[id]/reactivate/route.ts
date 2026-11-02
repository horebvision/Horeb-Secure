import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * POST /api/admin/organizations/[id]/reactivate
 * Réactive une entreprise suspendue.
 * Réservé exclusivement au Platform Admin.
 */
export async function POST(
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

    const reactivated = await organizationService.reactivateOrganization(id, user.id);

    return NextResponse.json({
      success: true,
      message: `L'entreprise ${reactivated.name} a été réactivée avec succès.`,
      organization: reactivated,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la réactivation');
  }
}

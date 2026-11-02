import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * POST /api/admin/organizations/[id]/credentials
 * Réinitialise ou génère les identifiants d'accès pour l'administrateur de l'organisation.
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
      return NextResponse.json({ success: false, error: 'Identifiant d’organisation invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const customPassword = body.customPassword || body.password;

    const credentials = await organizationService.resetOrganizationAdminPassword(id, customPassword);

    return NextResponse.json({
      success: true,
      message: 'Identifiants réinitialisés avec succès',
      credentials,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la réinitialisation des identifiants');
  }
}

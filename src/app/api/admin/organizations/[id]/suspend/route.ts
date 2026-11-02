import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * POST /api/admin/organizations/[id]/suspend
 * Suspend une entreprise cliente sans supprimer aucune donnée (soft-freeze).
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

    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Suspension administrative plateforme';

    const suspended = await organizationService.suspendOrganization(id, reason, user.id);

    return NextResponse.json({
      success: true,
      message: `L'entreprise ${suspended.name} a été suspendue avec succès. Données conservées intactes.`,
      organization: suspended,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la suspension');
  }
}

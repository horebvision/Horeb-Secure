import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';

/**
 * POST /api/secretariat/visits/[id]/checkout
 * Clôture la visite et enregistre le départ de toutes les personnes encore présentes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant de visite invalide' }, { status: 400 });
    }

    const result = await secretariatService.checkoutVisit(id, user.organizationId, user.id);

    return NextResponse.json({
      success: true,
      message: `${result.checkedOutCount} visiteur(s) enregistré(s) en sortie.`,
      checkedOutCount: result.checkedOutCount,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la clôture de la visite');
  }
}

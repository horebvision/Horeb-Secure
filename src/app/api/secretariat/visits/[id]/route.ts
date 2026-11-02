import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';

/**
 * GET /api/secretariat/visits/[id]
 * Récupère le détail d'une visite avec vérification Anti-IDOR stricte.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant de visite invalide' }, { status: 400 });
    }

    const visit = await secretariatService.getVisitById(id, user.organizationId);

    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visite introuvable ou vous n’avez pas l’accès à cette ressource.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      visit,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération de la visite');
  }
}

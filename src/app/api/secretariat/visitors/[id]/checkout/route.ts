import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';

/**
 * POST /api/secretariat/visitors/[id]/checkout
 * Enregistre le départ individuel d'un visiteur avec calcul de durée serveur atomique.
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
      return NextResponse.json({ success: false, error: 'Identifiant visiteur invalide' }, { status: 400 });
    }

    const result = await secretariatService.checkoutPerson(id, user.organizationId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Sortie enregistrée avec succès.',
      duration_minutes: result.duration_minutes,
      person: result.person,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de l’enregistrement de la sortie');
  }
}

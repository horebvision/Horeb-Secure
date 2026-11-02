import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { resolveInterventionWithAccess } from '@/lib/interventions';

/**
 * GET /api/interventions/[id]/proof
 * Retourne le dossier structuré de Proof of Intervention avec contrôle strict d'accès (anti-IDOR).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: 'Identifiant d’intervention invalide (format UUID)' },
        { status: 400 }
      );
    }

    const result = await resolveInterventionWithAccess(id, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!result.allowed) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      proof: result.proof,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation du Proof of Intervention');
  }
}

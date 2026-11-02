import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';

/**
 * GET /api/secretariat/visitors/[id]/document-url?docId=...
 * Génère une URL signée éphémère (120 secondes) pour consulter un document privé.
 * Journalise la consultation d'audit (IDENTITY_DOCUMENT_ACCESSED).
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
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId');

    if (!docId || !isValidUuid(docId)) {
      return NextResponse.json({ success: false, error: 'Identifiant document invalide' }, { status: 400 });
    }

    const result = await secretariatService.getSignedDocumentUrl(docId, user.organizationId, user.id);

    return NextResponse.json({
      success: true,
      signedUrl: result.signedUrl,
      documentType: result.document.document_type,
      capturedAt: result.document.captured_at,
      expiresInSeconds: 120,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la génération de l’accès au document');
  }
}

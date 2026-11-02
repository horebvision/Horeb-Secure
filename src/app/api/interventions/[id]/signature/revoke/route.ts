/**
 * POST /api/interventions/[id]/signature/revoke
 * Révocation formelle d'une signature d'intervention par un superviseur SOC ou administrateur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { SignatureService } from '@/lib/signatures/signature-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'ID intervention invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = body.reason;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { error: 'Le motif de révocation est obligatoire.' },
        { status: 400 }
      );
    }

    const revokedSignature = await SignatureService.revokeSignature(
      id,
      reason,
      {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        organizationId: user.organizationId,
        isPlatformAdmin: user.isPlatformAdmin,
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Signature révoquée avec succès. L’historique probatoire est conservé.',
      signature: revokedSignature,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la révocation de la signature', err.status || 500);
  }
}

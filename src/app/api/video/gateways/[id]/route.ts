/**
 * GET    /api/video/gateways/[id] - Détail et diagnostic en temps réel de la passerelle
 * DELETE /api/video/gateways/[id] - Révocation opérationnelle de la passerelle
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, isValidUuid, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant de passerelle invalide.' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const gateway = await VideoRepository.getVideoGatewayById(id, orgId);

    if (!gateway) {
      return NextResponse.json({ error: 'Passerelle introuvable ou non autorisée.' }, { status: 404 });
    }

    // Diagnostic temps réel
    const diagnostic = await VideoRepository.getGatewayDiagnostic(id, orgId);

    return NextResponse.json({
      success: true,
      gateway,
      diagnostic,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération de la passerelle');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const orgId = getTenantOrgId(user);
    const revoked = await VideoRepository.revokeGateway(id, orgId, user.id);

    if (!revoked) {
      return NextResponse.json({ error: 'Passerelle introuvable.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Passerelle Edge révoquée avec succès.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la révocation de la passerelle');
  }
}

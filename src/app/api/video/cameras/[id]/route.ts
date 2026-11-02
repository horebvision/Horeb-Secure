/**
 * GET   /api/video/cameras/[id] - Détail d'une caméra (Anti-IDOR)
 * PATCH /api/video/cameras/[id] - Modification des attributs d'une caméra
 * DELETE /api/video/cameras/[id] - Désactivation sécurisée d'une caméra
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, isValidUuid } from '@/lib/security/api-guard';
import { VideoRepository, sanitizeCameraForClient } from '@/lib/video';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant caméra invalide' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const camera = await VideoRepository.getCameraById(id, orgId);

    if (!camera) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès refusé (Anti-IDOR)' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      camera: sanitizeCameraForClient(camera),
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la consultation de la caméra');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant caméra invalide' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const body = await req.json();

    const updates: any = {};
    if (body.name) updates.name = sanitizeString(body.name, 120);
    if (body.status) updates.status = body.status;
    if (body.is_primary !== undefined) updates.is_primary = !!body.is_primary;
    if (body.location_description) updates.location_description = sanitizeString(body.location_description, 200);
    if (typeof body.latitude === 'number') updates.latitude = body.latitude;
    if (typeof body.longitude === 'number') updates.longitude = body.longitude;
    if (Array.isArray(body.capabilities)) updates.capabilities = body.capabilities;

    const updated = await VideoRepository.updateCamera(id, orgId, updates, user.id);
    if (!updated) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès non autorisé' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Caméra mise à jour avec succès.',
      camera: sanitizeCameraForClient(updated),
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la mise à jour de la caméra');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant caméra invalide' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const ok = await VideoRepository.disableCamera(id, orgId, user.id);

    if (!ok) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès non autorisé' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Caméra désactivée avec succès du registre opérationnel.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la désactivation de la caméra');
  }
}

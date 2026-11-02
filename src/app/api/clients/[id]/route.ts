import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { clientService } from '@/lib/clients/client-service';
import type { UpdateClientInput } from '@/lib/clients/types';

/**
 * GET /api/clients/[id]
 * Récupère le détail d'un client avec vérification Anti-IDOR stricte.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant client invalide' }, { status: 400 });
    }

    // Anti-IDOR : vérification d'appartenance à l'organisation
    const client = await clientService.getClientById(
      id,
      user.organizationId
    );

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Client introuvable ou vous n’avez pas l’accès à cette ressource.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      client,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération du client');
  }
}

/**
 * PATCH /api/clients/[id] & PUT /api/clients/[id]
 * Met à jour les informations d'un client avec vérification Anti-IDOR.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdate(req, params);
}

async function handleUpdate(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 });
    }

    const { id } = await paramsPromise;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant client invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const updates: UpdateClientInput = body;

    const updated = await clientService.updateClient(
      id,
      user.organizationId,
      updates,
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Fiche client mise à jour avec succès.',
      client: updated,
    });
  } catch (err: any) {
    if (err.code === 'CLIENT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    return safeErrorResponse(err, err.message || 'Erreur lors de la modification du client');
  }
}

/**
 * DELETE /api/clients/[id]
 * Archive / supprime un client (réservé aux administrateurs de l'organisation).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant client invalide' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const soft = searchParams.get('soft') === 'true';

    if (soft) {
      await clientService.deleteClient(id, user.organizationId, user.id, false);
      return NextResponse.json({
        success: true,
        message: 'Client archivé avec succès.',
      });
    }

    await clientService.hardDeleteClient(id, user.organizationId, user.id);

    return NextResponse.json({
      success: true,
      message: 'Client et accès associés supprimés définitivement avec succès.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la suppression du client');
  }
}

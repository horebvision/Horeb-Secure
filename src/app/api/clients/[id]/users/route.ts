import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { clientService } from '@/lib/clients/client-service';
import type { InviteClientUserInput } from '@/lib/clients/types';

/**
 * GET /api/clients/[id]/users
 * Liste les utilisateurs rattachés au client spécifié avec vérification Anti-IDOR.
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

    // Anti-IDOR : vérifier que le client appartient à l'organisation
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

    const users = await clientService.listClientUsers(id, user.organizationId);

    return NextResponse.json({
      success: true,
      users,
      count: users.length,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des utilisateurs du client');
  }
}

/**
 * POST /api/clients/[id]/users
 * Invite un nouvel utilisateur rattaché à ce client avec rôle strict USER.
 */
export async function POST(
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

    // Anti-IDOR : vérifier que le client appartient à l'organisation
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

    const body = await req.json().catch(() => ({}));
    const { email, full_name, phone, allowed_site_ids } = body;

    if (!email || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Nom complet et email sont obligatoires.' },
        { status: 400 }
      );
    }

    const inviteInput: InviteClientUserInput = {
      email,
      full_name,
      phone,
      allowed_site_ids: Array.isArray(allowed_site_ids) ? allowed_site_ids : [],
    };

    const { invitation, inviteUrl } = await clientService.inviteClientUser(
      id,
      user.organizationId,
      inviteInput,
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Invitation générée avec succès.',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        full_name: invitation.full_name,
        role: invitation.role,
        status: invitation.status,
        expires_at: invitation.expires_at,
        created_at: invitation.created_at,
      },
      inviteUrl,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de l’invitation du contact client');
  }
}

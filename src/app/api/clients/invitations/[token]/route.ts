import { NextRequest, NextResponse } from 'next/server';
import { clientService } from '@/lib/clients/client-service';
import { safeErrorResponse } from '@/lib/security/api-guard';

/**
 * GET /api/clients/invitations/[token]
 * Vérifie la validité d'un jeton d'invitation client pour afficher le formulaire d'activation.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ success: false, error: 'Jeton d’invitation invalide' }, { status: 400 });
    }

    const invitation = await clientService.getInvitationByToken(token);
    if (!invitation) {
      return NextResponse.json(
        { success: false, error: 'Invitation introuvable ou invalide.' },
        { status: 404 }
      );
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: 'Cette invitation a déjà été utilisée ou a été révoquée.' },
        { status: 410 }
      );
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'Cette invitation a expiré. Veuillez contacter votre société de sécurité.' },
        { status: 410 }
      );
    }

    // Récupérer le nom du client associé
    const client = await clientService.getClientById(invitation.client_id, invitation.organization_id);

    return NextResponse.json({
      success: true,
      invitation: {
        email: invitation.email,
        full_name: invitation.full_name,
        role: invitation.role,
        client_name: client?.name || 'Client',
        expires_at: invitation.expires_at,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la vérification de l’invitation');
  }
}

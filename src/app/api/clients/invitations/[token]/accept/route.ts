import { NextRequest, NextResponse } from 'next/server';
import { clientService } from '@/lib/clients/client-service';
import { safeErrorResponse } from '@/lib/security/api-guard';

/**
 * POST /api/clients/invitations/[token]/accept
 * Active une invitation client en définissant le mot de passe initial.
 * Crée le profil utilisateur avec rôle strict USER (Client), sans aucun privilège d'administration.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ success: false, error: 'Jeton d’invitation invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { password } = body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' },
        { status: 400 }
      );
    }

    const result = await clientService.acceptClientInvitation(token, password);

    return NextResponse.json({
      success: true,
      message: 'Compte client activé avec succès. Vous pouvez maintenant vous connecter au Portail Client.',
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.fullName,
        role: result.user.role,
      },
      client: {
        id: result.client.id,
        name: result.client.name,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de l’activation de votre compte');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/signout
 * Déconnexion complète côté serveur :
 * 1. Fermeture de session dans Supabase Auth
 * 2. Suppression de tous les cookies de session et de rôle
 */
function clearAuthCookies(response: NextResponse, req: NextRequest) {
  const cookiesToClear = [
    'securia_role',
    'sb-access-token',
    'sb-refresh-token',
  ];

  cookiesToClear.forEach((cookieName) => {
    response.cookies.set(cookieName, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      sameSite: 'lax',
    });
  });

  // Nettoyer tous les cookies Supabase commençant par sb-
  req.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      });
    }
  });
}

/**
 * POST /api/auth/signout
 * Déconnexion complète côté serveur (JSON)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    const response = NextResponse.json({
      success: true,
      message: 'Déconnexion réussie. Session et caches révoqués.',
    });

    clearAuthCookies(response, req);
    return response;
  } catch (err: any) {
    console.error('[API /api/auth/signout] Erreur lors de la déconnexion:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Erreur lors de la déconnexion' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/signout
 * Déconnexion directe avec redirection immédiate vers /login (sans erreur RSC)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err: any) {
    console.warn('[API /api/auth/signout] Note signout GET:', err);
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('logged_out', '1');
  const response = NextResponse.redirect(loginUrl);
  clearAuthCookies(response, req);
  return response;
}


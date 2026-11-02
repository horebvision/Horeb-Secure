import { NextRequest, NextResponse } from 'next/server';
import { createClient as createClientJS } from '@supabase/supabase-js';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/api-guard';

/**
 * POST /api/auth/activate
 * Activation d'un collaborateur invité (Secrétaire, Agent, Contrôleur Dispatch, Admin).
 *
 * SÉCURITÉ : cette route ne définit JAMAIS de mot de passe et ne lit JAMAIS user_metadata.
 * Elle déclenche l'envoi d'un lien de définition de mot de passe à l'adresse du compte,
 * ce qui prouve la possession de la boîte email. Le mot de passe est ensuite défini
 * sur /reset-password avec la session de récupération Supabase.
 * La réponse est identique que le compte existe ou non (pas d'énumération).
 */
const GENERIC_MESSAGE =
  'Si un compte collaborateur correspond à cette adresse, un lien d’activation vient de vous être envoyé par email.';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const rateLimit = await checkRateLimit(`auth_activate_${ip}`, 5, 15 * 60 * 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Trop de tentatives. Réessayez dans ${rateLimit.resetInSeconds}s.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Une adresse email valide est obligatoire.' },
        { status: 400 }
      );
    }

    if (!isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return NextResponse.json(
        { success: false, error: 'Service de gestion des comptes indisponible.' },
        { status: 503 }
      );
    }

    // Seuls les profils provisionnés par un administrateur (public.users) peuvent être activés.
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, is_active')
      .eq('email', email)
      .maybeSingle();

    if (dbUser?.id && dbUser.is_active !== false) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
      const anonClient = createClientJS(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { error } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      });
      if (error) {
        console.error('[API /auth/activate] Envoi du lien impossible:', error.message);
      }
    }

    return NextResponse.json({ success: true, emailSent: true, message: GENERIC_MESSAGE });
  } catch (err: any) {
    console.error('[API /auth/activate] Exception:', err);
    return NextResponse.json(
      { success: false, error: 'Erreur interne lors de l’activation du compte.' },
      { status: 500 }
    );
  }
}

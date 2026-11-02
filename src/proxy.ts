/**
 * SECURIA — Proxy (Next.js Edge Middleware)
 * =========================================
 * 1. Synchronisation des cookies de session Supabase SSR
 * 2. Contrôle RBAC strict basé sur l'authentification réelle
 * 3. Redirection automatique vers l'espace du rôle après connexion
 * 4. Protection serveur contre l'usurpation d'habilitation
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';
import {
  assertAuthorizedSupabaseUrl,
  assertEnvironmentConsistency,
  getAppEnv,
  type AppEnv,
} from '@/lib/config/env';

export async function proxy(request: NextRequest) {
  // 0. Contrôle de cohérence d'environnement strict et universel (DEF-C13-B)
  // S'exécute pour TOUTE requête, y compris si NEXT_PUBLIC_APP_ENV='production',
  // et AVANT toute décision fondée sur l'environnement, bypass marketing ou initialisation Supabase.
  let currentAppEnv: AppEnv;
  try {
    assertEnvironmentConsistency();
    currentAppEnv = getAppEnv();
  } catch (envErr: any) {
    console.error('[SECURIA EDGE CONFIG ERROR] Incohérence d\'environnement bloquée :', envErr?.message);
    return new NextResponse(
      `[SECURIA CONFIG ERROR - ENVIRONMENT REJECTED] ${envErr?.message || 'Incohérence d\'environnement détectée'}`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  // Contrôle fail-closed de la configuration Supabase en environnement Staging (DEF-02, DEF-C13-B)
  const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (currentAppEnv === 'staging') {
    try {
      assertAuthorizedSupabaseUrl(rawSupabaseUrl);
    } catch (configErr: any) {
      console.error('[SECURIA EDGE CONFIG ERROR] Staging bloqué :', configErr?.message);
      return new NextResponse(
        `[SECURIA CONFIG ERROR - STAGING BLOCKED] ${configErr?.message || 'Configuration staging non homologuée'}`,
        { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }
  }

  const pathname = request.nextUrl.pathname;

  // 1. Bypasser immédiatement les pages publiques marketing (environnement préalablement validé)
  if (
    pathname === '/' ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/request-demo')
  ) {
    return NextResponse.next();
  }

  // 2. Redirections d'alias d'URL ergonomiques (/client -> /dashboard, /soc -> /dispatch)
  if (pathname === '/client' || pathname.startsWith('/client/')) {
    const targetPath = pathname.replace(/^\/client/, '/dashboard');
    return NextResponse.redirect(new URL(targetPath || '/dashboard', request.url));
  }
  if (pathname === '/soc' || pathname.startsWith('/soc/')) {
    const targetPath = pathname.replace(/^\/soc/, '/dispatch');
    return NextResponse.redirect(new URL(targetPath || '/dispatch', request.url));
  }

  try {
    let supabaseResponse = NextResponse.next({
      request,
    });

    const supabaseUrl = rawSupabaseUrl || 'https://placeholder.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Vérification cryptographique de la session active Supabase Auth
    let user = null;
    try {
      const userRes = await supabase.auth.getUser();
      user = userRes.data?.user || null;
    } catch {
      // Ignorer si la session est expirée ou si Supabase est temporairement indisponible
    }

    const isAuthenticated = !!user;

    // Récupération sécurisée du profil certifié depuis public.users (DEF-C13-A)
    // SÉCURITÉ ABSOLUE : user_metadata.role, user_metadata.is_platform_admin et le cookie securia_role
    // ne sont JAMAIS utilisés comme autorité pour accorder un accès privilégié.
    let dbUser: { role: UserRole; is_active: boolean; organization_id: string | null } | null = null;
    let subscriptionStatus: string | null = null;
    if (user) {
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('role, is_active, organization_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          dbUser = {
            role: profile.role as UserRole,
            is_active: Boolean(profile.is_active),
            organization_id: profile.organization_id || null,
          };

          // Contrôle automatique de l'état de l'abonnement SaaS de l'organisation
          if (profile.organization_id && profile.role !== 'USER') {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('status')
              .eq('organization_id', profile.organization_id)
              .maybeSingle();
            subscriptionStatus = sub?.status || null;
          }
        }
      } catch {
        // En cas de panne de lecture DB dans l'Edge runtime, dbUser reste null.
        // Les contrôles stricts des layouts SSR refuseront l'accès aux zones privilégiées.
      }
    }

    const verifiedRole: UserRole | null = (dbUser && dbUser.is_active) ? dbUser.role : null;

    // Redirection automatique des secrétaires certifiées depuis l'espace client vers le secrétariat
    if (
      verifiedRole === 'SECRETARY' &&
      (pathname === '/dashboard' ||
        pathname.startsWith('/dashboard/') ||
        pathname.startsWith('/sites') ||
        pathname.startsWith('/contacts') ||
        pathname.startsWith('/history') ||
        pathname.startsWith('/alerts') ||
        pathname.startsWith('/client-portal'))
    ) {
      return NextResponse.redirect(new URL('/secretariat', request.url));
    }

    // 3. Pages publiques d'authentification
    const isAuthPage =
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password');

    // Si l'utilisateur est déjà connecté et tente d'accéder à /login ou /register, rediriger vers son espace réel
    if (isAuthPage && isAuthenticated) {
      let target = '/dashboard';
      if (verifiedRole === 'ADMIN') {
        const isPlatform = isPlatformAdminUser({
          role: verifiedRole,
          email: user?.email,
          organizationId: dbUser?.organization_id,
        });
        target = isPlatform ? '/admin' : '/dispatch';
      }
      else if (verifiedRole === 'SECURITY_MANAGER') target = '/dispatch';
      else if (verifiedRole === 'SECRETARY') target = '/secretariat';
      else if (verifiedRole === 'AGENT') target = '/agent';

      return NextResponse.redirect(new URL(target, request.url));
    }

    // 4. Protection RBAC des routes applicatives par rôle certifié
    const protectedRoutes = [
      { prefix: '/admin', roles: ['ADMIN'] as UserRole[] },
      { prefix: '/dispatch', roles: ['SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/agent', roles: ['AGENT', 'ADMIN'] as UserRole[] },
      { prefix: '/sites', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/contacts', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/history', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/dashboard', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/alert', roles: ['USER', 'SECURITY_MANAGER', 'AGENT', 'ADMIN'] as UserRole[] },
      { prefix: '/alerts', roles: ['USER', 'SECURITY_MANAGER', 'AGENT', 'ADMIN'] as UserRole[] },
      { prefix: '/billing', roles: ['SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/business', roles: ['SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/client-portal', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/settings', roles: ['USER', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
      { prefix: '/profile', roles: ['USER', 'SECURITY_MANAGER', 'AGENT', 'ADMIN', 'SECRETARY'] as UserRole[] },
      { prefix: '/secretariat', roles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'] as UserRole[] },
    ];

    for (const route of protectedRoutes) {
      if (pathname.startsWith(route.prefix)) {
        if (!isAuthenticated) {
          const loginUrl = new URL('/login', request.url);
          loginUrl.searchParams.set('redirect', pathname);
          return NextResponse.redirect(loginUrl);
        }

        // Si l'utilisateur a un profil chargé mais est inactif : refus d'accès
        if (dbUser && !dbUser.is_active) {
          const unauthorizedUrl = new URL('/unauthorized', request.url);
          unauthorizedUrl.searchParams.set('reason', 'inactive');
          return NextResponse.redirect(unauthorizedUrl);
        }

        // Si le rôle certifié en DB est connu et ne fait pas partie des rôles autorisés
        if (verifiedRole && !route.roles.includes(verifiedRole)) {
          const unauthorizedUrl = new URL('/unauthorized', request.url);
          unauthorizedUrl.searchParams.set('required', route.roles.join(','));
          unauthorizedUrl.searchParams.set('current', verifiedRole);
          return NextResponse.redirect(unauthorizedUrl);
        }

        // Cas particulier /admin : un rôle certifié non-ADMIN est envoyé au SOC (/dispatch)
        if (route.prefix === '/admin' && verifiedRole && verifiedRole !== 'ADMIN') {
          return NextResponse.redirect(new URL('/dispatch', request.url));
        }

        // Verrouillage SaaS : Si l'abonnement de l'entreprise est suspendu ou expiré,
        // bloquer l'accès opérationnel (/dispatch, /business, /secretariat) et rediriger vers /billing
        const isPlatform = isPlatformAdminUser({
          role: verifiedRole,
          email: user?.email,
          organizationId: dbUser?.organization_id,
        });

        if (
          !isPlatform &&
          subscriptionStatus &&
          ['SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(subscriptionStatus) &&
          !pathname.startsWith('/billing') &&
          (route.prefix === '/dispatch' || route.prefix === '/business' || route.prefix === '/secretariat')
        ) {
          const billingUrl = new URL('/billing', request.url);
          billingUrl.searchParams.set('warning', 'subscription_suspended');
          return NextResponse.redirect(billingUrl);
        }

        // Note : Si dbUser est null (panne réseau ou limitation Edge), le proxy n'accorde
        // aucun privilège basé sur metadata/cookie, et laisse le contrôle d'autorité SSR
        // des layouts décider de façon sûre côté serveur.
      }
    }

    return supabaseResponse;
  } catch (err) {
    console.error('Proxy internal error caught gracefully:', err);
    const isProtected = [
      '/admin', '/dispatch', '/agent', '/sites', '/contacts',
      '/history', '/dashboard', '/alert', '/alerts', '/billing', '/business',
      '/client-portal', '/settings', '/profile', '/secretariat',
    ].some((p) => pathname.startsWith(p));

    if (isProtected) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }
}

export const middleware = proxy;
export default proxy;

export const config = {
  matcher: [
    '/admin/:path*',
    '/dispatch/:path*',
    '/agent/:path*',
    '/sites/:path*',
    '/contacts/:path*',
    '/history/:path*',
    '/dashboard/:path*',
    '/alert/:path*',
    '/alerts/:path*',
    '/billing/:path*',
    '/business/:path*',
    '/client-portal/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/client/:path*',
    '/soc/:path*',
    '/secretariat/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};


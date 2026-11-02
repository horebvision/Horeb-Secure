import { createClient } from '@/lib/supabase/client';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  organizationId?: string | null;
  securityCenterId?: string | null;
  avatarUrl?: string | null;
  isPlatformAdmin?: boolean;
  emergencyContacts?: any[];
}

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role?: UserRole;
  organizationId?: string;
  securityCenterId?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export class AuthService {
  private static getClient() {
    return createClient();
  }

  /**
   * Retourne la route par défaut selon le rôle et les privilèges plateforme de l'utilisateur
   * - Super Admin Plateforme -> /admin
   * - Administrateur Entreprise (ex: Horeb vision) -> /dispatch (SOC Opérationnel)
   * - Responsable Sécurité -> /dispatch
   * - Agent -> /agent
   * - Client -> /dashboard
   */
  public static getRedirectPathForRole(role: UserRole, isPlatformAdmin = false): string {
    switch (role) {
      case 'ADMIN':
        return isPlatformAdmin ? '/admin' : '/dispatch';
      case 'SECURITY_MANAGER':
        return '/dispatch';
      case 'SECRETARY':
        return '/secretariat';
      case 'AGENT':
        return '/agent';
      case 'USER':
      default:
        return '/dashboard';
    }
  }

  /**
   * Inscription d'un nouvel utilisateur dans Supabase Auth et public.users
   */
  public static async signUp(params: SignUpParams) {
    const supabase = this.getClient();
    // Sécurité B2B : Interdiction d'auto-attribution des rôles privilégiés depuis le client
    const forbiddenRoles: UserRole[] = ['ADMIN', 'SECURITY_MANAGER', 'SECRETARY', 'AGENT'];
    const role: UserRole = (params.role && !forbiddenRoles.includes(params.role)) ? params.role : 'USER';
    // Aucun rattachement implicite : l'organisation est attribuée côté serveur (invitation / admin),
    // jamais par défaut à l'organisation maître de la plateforme.
    const organizationId = params.organizationId || null;
    const securityCenterId = params.securityCenterId || null;

    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          full_name: params.fullName,
          phone: params.phone,
          role: role,
          organization_id: organizationId,
          security_center_id: securityCenterId,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    // Enregistrer le cookie de rôle pour le middleware
    if (typeof document !== 'undefined') {
      document.cookie = `securia_role=${role}; path=/; max-age=604800; SameSite=Lax`;
    }

    return {
      user: data.user,
      session: data.session,
      redirectPath: this.getRedirectPathForRole(role),
    };
  }

  /**
   * Connexion avec email et mot de passe
   */
  public static async signIn(params: SignInParams) {
    const supabase = this.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Utilisateur introuvable');
    }

    // Récupérer le rôle réel et l'organisation depuis public.users ou métadonnées
    // Rôle et organisation certifiés depuis public.users uniquement (user_metadata non fiable)
    let userRole: UserRole = 'USER';
    let userOrgId: string | null = null;

    try {
      const { data: dbUser } = await supabase
        .from('users')
        .select('role, full_name, phone, organization_id, security_center_id, email')
        .eq('id', data.user.id)
        .maybeSingle();

      if (dbUser) {
        if (dbUser.role) userRole = dbUser.role as UserRole;
        if (dbUser.organization_id) userOrgId = dbUser.organization_id;
      }
    } catch {
      // Utiliser le rôle des métadonnées en cas d'indisponibilité
    }

    let isPlatformAdmin = isPlatformAdminUser({
      role: userRole,
      email: data.user.email,
      organizationId: userOrgId,
    });

    if (!isPlatformAdmin && userRole === 'ADMIN') {
      try {
        const { data: paData } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (paData?.user_id) {
          isPlatformAdmin = true;
        }
      } catch {
        // Tolérance
      }
    }

    // Mettre à jour les cookies et stockage local pour l'isolation multi-tenant et le middleware
    if (typeof document !== 'undefined') {
      document.cookie = `securia_role=${userRole}; path=/; max-age=604800; SameSite=Lax`;
    }
    if (userOrgId) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('securia_org_id', userOrgId);
        } catch {}
      }
      if (typeof document !== 'undefined') {
        document.cookie = `securia_org_id=${encodeURIComponent(userOrgId)}; path=/; max-age=604800; SameSite=Lax`;
      }
    }

    return {
      user: data.user,
      session: data.session,
      role: userRole,
      organizationId: userOrgId,
      isPlatformAdmin,
      redirectPath: this.getRedirectPathForRole(userRole, isPlatformAdmin),
    };
  }

  /**
   * Déconnexion sécurisée et réinitialisation intégrale des sessions et caches
   */
  public static async signOut() {
    // 1. Suppression synchrone immédiate des cookies de session côté client
    if (typeof document !== 'undefined') {
      const cookiesToPurge = ['securia_role', 'securia_org_id', 'sb-access-token', 'sb-refresh-token'];
      cookiesToPurge.forEach((c) => {
        document.cookie = `${c}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      });
      // Purge également tout cookie commençant par sb-
      document.cookie.split(';').forEach((cookie) => {
        const name = cookie.split('=')[0].trim();
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
        }
      });
    }

    // 2. Nettoyage immédiat du stockage local client
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('securia_org_id');
        localStorage.removeItem('securia_agent_duty_status');
        localStorage.removeItem('securia_alerts_v1');
        localStorage.removeItem('securia_events_v1');
        localStorage.removeItem('securia_sites_v1');
        localStorage.removeItem('securia_current_role_v1');
        sessionStorage.clear();
      } catch {
        // Ignorer
      }
    }

    // 3. Déconnexion réseau en parallèle (serveur + client Supabase) sans blocage
    const supabase = this.getClient();
    await Promise.allSettled([
      typeof window !== 'undefined'
        ? fetch('/api/auth/signout', { method: 'POST', keepalive: true }).catch(() => {})
        : Promise.resolve(),
      supabase.auth.signOut().catch(() => {}),
      (async () => {
        try {
          const { offlineDb } = await import('@/lib/offline/indexed-db');
          await offlineDb.clearAllUserData();
        } catch {
          // Ignorer
        }
      })(),
    ]);
  }

  /**
   * Demande de réinitialisation de mot de passe par email
   */
  public static async resetPassword(email: string, redirectTo?: string) {
    const supabase = this.getClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    const redirectUrl = redirectTo || `${appUrl}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  /**
   * Mise à jour du mot de passe utilisateur
   */
  public static async updatePassword(newPassword: string) {
    const supabase = this.getClient();

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  }

  /**
   * Récupère la session active et le profil utilisateur vérifié
   */
  public static async getCurrentSessionUser(): Promise<AuthSessionUser | null> {
    // 1. Tenter la récupération directe et vérifiée depuis l'API serveur /api/auth/profile
    if (typeof window !== 'undefined') {
      try {
        const supabaseClient = this.getClient();
        const { data: { session } } = await supabaseClient.auth.getSession();
        const headers: Record<string, string> = { 'Cache-Control': 'no-cache' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/auth/profile', {
          headers,
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && json.profile) {
            const p = json.profile;
            const isPlatform = p.isPlatformAdmin !== undefined
              ? p.isPlatformAdmin
              : isPlatformAdminUser({
                  role: p.role,
                  email: p.email,
                  organizationId: p.organizationId,
                });
            return {
              id: p.id,
              email: p.email,
              fullName: p.fullName,
              phone: p.phone,
              role: p.role,
              organizationId: p.organizationId,
              securityCenterId: p.securityCenterId,
              avatarUrl: p.avatarUrl,
              isPlatformAdmin: isPlatform,
              emergencyContacts: p.emergencyContacts || [],
            };
          }
        }
      } catch {
        // Fallback client direct si réseau indisponible
      }
    }

    // 2. Fallback via le client Supabase direct
    const supabase = this.getClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Rôle, organisation et centre : public.users uniquement (user_metadata non fiable)
    let role: UserRole = 'USER';
    let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
    let phone = user.user_metadata?.phone || '';
    let organizationId: string | null = null;
    let securityCenterId: string | null = null;
    let avatarUrl = user.user_metadata?.avatar_url || null;

    try {
      const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (dbUser) {
        role = (dbUser.role as UserRole) || role;
        fullName = dbUser.full_name || fullName;
        phone = dbUser.phone || phone;
        organizationId = dbUser.organization_id || null;
        securityCenterId = dbUser.security_center_id || null;
        avatarUrl = dbUser.avatar_url || avatarUrl;
      }
    } catch {
      // Ignorer
    }

    let isPlatform = isPlatformAdminUser({
      role,
      email: user.email,
      organizationId,
    });

    if (!isPlatform && role === 'ADMIN') {
      try {
        const { data: paData } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (paData?.user_id) {
          isPlatform = true;
        }
      } catch {
        // Ignorer
      }
    }

    return {
      id: user.id,
      email: user.email || '',
      fullName,
      phone,
      role,
      organizationId,
      securityCenterId,
      avatarUrl,
      isPlatformAdmin: isPlatform,
      emergencyContacts: [],
    };
  }
}

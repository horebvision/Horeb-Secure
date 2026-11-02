import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import { createClient as createClientJS } from '@supabase/supabase-js';
import { type UserRole, isPlatformAdminUser, MASTER_PLATFORM_ORG_ID } from '@/modules/users/types';
import { assertAuthorizedSupabaseUrl } from '@/lib/config/env';


export interface AuthenticatedApiUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  organizationId: string | null;
  securityCenterId: string | null;
  clientId?: string | null;
  isPlatformAdmin?: boolean;
  isTestOrDemo?: boolean;
}

// ============================================================================
// 1. GESTION DU RATE LIMITING ET ANTI-SPAM (Distribué via PostgreSQL)
// ============================================================================
// En serverless, chaque instance a sa propre mémoire : un compteur en mémoire ne limite rien.
// Le compteur de référence est donc la fonction PostgreSQL securia_rate_limit_hit (atomique,
// partagée entre instances). Le compteur mémoire ne sert que de repli si la base est injoignable.
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

type RateLimitResult = { allowed: boolean; remaining: number; resetInSeconds: number };

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Vérifie et incrémente le quota de requêtes par IP / Identifiant
 */
export async function checkRateLimit(
  identifier: string,
  limit = 20,
  windowMs = 60000
): Promise<RateLimitResult> {
  try {
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      const { data, error } = await supabaseAdmin.rpc('securia_rate_limit_hit', {
        p_key: identifier.slice(0, 200),
        p_limit: limit,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      });
      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row.allowed === 'boolean') {
          return {
            allowed: row.allowed,
            remaining: Number(row.remaining ?? 0),
            resetInSeconds: Number(row.reset_in_seconds ?? 0),
          };
        }
      }
    }
  } catch (err) {
    console.warn('[API Guard] Rate limit distribué indisponible, repli mémoire:', err);
  }
  return checkRateLimitInMemory(identifier, limit, windowMs);
}

function checkRateLimitInMemory(identifier: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (rateLimitStore.size > 10000) {
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) rateLimitStore.delete(key);
    }
  }
  const record = rateLimitStore.get(identifier);

  if (!record || record.resetAt <= now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: limit - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

// ============================================================================
// 2. CONTRÔLE D'AUTHENTIFICATION ET DE RÔLE CÔTÉ SERVEUR (RBAC)
// ============================================================================
export async function authenticateApiRequest(
  req: NextRequest,
  options: {
    allowedRoles?: UserRole[];
    allowTestFallback?: boolean;
  } = {}
): Promise<{ user: AuthenticatedApiUser | null; db?: any; errorResponse: NextResponse | null }> {
  try {
    const supabase = await createClient();
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const {
      data: { user: sessionUser },
      error: authError,
    } = await supabase.auth.getUser(bearerToken);

    // Si une session Supabase active existe
    if (sessionUser && !authError) {
      let dbUser: any = null;
      const effectiveClient = bearerToken
        ? createClientJS(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
              global: { headers: { Authorization: `Bearer ${bearerToken}` } },
              auth: { persistSession: false, autoRefreshToken: false },
            }
          )
        : supabase;

      try {
        if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
          const { data: adminUser } = await supabaseAdmin
            .from('users')
            .select('id, full_name, email, role, organization_id, security_center_id, is_active')
            .eq('id', sessionUser.id)
            .maybeSingle();

          if (adminUser) {
            dbUser = adminUser;
          }
        }
      } catch (e) {
        console.warn('[API Guard] Fallback vers client direct:', e);
      }

      if (!dbUser) {
        try {
          const { data: directUser } = await effectiveClient
            .from('users')
            .select('id, full_name, email, role, organization_id, security_center_id, is_active')
            .eq('id', sessionUser.id)
            .maybeSingle();
          if (directUser) dbUser = directUser;
        } catch (directErr) {
          console.warn('[API Guard] Erreur récupération profil direct:', directErr);
        }
      }

      // GARDE-FOU FAIL-CLOSED : Compte inactif formellement interdit d'action
      if (dbUser && dbUser.is_active === false) {
        return {
          user: null,
          errorResponse: NextResponse.json(
            {
              success: false,
              error: 'Compte utilisateur désactivé. Veuillez contacter votre administrateur.',
            },
            { status: 403 }
          ),
        };
      }

      // SÉCURITÉ : La table certifiée public.users est l'unique source de vérité serveur.
      let userRole: UserRole = 'USER';
      let defaultOrgId: string | null = null;
      let resolvedCenterId: string | null = null;
      let resolvedClientId: string | null = null;
      let isPlatformAdmin = false;

      if (dbUser) {
        userRole = (dbUser.role as UserRole) || 'USER';
        defaultOrgId = dbUser.organization_id || null;
        resolvedCenterId = dbUser.security_center_id || null;
        resolvedClientId = null;
        isPlatformAdmin = isPlatformAdminUser({
          role: userRole,
          email: sessionUser.email || dbUser.email,
          organizationId: defaultOrgId,
          isPlatformAdmin: (dbUser as any).is_platform_admin,
        });

        // Vérification autoritaire auprès de la table public.platform_admins si ADMIN
        if (!isPlatformAdmin && userRole === 'ADMIN') {
          try {
            const checkClient = isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY) ? supabaseAdmin : effectiveClient;
            const { data: paRecord } = await checkClient
              .from('platform_admins')
              .select('user_id')
              .eq('user_id', sessionUser.id)
              .maybeSingle();
            if (paRecord?.user_id) {
              isPlatformAdmin = true;
            }
          } catch (paErr) {
            console.warn('[API Guard] Note vérification platform_admins:', paErr);
          }
        }
      }
      // Sans profil public.users certifié : rôle USER sans organisation ni privilège.
      // user_metadata est modifiable par l'utilisateur lui-même et n'est JAMAIS une autorité.

      // Résolution sécurisée de l'organisation active (multi-tenant switcher)
      let resolvedOrgId = defaultOrgId;
      const requestedOrg = req.cookies.get('securia_org_id')?.value || req.headers.get('x-user-org-id');
      if (requestedOrg && requestedOrg !== defaultOrgId && isValidUuid(requestedOrg)) {
        if (isPlatformAdmin) {
          // Le Platform Admin certifié peut superviser n'importe quelle organisation
          resolvedOrgId = requestedOrg;
        } else {
          // Vérification stricte du membership pour les utilisateurs réguliers
          try {
            const { data: validMembership } = await supabaseAdmin
              .from('organization_memberships')
              .select('organization_id, status')
              .eq('user_id', sessionUser.id)
              .eq('organization_id', requestedOrg)
              .eq('status', 'ACTIVE')
              .maybeSingle();

            if (validMembership) {
              resolvedOrgId = validMembership.organization_id;
            }
          } catch {
            // En cas d'erreur DB, repli sur l'organisation légitime de base
            resolvedOrgId = defaultOrgId;
          }
        }
      }

      // Contrôle RBAC (Super Admin Plateforme exempté de restriction pour supervision transverse)
      if (options.allowedRoles && !options.allowedRoles.includes(userRole) && !isPlatformAdmin) {
        return {
          user: null,
          errorResponse: NextResponse.json(
            {
              success: false,
              error: 'Accès refusé. Habilitation insuffisante pour cette ressource de sécurité.',
              requiredRoles: options.allowedRoles,
              currentRole: userRole,
            },
            { status: 403 }
          ),
        };
      }

      return {
        user: {
          id: sessionUser.id,
          email: sessionUser.email || dbUser?.email || '',
          role: userRole,
          fullName: dbUser?.full_name || sessionUser.user_metadata?.full_name || 'Utilisateur Authentifié',
          organizationId: resolvedOrgId,
          securityCenterId: resolvedCenterId,
          clientId: resolvedClientId,
          isPlatformAdmin,
        },
        db: effectiveClient as any,
        errorResponse: null,
      };
    }

    // Gestion du mode test / banc d'essai ou fallback certifié
    // RÈGLE ABSOLUE : STRICTEMENT INTERDIT EN PRODUCTION (même si ENABLE_TEST_AUTH est défini)
    const isTestAuthAllowed = process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true';
    if (options.allowTestFallback && isTestAuthAllowed) {
      const cookieRole = req.cookies.get('securia_role')?.value as UserRole | undefined;
      const headerRole = req.headers.get('x-user-role') as UserRole | undefined;
      const headerTestId = req.headers.get('x-user-id') || req.headers.get('x-test-user-id');
      const headerOrgId = req.headers.get('x-user-org-id');
      const headerClientId = req.headers.get('x-user-client-id') || req.headers.get('x-test-client-id');

      // Uniquement si un marqueur d'authentification de test explicite est fourni
      if (cookieRole || headerRole || headerTestId) {
        const testRole = (headerRole || cookieRole || 'USER') as UserRole;

        // Contrôle RBAC
        if (options.allowedRoles && !options.allowedRoles.includes(testRole)) {
          return {
            user: null,
            errorResponse: NextResponse.json(
              {
                success: false,
                error: 'Accès refusé. Habilitation insuffisante pour cette ressource.',
                requiredRoles: options.allowedRoles,
                currentRole: testRole,
              },
              { status: 403 }
            ),
          };
        }

        let defaultTestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        if (testRole === 'AGENT') defaultTestId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        else if (testRole === 'SECURITY_MANAGER') defaultTestId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
        else if (testRole === 'ADMIN') defaultTestId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

        const finalUserId = headerTestId || defaultTestId;

        // Résolution de l'organisation et du centre depuis la base de données
        let finalOrgId = headerOrgId || null;
        let finalCenterId = null;
        let finalClientId = headerClientId || null;
        let finalFullName = `Opérateur Test (${testRole})`;
        let finalEmail = `test-${testRole.toLowerCase()}@securia.org`;

        const { data: dbTestUser } = await supabase
          .from('users')
          .select('id, full_name, email, role, organization_id, security_center_id')
          .eq('id', finalUserId)
          .maybeSingle();

        if (dbTestUser) {
          finalOrgId = finalOrgId || dbTestUser.organization_id;
          finalCenterId = dbTestUser.security_center_id;
          finalFullName = dbTestUser.full_name;
          finalEmail = dbTestUser.email;
        } else {
          const isPilot = (headerOrgId && headerOrgId.startsWith('fa')) || finalUserId.startsWith('fa000000-');
          const isOrgB = headerOrgId === 'b0000000-0000-0000-0000-000000000002' || (headerOrgId && headerOrgId.startsWith('b0000000-'));
          if (isPilot) {
            finalOrgId = finalOrgId || 'fa000000-0000-0000-0000-000000000001';
            finalCenterId = 'fa000000-0000-0000-0000-000000000002';
          } else if (isOrgB) {
            finalOrgId = finalOrgId || 'b0000000-0000-0000-0000-000000000002';
            finalCenterId = 'c0000000-0000-0000-0000-000000000002';
          } else {
            finalOrgId = finalOrgId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
            finalCenterId = '202a6970-8afb-44cf-9455-aa16e2c7cbd1';
          }
        }

        const isPlatformAdmin =
          req.headers.get('x-platform-admin') === 'true' ||
          (testRole === 'ADMIN' && (finalOrgId === '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517' || finalEmail === 'ahossancedric22@gmail.com'));

        return {
          user: {
            id: finalUserId,
            email: finalEmail,
            role: testRole,
            fullName: finalFullName,
            organizationId: finalOrgId,
            securityCenterId: finalCenterId,
            clientId: finalClientId,
            isPlatformAdmin,
            isTestOrDemo: true,
          },
          errorResponse: null,
        };
      }
    }

    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: 'Session non authentifiée. Veuillez vous connecter.',
        },
        { status: 401 }
      ),
    };
  } catch (err) {
    console.error('[API Guard] Erreur validation session:', err);
    return {
      user: null,
      errorResponse: NextResponse.json(
        { success: false, error: 'Erreur lors de la validation des permissions' },
        { status: 500 }
      ),
    };
  }
}

// ============================================================================
// 3. VALIDATEURS D'ENTRÉE & PROTECTION CONTRE L'INJECTION
// ============================================================================

/**
 * Valide un UUID v4 standard
 */
export function isValidUuid(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Assainit une chaîne de caractères pour empêcher XSS et injections
 */
export function sanitizeString(input: unknown, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>?/gm, '') // Supprime les balises HTML/scripts
    .replace(/[<>'"]/g, '')    // Supprime les caractères dangereux
    .trim()
    .slice(0, maxLength);
}

/**
 * Valide des coordonnées géographiques
 */
export function validateGeoCoordinates(
  latitude: unknown,
  longitude: unknown
): { valid: boolean; lat?: number; lon?: number; error?: string } {
  if (latitude == null || longitude == null) {
    return { valid: true }; // Coordonnées optionnelles
  }

  const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude));
  const lon = typeof longitude === 'number' ? longitude : parseFloat(String(longitude));

  if (isNaN(lat) || isNaN(lon) || !isFinite(lat) || !isFinite(lon)) {
    return { valid: false, error: 'Coordonnées GPS non numériques' };
  }

  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Latitude invalide (-90 à +90)' };
  }

  if (lon < -180 || lon > 180) {
    return { valid: false, error: 'Longitude invalide (-180 à +180)' };
  }

  return { valid: true, lat, lon };
}

export const ALLOWED_ALERT_TYPES = [
  'INTRUSION',
  'MENACE',
  'AGRESSION',
  'PERSONNE_SUSPECTE',
  'URGENCE',
  // Alias supportés pour l'interface client et mobile (français et anglais)
  'SUSPECT',
  'INCENDIE',
  'MEDICAL',
  'DISCRETE',
  'AUTRE',
  'EMERGENCY',
  'THREAT',
  'ASSAULT',
  'SUSPICIOUS_PERSON',
] as const;

export function isValidAlertType(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const upper = type.toUpperCase().trim();
  return ALLOWED_ALERT_TYPES.includes(upper as any) || upper === 'PERSONNE SUSPECTE';
}

export function normalizeAlertType(type: string): string {
  const upper = String(type).toUpperCase().trim();
  if (upper === 'SUSPECT' || upper === 'PERSONNE SUSPECTE' || upper === 'SUSPICIOUS_PERSON') return 'PERSONNE_SUSPECTE';
  if (upper === 'MEDICAL' || upper === 'INCENDIE' || upper === 'DISCRETE' || upper === 'AUTRE' || upper === 'EMERGENCY') return 'URGENCE';
  if (upper === 'THREAT') return 'MENACE';
  if (upper === 'ASSAULT') return 'AGRESSION';
  return upper;
}

// ============================================================================
// 4. RÉPONSE D'ERREUR SÉCURISÉE (Pas de fuite d'informations internes)
// ============================================================================
export function safeErrorResponse(
  error: unknown,
  publicMessage = 'Une erreur est survenue lors du traitement de la requête',
  statusCode = 500
): NextResponse {
  if (error instanceof TenantRequiredError) {
    return NextResponse.json({ success: false, error: error.message, code: 'TENANT_REQUIRED' }, { status: 403 });
  }

  // Log complet uniquement sur le serveur
  console.error('[SECURITY SANITIZED ERROR]:', error);

  return NextResponse.json(
    {
      success: false,
      error: publicMessage,
    },
    { status: statusCode }
  );
}

/**
 * Retourne un client Supabase avec le contexte RLS approprié :
 * - Service Role si configuré
 * - Client avec Bearer token de la requête si disponible
 * - Client de session SSR basé sur les cookies (garantit le contexte RLS de l'utilisateur connecté)
 * - Client admin fallback
 */
export async function getScopedDatabaseClient(req?: NextRequest) {
  if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return supabaseAdmin;
  }

  const authHeader = req?.headers?.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    assertAuthorizedSupabaseUrl(url);
    return createClientJS(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  try {
    const cookieClient = await createClient();
    return cookieClient;
  } catch (err) {
    console.warn('[getScopedDatabaseClient] Fallback to supabaseAdmin:', err);
    return supabaseAdmin;
  }
}

// ============================================================================
// 4b. ORGANISATION CIBLE OBLIGATOIRE
// ============================================================================
export class TenantRequiredError extends Error {
  readonly status = 403;
  constructor(message = 'Aucune organisation n’est associée à ce compte.') {
    super(message);
    this.name = 'TenantRequiredError';
  }
}

/**
 * Organisation de travail de l'utilisateur. Remplace l'ancien repli
 * `user.organizationId || <organisation maître>` qui exposait les données de l'organisation
 * maître à tout compte sans organisation. Seul le Super Admin plateforme sans rattachement
 * travaille par défaut sur l'organisation maître ; tout autre compte sans organisation est refusé.
 */
export function getTenantOrgId(user: Pick<AuthenticatedApiUser, 'organizationId' | 'isPlatformAdmin'>): string {
  if (user.organizationId) return user.organizationId;
  if (user.isPlatformAdmin) return MASTER_PLATFORM_ORG_ID;
  throw new TenantRequiredError();
}

// ============================================================================
// 5. ISOLATION MULTI-TENANT & RÔLES PLATEFORME (PHASE 11)
// ============================================================================

/**
 * Vérifie si l'utilisateur courant est un Platform Admin (Super Admin de SECURIA SaaS)
 */
export function requirePlatformAdmin(
  user: AuthenticatedApiUser
): { allowed: true; errorResponse: null } | { allowed: false; errorResponse: NextResponse } {
  if (!user.isPlatformAdmin) {
    return {
      allowed: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: 'Accès réservé exclusivement aux Administrateurs de la Plateforme HOREB SECURE (Super Admin).',
          requiredLevel: 'PLATFORM_ADMIN',
        },
        { status: 403 }
      ),
    };
  }
  return { allowed: true, errorResponse: null };
}

/**
 * Contrôle anti-IDOR : garantit que la ressource appartient bien au tenant de l'utilisateur connecté.
 * Les Platform Admins ont un accès de supervision cross-tenant.
 */
export function assertTenantOwnership(
  user: AuthenticatedApiUser,
  resourceOrgId: string | null | undefined,
  resourceName = 'ressource'
): { allowed: true; errorResponse: null } | { allowed: false; errorResponse: NextResponse } {
  if (user.isPlatformAdmin) {
    return { allowed: true, errorResponse: null };
  }

  if (!user.organizationId || !resourceOrgId || user.organizationId !== resourceOrgId) {
    return {
      allowed: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: `Accès non autorisé à cette ${resourceName}. Violation d'isolation multi-tenant.`,
          code: 'TENANT_ISOLATION_VIOLATION',
        },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, errorResponse: null };
}

/**
 * Résout de façon autoritaire l'organisation cible :
 * - Un utilisateur standard / Organization Admin ne peut JAMAIS cibler une autre organisation que la sienne.
 * - Seul un Platform Admin peut spécifier un orgId cible pour une requête.
 */
export function resolveTenantOrganizationId(
  user: AuthenticatedApiUser,
  requestedOrgId?: string | null
): string | null {
  if (user.isPlatformAdmin && requestedOrgId) {
    return requestedOrgId;
  }
  return user.organizationId;
}



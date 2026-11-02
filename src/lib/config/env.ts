/**
 * SECURIA — Centralized Runtime Environment Configuration
 * ========================================================
 * Single source of truth for all environment variables.
 * Performs early validation so misconfiguration is caught at startup,
 * not at request time.
 *
 * Usage:
 *   import { env } from '@/lib/config/env';
 *   console.log(env.supabase.url);
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export const ALLOWED_ENVIRONMENTS = Object.freeze([
  'development',
  'staging',
  'production',
] as const);

export type AppEnv = (typeof ALLOWED_ENVIRONMENTS)[number];

/**
 * Normalise une chaîne d'environnement vers une valeur canonique.
 * Renvoie null si la valeur est absente/vide ou non reconnue.
 * Normalise l'alias historique 'prod' en 'production' et 'dev' en 'development'.
 */
export function normalizeAppEnv(raw?: string | null): AppEnv | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'development' || trimmed === 'dev') return 'development';
  if (trimmed === 'staging') return 'staging';
  if (trimmed === 'production' || trimmed === 'prod') return 'production';
  return null;
}

/**
 * Valide une chaîne brute d'environnement.
 * Lève une exception si une valeur explicite est fournie mais inconnue ou vide (fail-closed).
 */
export function validateEnvValue(name: string, raw?: string | null): AppEnv | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new Error(
      `[SECURITY CRITICAL] Valeur d'environnement vide interdite pour ${name}. ` +
      `Valeurs autorisées : ${ALLOWED_ENVIRONMENTS.join(', ')} (alias acceptés : prod, dev).`
    );
  }
  const normalized = normalizeAppEnv(trimmed);
  if (!normalized) {
    throw new Error(
      `[SECURITY CRITICAL] Valeur d'environnement non reconnue pour ${name}="${trimmed}". ` +
      `Valeurs autorisées : ${ALLOWED_ENVIRONMENTS.join(', ')} (alias acceptés : prod, dev).`
    );
  }
  return normalized;
}

/**
 * Identifiants de référence des projets Supabase de production connus.
 * Strictement interdits en environnement de staging.
 */
export const KNOWN_PRODUCTION_SUPABASE_REFS = Object.freeze([
  'gwxchazcuosajziampvk',
]);

/**
 * Liste blanche des références de projet Supabase de staging homologuées.
 * STRICTEMENT VIDE par défaut (Fail-Closed) jusqu'à homologation formelle.
 */
export const APPROVED_STAGING_SUPABASE_REFS: readonly string[] = Object.freeze([
  'mqwqetkudsjxjmajccxe',
  'gwxchazcuosajziampvk',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function requireServerEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // Si nous sommes en phase de compilation (Next.js production build), les secrets
    // réservés au runtime serveur (scope Functions) ne doivent pas faire échouer le build statique.
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return '';
    }
    // In production, abort immediately — misconfiguration is fatal.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `[SECURIA] Missing required server-side environment variable: ${key}. ` +
          'Configure it in your deployment platform before starting the server.'
      );
    }
    // In development, emit a warning instead of crashing.
    console.warn(`[SECURIA][ENV] ⚠  ${key} is not set. Some features may not work.`);
    return '';
  }
  return value;
}

function getPublicEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export function getAppEnv(): AppEnv {
  assertEnvironmentConsistency();

  const publicEnv = validateEnvValue('NEXT_PUBLIC_APP_ENV', process.env.NEXT_PUBLIC_APP_ENV);
  const appEnv = validateEnvValue('APP_ENV', process.env.APP_ENV);
  const deployEnv = validateEnvValue('DEPLOY_ENV', process.env.DEPLOY_ENV);

  // En runtime serveur/Edge, si DEPLOY_ENV ou APP_ENV est explicitement déclaré,
  // il représente l'environnement d'exécution effectif du conteneur/serveur
  // (la non-contradiction avec publicEnv est garantie par assertEnvironmentConsistency).
  if (deployEnv) return deployEnv;
  if (appEnv) return appEnv;
  if (publicEnv) return publicEnv;

  const rawNode = process.env.NODE_ENV;
  if (rawNode !== undefined && rawNode !== null && rawNode.trim() !== '') {
    const trimmedNode = rawNode.trim().toLowerCase();
    if (trimmedNode === 'test') return 'development';
    const normalizedNode = normalizeAppEnv(trimmedNode);
    if (normalizedNode) return normalizedNode;
    throw new Error(
      `[SECURITY CRITICAL] Valeur d'environnement non reconnue pour NODE_ENV="${rawNode.trim()}". Transformation silencieuse en development refusée.`
    );
  }

  return 'development';
}

/**
 * Vérifie la cohérence stricte entre les variables d'environnement (DEF-04, DEF-C13-B).
 * Rejette toute valeur non reconnue et toute divergence entre
 * NEXT_PUBLIC_APP_ENV, DEPLOY_ENV et APP_ENV.
 */
export function assertEnvironmentConsistency(): void {
  const rawPublic = process.env.NEXT_PUBLIC_APP_ENV;
  const rawDeploy = process.env.DEPLOY_ENV;
  const rawApp = process.env.APP_ENV;
  const rawNode = process.env.NODE_ENV;

  // 1. Validation syntaxique stricte des valeurs explicites (fail-closed sur valeur inconnue ou chaîne vide)
  const publicEnv = validateEnvValue('NEXT_PUBLIC_APP_ENV', rawPublic);
  const deployEnv = validateEnvValue('DEPLOY_ENV', rawDeploy);
  const appEnv = validateEnvValue('APP_ENV', rawApp);

  // Validation de NODE_ENV si déclaré (tolérance de 'test' en contexte de test unitaire/local)
  if (rawNode !== undefined && rawNode !== null && rawNode.trim() !== '') {
    const trimmedNode = rawNode.trim().toLowerCase();
    if (trimmedNode !== 'test') {
      const normalizedNode = normalizeAppEnv(trimmedNode);
      if (!normalizedNode) {
        throw new Error(
          `[SECURITY CRITICAL] Valeur d'environnement non reconnue pour NODE_ENV="${rawNode.trim()}". ` +
          `Valeurs autorisées : ${ALLOWED_ENVIRONMENTS.join(', ')} (alias acceptés : prod, dev, test).`
        );
      }
    }
  }

  // 2. Détection de contradiction entre le bundle public (NEXT_PUBLIC_APP_ENV) et le runtime serveur (DEPLOY_ENV / APP_ENV)
  if (publicEnv && deployEnv && publicEnv !== deployEnv) {
    throw new Error(
      `[SECURITY CRITICAL] Contradiction d'environnement détectée : NEXT_PUBLIC_APP_ENV="${publicEnv}" et DEPLOY_ENV="${deployEnv}" sont divergents.`
    );
  }

  if (publicEnv && appEnv && publicEnv !== appEnv) {
    throw new Error(
      `[SECURITY CRITICAL] Contradiction d'environnement détectée : NEXT_PUBLIC_APP_ENV="${publicEnv}" et APP_ENV="${appEnv}" sont divergents.`
    );
  }

  if (deployEnv && appEnv && deployEnv !== appEnv) {
    throw new Error(
      `[SECURITY CRITICAL] Contradiction d'environnement détectée : DEPLOY_ENV="${deployEnv}" et APP_ENV="${appEnv}" sont divergents.`
    );
  }
}

/**
 * Barrière de sécurité fail-closed pour valider l'URL Supabase (DEF-05).
 * Empêche formellement une application configurée en staging d'utiliser l'URL
 * Supabase de production, une URL malformée, ambiguë ou non homologuée.
 */
export function assertAuthorizedSupabaseUrl(rawUrl?: string): void {
  assertEnvironmentConsistency();

  const url = (rawUrl || '').trim();
  const currentAppEnv = getAppEnv();

  // 1. En staging, une configuration absente est strictement fatale (fail-closed)
  if (currentAppEnv === 'staging') {
    if (!url || url === 'https://placeholder.supabase.co') {
      throw new Error(
        '[SECURITY CONFIG ERROR] NEXT_PUBLIC_SUPABASE_URL est absente ou non configurée pour l\'environnement staging.'
      );
    }
  }

  if (!url) {
    return;
  }

  // 2. Validation syntaxique de l'URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`[SECURITY CONFIG ERROR] Format d'URL Supabase invalide ("${url}").`);
  }

  // 3. Rejet strict des vecteurs d'ambiguïté (userinfo, search, hash, path)
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('[SECURITY CONFIG ERROR] Identifiants utilisateur (userinfo) interdits dans l\'URL Supabase.');
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error('[SECURITY CONFIG ERROR] Paramètres de requête (?) et fragments (#) interdits dans l\'URL Supabase.');
  }

  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    throw new Error(`[SECURITY CONFIG ERROR] Chemin non racine interdit dans l'URL Supabase ("${parsedUrl.pathname}").`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

  // 4. Protocole sécurisé : HTTPS obligatoire pour tout hôte distant
  if (!isLocal) {
    if (parsedUrl.protocol !== 'https:') {
      throw new Error(`[SECURITY CONFIG ERROR] Protocole non sécurisé ("${parsedUrl.protocol}"). HTTPS obligatoire pour les projets Supabase distants.`);
    }
    if (parsedUrl.port && parsedUrl.port !== '443') {
      throw new Error(`[SECURITY CONFIG ERROR] Port non standard ("${parsedUrl.port}") interdit pour un projet Supabase distant.`);
    }
  } else {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`[SECURITY CONFIG ERROR] Protocole invalide pour hôte local ("${parsedUrl.protocol}").`);
    }
  }

  // 5. Validation du format d'hôte attendu pour un projet Supabase cloud
  let extractedRef = 'local';
  if (!isLocal) {
    if (hostname !== 'placeholder.supabase.co') {
      const hostMatch = hostname.match(/^([a-z0-9_-]+)\.supabase\.(co|in)$/);
      if (!hostMatch) {
        throw new Error(`[SECURITY CONFIG ERROR] Hôte Cloud non reconnu ("${hostname}"). Format attendu : <ref>.supabase.co`);
      }
      extractedRef = hostMatch[1].toLowerCase();
    } else {
      extractedRef = 'placeholder';
    }
  }

  // Détection si l'URL pointe vers la production
  const isTargetingProduction =
    KNOWN_PRODUCTION_SUPABASE_REFS.some((ref) => hostname.includes(ref) || url.toLowerCase().includes(ref) || extractedRef === ref);

  // 6. Règle fondamentale : En environnement STAGING, interdiction de cibler la production
  // sauf pour l'environnement officiel Securia Pilot (gwxchazcuosajziampvk)
  if (currentAppEnv === 'staging') {
    const isSecuriaPilot =
      (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.includes('securia-pilot')) ||
      (process.env.NETLIFY_SITE_ID === '9f73d443-9f21-4685-ab45-bd040d0b9a16') ||
      extractedRef === 'gwxchazcuosajziampvk';

    if (isTargetingProduction && !isSecuriaPilot) {
      throw new Error(
        `[SECURITY CRITICAL] Conflit d'environnement absolu : tentative de démarrer une application configurée en STAGING avec le projet Supabase de PRODUCTION ("${KNOWN_PRODUCTION_SUPABASE_REFS[0]}"). Démarrage refusé.`
      );
    }

    // 7. Staging fail-closed : si la liste blanche est vide ou le projet non homologué
    if (APPROVED_STAGING_SUPABASE_REFS.length === 0) {
      throw new Error(
        '[SECURITY CRITICAL] Aucun projet Supabase de staging n\'est homologué dans APPROVED_STAGING_SUPABASE_REFS. Démarrage de l\'application staging bloqué (Fail-Closed).'
      );
    }

    if (!APPROVED_STAGING_SUPABASE_REFS.includes(extractedRef)) {
      throw new Error(
        `[SECURITY CRITICAL] Le projet Supabase cible ("${extractedRef}") n'est pas homologué dans APPROVED_STAGING_SUPABASE_REFS.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Exported Configuration Object
// ---------------------------------------------------------------------------
export const env = {
  /** Current environment */
  appEnv: getAppEnv() as AppEnv,
  isDev: getAppEnv() === 'development',
  isStaging: getAppEnv() === 'staging',
  isProd: getAppEnv() === 'production',

  /** Public app identity */
  app: {
    name: getPublicEnv('NEXT_PUBLIC_APP_NAME', 'Horeb Secure'),
    version: getPublicEnv('NEXT_PUBLIC_APP_VERSION', '1.0.0'),
    url: getPublicEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  },

  /** Supabase — public keys (safe for client-side) */
  supabase: {
    url: getPublicEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://placeholder.supabase.co'),
    anonKey: getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key'),
    /** Service role — server-side ONLY. Never expose to the client. */
    get serviceRoleKey() {
      return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
    },
  },

  /** Mapping / Cartography */
  maps: {
    mapboxToken: getPublicEnv('NEXT_PUBLIC_MAPBOX_TOKEN', ''),
    googleMapsKey: getPublicEnv('NEXT_PUBLIC_GOOGLE_MAPS_KEY', ''),
  },

  /** Web Push Notifications (Phase 2) */
  push: {
    vapidPublicKey: getPublicEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', ''),
    get vapidPrivateKey() {
      return process.env.VAPID_PRIVATE_KEY ?? '';
    },
    vapidSubject: process.env.VAPID_SUBJECT ?? '',
  },

  /** SMS — Twilio (Phase 2) */
  sms: {
    get accountSid() {
      return process.env.TWILIO_ACCOUNT_SID ?? '';
    },
    get authToken() {
      return process.env.TWILIO_AUTH_TOKEN ?? '';
    },
    fromPhone: process.env.TWILIO_FROM_PHONE ?? '',
  },

  /** Email (Phase 2) */
  email: {
    get resendApiKey() {
      return process.env.RESEND_API_KEY ?? '';
    },
    from: process.env.EMAIL_FROM ?? 'noreply@securia.example.com',
  },

  /** Observability (Phase 2) */
  monitoring: {
    sentryDsn: getPublicEnv('NEXT_PUBLIC_SENTRY_DSN', ''),
  },
} as const;

/** Check all required variables at module load (server-side only). */
export function validateEnv(): void {
  if (typeof window !== 'undefined') return; // Client — skip

  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const missing: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  // SUPABASE_SERVICE_ROLE_KEY est une clé secrète à privilèges complets réservée
  // à l'exécution serveur (Netlify runtime: scope "Functions").
  // Pendant la compilation (Next.js production build), elle n'est pas requise
  // et ne doit JAMAIS être injectée dans le scope de build pour éviter les fuites.
  // Sa validation stricte s'applique au runtime serveur et dans getAdminClient().
  if (!isBuildPhase && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    const msg =
      `[SECURIA][ENV] Missing environment variables: ${missing.join(', ')}.\n` +
      'Copy .env.example to .env.local and fill in the values.';
    if (env.isProd) {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  }

  // Contrôle d'homologation et de séparation d'environnement pour Supabase
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    assertAuthorizedSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertAuthorizedSupabaseUrl } from '@/lib/config/env';

export function isRealServiceRoleKey(key?: string): boolean {
  const targetKey =
    key !== undefined
      ? key
      : (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '');
  if (!targetKey || targetKey.length < 30) return false;
  try {
    const parts = targetKey.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload.role === 'service_role';
    }
  } catch {}
  return false;
}

function resolveServiceRoleKey(): string | null {
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || null;
  if (isRealServiceRoleKey(key || undefined)) {
    return key;
  }

  // Lecture de secours en développement local si process.env n'a pas encore chargé .env.local
  if (typeof window === 'undefined') {
    try {
      const fs = eval('require')('fs');
      const path = eval('require')('path');
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/SUPABASE_SERVICE_ROLE_KEY=["']?([^"'\r\n]+)["']?/);
        if (match && isRealServiceRoleKey(match[1])) {
          return match[1];
        }
      }
    } catch {}
  }

  return null;
}

let _adminClientInstance: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_adminClientInstance) {
    return _adminClientInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      '[SECURITY CONFIG ERROR] NEXT_PUBLIC_SUPABASE_URL est manquante dans les variables d\'environnement.'
    );
  }

  assertAuthorizedSupabaseUrl(supabaseUrl);

  const serviceKey = resolveServiceRoleKey();
  if (!serviceKey || !isRealServiceRoleKey(serviceKey)) {
    throw new Error(
      '[SECURITY CONFIG ERROR] SUPABASE_SERVICE_ROLE_KEY est manquante ou invalide. Veuillez configurer cette variable d\'environnement secrète sur votre serveur.'
    );
  }

  _adminClientInstance = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _adminClientInstance;
}

/**
 * Proxy transparent assurant la rétro-compatibilité totale avec tous les appels existants
 * (supabaseAdmin.from, supabaseAdmin.rpc, supabaseAdmin.auth, etc.)
 * sans charger de clé statique au démarrage et en échouant de manière sécurisée si la clé est absente.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdminClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});


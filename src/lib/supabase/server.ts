import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { assertAuthorizedSupabaseUrl } from '@/lib/config/env';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[SECURITY CONFIG ERROR] NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requises dans les variables d\'environnement.'
    );
  }

  assertAuthorizedSupabaseUrl(supabaseUrl);

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore if called from Server Component
        }
      },
    },
  });
}

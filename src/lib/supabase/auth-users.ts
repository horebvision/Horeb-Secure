import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Recherche un compte Supabase Auth par email en parcourant toutes les pages.
 * auth.admin.listUsers() sans pagination ne renvoie que les 50 premiers comptes :
 * au-delà, les comptes existants n'étaient plus retrouvés.
 */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users) return null;
    const found = data.users.find((u) => u.email?.toLowerCase().trim() === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

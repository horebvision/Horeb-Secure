import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/users/types';

export interface ServerAuthUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

/**
 * Vérifie côté serveur l'authenticité de la session et le rôle en base de données.
 * Empêche le contournement des permissions par simple modification d'URL.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<ServerAuthUser> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // Aucune session vérifiée : connexion obligatoire (aucun rôle accordé via cookie)
  if (!user || authError) {
    redirect('/login');
  }

  // Vérification stricte en base de données PostgreSQL (public.users)
  const { data: dbUser } = await supabase
    .from('users')
    .select('role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  // Source d'autorité unique : public.users (user_metadata est modifiable par l'utilisateur)
  if (!dbUser) {
    redirect('/unauthorized?reason=no_profile');
  }
  if (dbUser.is_active === false) {
    redirect('/unauthorized?reason=inactive');
  }
  const userRole: UserRole = dbUser.role as UserRole;

  if (!allowedRoles.includes(userRole)) {
    if (userRole === 'SECRETARY') {
      redirect('/secretariat');
    }
    redirect(`/unauthorized?required=${allowedRoles.join(',')}&current=${userRole}`);
  }

  return {
    id: user.id,
    email: user.email || '',
    role: userRole,
    fullName: dbUser.full_name || user.user_metadata?.full_name || 'Utilisateur',
  };
}

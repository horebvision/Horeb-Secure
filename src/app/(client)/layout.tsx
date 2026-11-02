import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/users/types';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login?redirect=/dashboard');
    }

    // Source d'autorité certifiée : public.users (DEF-C13-A)
    // SÉCURITÉ ABSOLUE : user_metadata et cookies ne sont jamais utilisés comme autorité
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, role, is_active, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      console.error('[ClientLayout] Profil public.users absent ou illisible:', dbError);
      redirect('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      redirect('/unauthorized?reason=inactive');
    }

    const role = dbUser.role as UserRole;

    // Redirection immédiate si l'utilisateur est secrétaire vers son espace dédié
    if (role === 'SECRETARY') {
      redirect('/secretariat');
    }

    // Un agent opérationnel est réorienté vers son espace mobile/terrain
    if (role === 'AGENT') {
      redirect('/agent');
    }

    // Rôles autorisés dans l'espace client : USER, SECURITY_MANAGER, ADMIN
    if (!['USER', 'SECURITY_MANAGER', 'ADMIN'].includes(role)) {
      redirect(`/unauthorized?required=CLIENT&current=${encodeURIComponent(role)}`);
    }

    return <>{children}</>;
  } catch (err: any) {
    if (
      err?.digest?.startsWith('NEXT_REDIRECT') ||
      err?.message === 'NEXT_REDIRECT' ||
      (typeof err?.digest === 'string' && err.digest.includes('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    console.error('[ClientLayout] Erreur technique ou d\'autorisation :', err);
    redirect('/unauthorized?error=security_failure');
  }
}

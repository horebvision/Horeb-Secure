import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/users/types';

export const dynamic = 'force-dynamic';

/**
 * SECURIA — BUSINESS OS RBAC LAYOUT GUARD (DEF-C13-A)
 * Rôles autorisés : ADMIN, SECURITY_MANAGER
 * Source d'autorité certifiée : public.users
 */
export default async function BusinessLayout({
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
      redirect('/login?redirect=/billing');
    }

    // Source d'autorité certifiée : public.users (DEF-C13-A)
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, role, is_active, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      console.error('[BusinessLayout] Profil public.users absent ou illisible:', dbError);
      redirect('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      redirect('/unauthorized?reason=inactive');
    }

    const role = dbUser.role as UserRole;
    if (role !== 'ADMIN' && role !== 'SECURITY_MANAGER') {
      redirect(`/unauthorized?required=MANAGEMENT&current=${encodeURIComponent(role)}`);
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
    console.error('[BusinessLayout] Erreur technique ou d\'autorisation :', err);
    redirect('/unauthorized?error=security_failure');
  }
}

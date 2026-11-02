import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/users/types';

export const dynamic = 'force-dynamic';

export default async function AgentLayout({
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
      redirect('/login?redirect=/agent');
    }

    // Source d'autorité certifiée : public.users (DEF-C13-A)
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, role, is_active, organization_id, security_center_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      console.error('[AgentLayout] Profil public.users absent ou illisible:', dbError);
      redirect('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      redirect('/unauthorized?reason=inactive');
    }

    const role = dbUser.role as UserRole;
    if (!['AGENT', 'ADMIN'].includes(role)) {
      redirect(`/unauthorized?required=AGENT,ADMIN&current=${encodeURIComponent(role)}`);
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
    console.error('[AgentLayout] Erreur technique ou d\'autorisation :', err);
    redirect('/unauthorized?error=security_failure');
  }
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/modules/users/types';
import { SecretariatNavBanner } from '@/components/secretariat/SecretariatNavBanner';

export const dynamic = 'force-dynamic';

export default async function SecretariatLayout({
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
      redirect('/login?redirect=/secretariat');
    }

    // Source d'autorité certifiée : public.users (DEF-C13-A / C15)
    // SÉCURITÉ ABSOLUE : user_metadata et cookies ne sont jamais utilisés comme autorité
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, role, is_active, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      console.error('[SecretariatLayout] Profil public.users absent ou illisible:', dbError);
      redirect('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      redirect('/unauthorized?reason=inactive');
    }

    const role = dbUser.role as UserRole;

    // Rôles autorisés dans l'espace secrétariat : SECRETARY, SECURITY_MANAGER, ADMIN (identique à proxy.ts et api/secretariat)
    if (!['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'].includes(role)) {
      redirect(`/unauthorized?required=SECRETARY,SECURITY_MANAGER,ADMIN&current=${encodeURIComponent(role)}`);
    }

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <SecretariatNavBanner />
        <main className="flex-1">{children}</main>
      </div>
    );
  } catch (err: any) {
    if (
      err?.digest?.startsWith('NEXT_REDIRECT') ||
      err?.message === 'NEXT_REDIRECT' ||
      (typeof err?.digest === 'string' && err.digest.includes('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    console.error('[SecretariatLayout] Erreur technique ou d\'autorisation :', err);
    redirect('/unauthorized?error=security_failure');
  }
}

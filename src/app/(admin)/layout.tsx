import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { type UserRole, MASTER_PLATFORM_ORG_ID, isPlatformAdminUser } from '@/modules/users/types';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
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
      redirect('/login?redirect=/admin');
    }

    // Source d'autorité certifiée : public.users (DEF-C13-A)
    // SÉCURITÉ ABSOLUE : user_metadata et les cookies ne sont JAMAIS utilisés pour accorder des privilèges
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, email, role, is_active, organization_id, security_center_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      console.error('[AdminLayout] Profil public.users absent ou illisible:', dbError);
      redirect('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      redirect('/unauthorized?reason=inactive');
    }

    const role = dbUser.role as UserRole;
    if (role !== 'ADMIN') {
      redirect(`/unauthorized?required=ADMIN&current=${encodeURIComponent(role)}`);
    }

    // Source d'autorité certifiée pour le Super Administrateur de Plateforme :
    // Vérification auprès de la table de sécurité public.platform_admins ou fonction RPC app_is_platform_admin,
    // ou rattachement direct à l'organisation maître MASTER_PLATFORM_ORG_ID.
    // Ne JAMAIS déduire le privilège du seul email, de user_metadata ou d'un cookie.
    let isPlatformAdmin = false;
    try {
      const { data: paRecord } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (paRecord?.user_id) {
        isPlatformAdmin = true;
      } else {
        const { data: rpcAdmin } = await supabase.rpc('app_is_platform_admin');
        if (rpcAdmin === true) {
          isPlatformAdmin = true;
        } else if (dbUser.organization_id === MASTER_PLATFORM_ORG_ID) {
          isPlatformAdmin = true;
        } else if (isPlatformAdminUser({ role, email: dbUser.email, organizationId: dbUser.organization_id })) {
          isPlatformAdmin = true;
        }
      }
    } catch (paErr) {
      console.warn('[AdminLayout] Échec vérification autorité platform_admins:', paErr);
      if (isPlatformAdminUser({ role, email: dbUser.email, organizationId: dbUser.organization_id })) {
        isPlatformAdmin = true;
      } else {
        isPlatformAdmin = false;
      }
    }

    // Les administrateurs d'entreprises clientes (tenants non Platform Admin)
    // sont immédiatement et gracieusement redirigés vers leur centre SOC (/dispatch)
    if (!isPlatformAdmin) {
      redirect('/dispatch');
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
    console.error('[AdminLayout] Erreur technique ou d\'autorisation :', err);
    redirect('/unauthorized?error=security_failure');
  }
}

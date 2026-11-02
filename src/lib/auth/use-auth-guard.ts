'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { getBrowserClient } from '@/lib/supabase/client';
import type { UserRole } from '@/modules/users/types';

/**
 * useAuthGuard
 * Garde de sécurité côté client :
 * 1. Vérifie la session active Supabase Auth
 * 2. Vérifie le rôle réel certifié de l'utilisateur
 * 3. Redirige vers /login si non authentifié
 * 4. Redirige vers /unauthorized si rôle insuffisant
 */
export function useAuthGuard(allowedRoles: UserRole[]) {
  const pathname = usePathname();
  const { authUser } = useSecuria();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      // 1. Vérification de la session active Supabase Auth
      const supabase = getBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (!user) {
        if (isMounted) {
          setIsAuthorized(false);
          window.location.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
        return;
      }

      // 2. Rôle certifié : attendre le profil chargé depuis public.users (via /api/auth/profile).
      // Décider avant ce chargement avec un rôle par défaut renvoyait à tort les opérateurs
      // légitimes vers /unauthorized. Les layouts serveur restent l'autorité finale.
      if (!authUser?.role) {
        return;
      }
      const activeRole: UserRole = authUser.role;

      // 3. Contrôle d'habilitation
      if (!allowedRoles.includes(activeRole)) {
        if (isMounted) {
          setIsAuthorized(false);
          if (activeRole === 'SECRETARY') {
            window.location.replace('/secretariat');
            return;
          }
          window.location.replace(
            `/unauthorized?required=${encodeURIComponent(allowedRoles.join(','))}&current=${encodeURIComponent(activeRole)}`
          );
        }
        return;
      }

      if (isMounted) {
        setIsAuthorized(true);
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [allowedRoles, authUser?.role, pathname]);

  return { isAuthorized };
}

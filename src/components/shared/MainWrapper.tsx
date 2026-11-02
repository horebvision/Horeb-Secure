'use client';

import { usePathname } from 'next/navigation';

/**
 * MainWrapper — applique le padding bottom uniquement sur les pages internes.
 * La page d'accueil (/) gère son propre layout plein-écran.
 */
export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage =
    pathname === '/' ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/request-demo') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  return (
    <main className={`flex-1${isPublicPage ? '' : ' pb-20 md:pb-8'}`}>
      {children}
    </main>
  );
}

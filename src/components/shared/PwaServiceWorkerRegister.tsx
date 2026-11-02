'use client';

import { useEffect } from 'react';

/**
 * Composant d'enregistrement global du Service Worker HOREB SECURE & Capture précoce de l'événement d'installation PWA
 */
export function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Capture précoce du prompt d'installation PWA (évite la perte lors de l'hydratation React)
    const handleEarlyBeforeInstall = (e: Event) => {
      e.preventDefault();
      (window as any)._deferredPwaPrompt = e;
      window.dispatchEvent(new CustomEvent('securia:pwa_prompt_ready'));
    };

    window.addEventListener('beforeinstallprompt', handleEarlyBeforeInstall);

    // 2. Enregistrement du Service Worker
    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          if (process.env.NODE_ENV !== 'production') {
            console.log('[HOREB SECURE PWA] Service Worker actif (scope:', registration.scope, ')');
          }
        } catch (err) {
          console.warn('[HOREB SECURE PWA] Échec enregistrement Service Worker:', err);
        }
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW, { once: true });
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleEarlyBeforeInstall);
    };
  }, []);

  return null;
}

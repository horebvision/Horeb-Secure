'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, PhoneCall } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOffline(!navigator.onLine);

    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      if (wasOffline) {
        setShowReconnected(true);
        const timer = setTimeout(() => setShowReconnected(false), 3500);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [wasOffline]);

  if (isOffline) {
    return (
      <aside
        aria-live="assertive"
        className="w-full bg-amber-600 text-slate-950 px-4 py-2 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-md transition-all z-50 sticky top-0"
      >
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-slate-950 animate-pulse shrink-0" />
          <span>
            <strong>Connexion interrompue :</strong> Mode dégradé local actif. Vos actions sont mises en mémoire tampon.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="tel:+33189000000"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 text-white rounded-lg hover:bg-slate-900 transition-colors text-[11px] font-extrabold"
          >
            <PhoneCall className="w-3 h-3 text-red-400" />
            <span>Appel d’urgence direct</span>
          </a>
        </div>
      </aside>
    );
  }

  if (showReconnected) {
    return (
      <aside
        aria-live="polite"
        className="w-full bg-emerald-600 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all z-50 sticky top-0"
      >
        <Wifi className="w-4 h-4 text-white shrink-0" />
        <span>Connexion réseau rétablie — Synchronisation avec le centre opérationnel réussie.</span>
      </aside>
    );
  }

  return null;
}

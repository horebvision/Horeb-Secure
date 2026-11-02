'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { Compass } from 'lucide-react';

// Chargement dynamique avec désactivation explicite du SSR pour Leaflet (window is not defined)
export const TacticalDispatchMap = dynamic(
  () =>
    import('./TacticalDispatchMap').then((mod) => mod.TacticalDispatchMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[450px] rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Compass className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>Initialisation du radar cartographique tactique...</span>
        </div>
      </div>
    ),
  }
);

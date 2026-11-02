'use client';

import React from 'react';
import { Radio, AlertTriangle, AlertCircle } from 'lucide-react';

interface GpsFreshnessBadgeProps {
  lastUpdateIso?: string | null;
  hasGps?: boolean;
  className?: string;
}

export function GpsFreshnessBadge({
  lastUpdateIso,
  hasGps = true,
  className = '',
}: GpsFreshnessBadgeProps) {
  if (!hasGps || !lastUpdateIso) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-900 text-slate-500 border border-slate-800 ${className}`}
        title="Aucun signal GPS actif reçu de l'appareil"
      >
        <AlertCircle className="w-3 h-3 text-slate-500" />
        <span>❌ GPS INDISPONIBLE</span>
      </span>
    );
  }

  const updateTime = new Date(lastUpdateIso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - updateTime) / 1000));

  if (diffSec <= 30) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 shadow-sm ${className}`}
        title={`Signal GPS reçu il y a ${diffSec} secondes (Haute précision temps réel)`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
        <span>📡 GPS {diffSec}s</span>
      </span>
    );
  }

  if (diffSec <= 120) {
    const mins = Math.floor(diffSec / 60);
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 ${className}`}
        title={`Signal GPS récent reçu il y a ${diffSec} secondes`}
      >
        <Radio className="w-3 h-3 text-cyan-400" />
        <span>📡 GPS {mins > 0 ? `${mins} min` : `${diffSec}s`}</span>
      </span>
    );
  }

  if (diffSec <= 900) {
    const mins = Math.floor(diffSec / 60);
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-400 border border-amber-800 ${className}`}
        title={`Signal GPS ancien datant de ${mins} minutes`}
      >
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        <span>⚠️ GPS {mins} min</span>
      </span>
    );
  }

  const mins = Math.floor(diffSec / 60);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-950 text-rose-400 border border-rose-800 ${className}`}
      title={`Balise GPS obsolète non reçue depuis ${mins} minutes`}
    >
      <AlertCircle className="w-3 h-3 text-rose-400" />
      <span>⚠️ GPS obsolète ({mins}m)</span>
    </span>
  );
}

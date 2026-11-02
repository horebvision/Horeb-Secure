'use client';

import React from 'react';
import { CameraStatus, CameraViewStatus } from '@/lib/video/types';
import { ShieldAlert, CheckCircle2, AlertTriangle, XCircle, PowerOff, Loader2 } from 'lucide-react';

interface CameraStatusBadgeProps {
  status: CameraStatus | CameraViewStatus | string;
  size?: 'sm' | 'md';
}

export function CameraStatusBadge({ status, size = 'md' }: CameraStatusBadgeProps) {
  const isSm = size === 'sm';
  const sizeClasses = isSm ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1';

  switch (status) {
    case 'ONLINE':
    case 'LIVE':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{status === 'LIVE' ? 'EN DIRECT' : 'EN LIGNE'}</span>
        </span>
      );

    case 'OFFLINE':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 ${sizeClasses}`}>
          <XCircle className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>HORS LIGNE</span>
        </span>
      );

    case 'DEGRADED':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 ${sizeClasses}`}>
          <AlertTriangle className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>DÉGRADÉ</span>
        </span>
      );

    case 'CONNECTING':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 ${sizeClasses}`}>
          <Loader2 className={`animate-spin ${isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          <span>CONNEXION...</span>
        </span>
      );

    case 'DISABLED':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700 ${sizeClasses}`}>
          <PowerOff className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>DÉSACTIVÉ</span>
        </span>
      );

    case 'NOT_CONFIGURED':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 ${sizeClasses}`}>
          <span>NON CONFIGURÉ</span>
        </span>
      );

    case 'UNAUTHORIZED':
    case 'ERROR':
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-red-500/10 text-red-400 border border-red-500/20 ${sizeClasses}`}>
          <ShieldAlert className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>ERREUR ACCÈS</span>
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700 ${sizeClasses}`}>
          <span>INCONNU</span>
        </span>
      );
  }
}

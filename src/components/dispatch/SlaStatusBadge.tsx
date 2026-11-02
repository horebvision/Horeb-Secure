'use client';

import React from 'react';
import { SlaStatus } from '@/lib/sla';
import { ShieldCheck, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';

interface SlaStatusBadgeProps {
  status: SlaStatus;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export function SlaStatusBadge({
  status,
  label,
  showIcon = true,
  className = '',
}: SlaStatusBadgeProps) {
  switch (status) {
    case 'BREACHED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase font-mono tracking-wide bg-rose-950/90 text-rose-300 border border-rose-500/80 shadow-md shadow-rose-950/50 animate-pulse ${className}`}
          title="SLA Dépassé — Nécessite une intervention prioritaire du régulateur"
        >
          {showIcon && <AlertOctagon className="w-3 h-3 text-rose-400 shrink-0" />}
          <span>{label || '🔴 SLA DÉPASSÉ'}</span>
        </span>
      );

    case 'AT_RISK':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase font-mono tracking-wide bg-amber-950/90 text-amber-300 border border-amber-500/80 shadow-md shadow-amber-950/50 ${className}`}
          title="SLA à Risque — Proche du dépassement réglementaire"
        >
          {showIcon && <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />}
          <span>{label || '⚠️ SLA À RISQUE'}</span>
        </span>
      );

    case 'COMPLETED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono tracking-wide bg-emerald-950/80 text-emerald-300 border border-emerald-600/70 shadow-sm ${className}`}
          title="Étape complétée dans les délais impartis"
        >
          {showIcon && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          <span>{label || '✓ SLA VALIDÉ'}</span>
        </span>
      );

    case 'NORMAL':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono tracking-wide bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 shadow-sm ${className}`}
          title="Délai opérationnel conforme"
        >
          {showIcon && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          <span>{label || '🟢 SLA OK'}</span>
        </span>
      );
  }
}

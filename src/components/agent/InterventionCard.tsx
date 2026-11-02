'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Car,
  MapPin,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { getReportSummaryText } from '@/lib/interventions/report-parser';

interface InterventionCardProps {
  intervention: {
    id: string;
    status: string;
    assigned_at?: string | null;
    accepted_at?: string | null;
    en_route_at?: string | null;
    arrived_at?: string | null;
    resolved_at?: string | null;
    report?: string | null;
    alert?: {
      id: string;
      alert_number: string;
      type: string;
      priority: string;
      status: string;
      created_at: string;
      location_address?: string | null;
      site_name?: string | null;
      site_address?: string | null;
      client_name?: string | null;
    } | null;
  };
}

export function InterventionCard({ intervention }: InterventionCardProps) {
  const alert = intervention.alert;
  if (!alert) return null;

  const typeConfig =
    (ALERT_TYPE_CONFIG as any)[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Terminée',
          color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
        };
      case 'ON_SITE':
        return {
          label: 'Sur place',
          color: 'bg-amber-950/80 text-amber-300 border-amber-800',
        };
      case 'EN_ROUTE':
        return {
          label: 'En route',
          color: 'bg-cyan-950/80 text-cyan-300 border-cyan-800',
        };
      case 'ACCEPTED':
        return {
          label: 'Acceptée',
          color: 'bg-blue-950/80 text-blue-300 border-blue-800',
        };
      case 'ABORTED':
        return {
          label: 'Annulée / Relève',
          color: 'bg-rose-950/80 text-rose-300 border-rose-800',
        };
      default:
        return {
          label: 'Attribuée',
          color: 'bg-slate-800 text-slate-300 border-slate-700',
        };
    }
  };

  const statusBadge = getStatusBadge(intervention.status);
  const formattedDate = new Date(alert.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-md hover:border-slate-700 transition-all text-white space-y-3">
      {/* En-tête carte */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-900">
            {alert.alert_number}
          </span>
          <span className="text-xs font-bold text-slate-300">{typeConfig.label}</span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.color}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* Lieu & Client */}
      <div className="space-y-1">
        <div className="flex items-start gap-1.5 text-xs text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <span className="truncate font-medium">
            {alert.site_name ? `${alert.site_name} - ` : ''}
            {alert.location_address || alert.site_address || 'Adresse d’intervention'}
          </span>
        </div>

        {alert.client_name && (
          <div className="text-[11px] text-slate-400 pl-5">
            Client : <span className="text-slate-200">{alert.client_name}</span>
          </div>
        )}
      </div>

      {/* Rapport succinct si terminé */}
      {intervention.report && (
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="line-clamp-2 italic">{getReportSummaryText(intervention.report)}</p>
        </div>
      )}

      {/* Pied de carte avec lien de détail */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-xs">
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>

        <Link
          href={`/agent/interventions/${intervention.id}`}
          className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 transition-colors"
        >
          <span>Détail</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

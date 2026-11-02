'use client';

import React from 'react';
import {
  ShieldAlert,
  Car,
  Users,
  Clock,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  TrendingUp,
  Radio,
} from 'lucide-react';

interface MetricsProps {
  alerts: {
    criticalCount: number;
    pendingCount: number;
    inProgressCount: number;
    resolvedCount: number;
    totalActive: number;
  };
  interventions: {
    enRouteCount: number;
    onSiteCount: number;
    assignedCount: number;
    completedCount: number;
    totalActive: number;
  };
  agents: {
    availableCount: number;
    enRouteCount: number;
    onSiteCount: number;
    offDutyCount: number;
    total: number;
  };
  sla: {
    compliantCount: number; // < 5 min ou conforme
    atRiskCount: number;
    breachedCount: number;
    complianceRate: number; // en %
  };
  onFilterChange?: (filter: string) => void;
}

export function CommandCenterMetrics({
  alerts,
  interventions,
  agents,
  sla,
  onFilterChange,
}: MetricsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. BLOC ALERTES ACTIVES */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-950/80 border border-red-500/60 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Alertes Actives
            </span>
          </div>
          <span className="text-lg font-black font-mono text-white">
            {alerts.totalActive}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
          <button
            onClick={() => onFilterChange?.('CRITICAL')}
            className="p-2 rounded-xl bg-red-950/40 hover:bg-red-950/70 border border-red-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-red-300 font-bold block">🔴 Critiques</span>
            <span className="text-sm font-black font-mono text-red-400">{alerts.criticalCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('UNASSIGNED')}
            className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-amber-300 font-bold block">🟠 En attente</span>
            <span className="text-sm font-black font-mono text-amber-400">{alerts.pendingCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('IN_PROGRESS')}
            className="p-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-cyan-300 font-bold block">🟡 En cours</span>
            <span className="text-sm font-black font-mono text-cyan-400">{alerts.inProgressCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('RESOLVED')}
            className="p-2 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 text-left transition-colors"
          >
            <span className="text-[10px] text-slate-400 font-bold block">🟢 Résolues (24h)</span>
            <span className="text-sm font-black font-mono text-slate-300">{alerts.resolvedCount}</span>
          </button>
        </div>
      </div>

      {/* 2. BLOC INTERVENTIONS */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-950/80 border border-blue-500/60 flex items-center justify-center text-blue-400">
              <Car className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Interventions
            </span>
          </div>
          <span className="text-lg font-black font-mono text-white">
            {interventions.totalActive}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
          <button
            onClick={() => onFilterChange?.('EN_ROUTE')}
            className="p-2 rounded-xl bg-blue-950/40 hover:bg-blue-950/70 border border-blue-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-blue-300 font-bold block">🚗 En route</span>
            <span className="text-sm font-black font-mono text-blue-400">{interventions.enRouteCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('ARRIVED')}
            className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-purple-300 font-bold block">📍 Sur site</span>
            <span className="text-sm font-black font-mono text-purple-400">{interventions.onSiteCount}</span>
          </button>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold block">⚪ Assignées</span>
            <span className="text-sm font-black font-mono text-slate-300">{interventions.assignedCount}</span>
          </div>

          <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
            <span className="text-[10px] text-emerald-300 font-bold block">✅ Clôturées</span>
            <span className="text-sm font-black font-mono text-emerald-400">{interventions.completedCount}</span>
          </div>
        </div>
      </div>

      {/* 3. BLOC FLOTTE AGENTS */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Flotte Patrouilles
            </span>
          </div>
          <span className="text-lg font-black font-mono text-white">
            {agents.total}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
          <div className="p-2 rounded-xl bg-emerald-950/50 border border-emerald-800/60">
            <span className="text-[10px] text-emerald-300 font-bold block">🟢 Disponibles</span>
            <span className="text-sm font-black font-mono text-emerald-400">{agents.availableCount}</span>
          </div>

          <div className="p-2 rounded-xl bg-blue-950/50 border border-blue-800/60">
            <span className="text-[10px] text-blue-300 font-bold block">🔵 En déplacement</span>
            <span className="text-sm font-black font-mono text-blue-400">{agents.enRouteCount}</span>
          </div>

          <div className="p-2 rounded-xl bg-amber-950/50 border border-amber-800/60">
            <span className="text-[10px] text-amber-300 font-bold block">🟠 En intervention</span>
            <span className="text-sm font-black font-mono text-amber-400">{agents.onSiteCount}</span>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold block">⚫ Hors service</span>
            <span className="text-sm font-black font-mono text-slate-400">{agents.offDutyCount}</span>
          </div>
        </div>
      </div>

      {/* 4. BLOC SLA GLOBAL */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-center text-cyan-400">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Conformité SLA
            </span>
          </div>
          <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700">
            {sla.complianceRate}% Cible
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 text-xs">
          <button
            onClick={() => onFilterChange?.('SLA_OK')}
            className="p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-emerald-300 font-bold block">⚡ Conforme</span>
            <span className="text-sm font-black font-mono text-emerald-400">{sla.compliantCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('SLA_RISK')}
            className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-amber-300 font-bold block">⚠️ À Risque</span>
            <span className="text-sm font-black font-mono text-amber-400">{sla.atRiskCount}</span>
          </button>

          <button
            onClick={() => onFilterChange?.('SLA_BREACHED')}
            className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/50 text-left transition-colors"
          >
            <span className="text-[10px] text-rose-300 font-bold block">🔴 Dépassé</span>
            <span className="text-sm font-black font-mono text-rose-400">{sla.breachedCount}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

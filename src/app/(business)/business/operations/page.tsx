'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Clock, BarChart3, RefreshCw } from 'lucide-react';
import { OperationsAnalytics } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function OperationsAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OperationsAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOperations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/operations?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Opérations');
      setData(json.operations);
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperations();
  }, [range]);

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">Analyse Opérationnelle Approfondie</span>
        </div>

        <div className="flex items-center gap-2">
          {(['today', '7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === r
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {r === 'today' ? "Aujourd'hui" : r === '7d' ? '7 Jours' : r === '30d' ? '30 Jours' : '90 Jours'}
            </button>
          ))}
          <button
            onClick={fetchOperations}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 ml-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Volume Total d'Interventions</span>
          <div className="text-2xl font-black text-white mt-2">
            {loading ? '...' : (data?.volume.total ?? 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Sur la période filtrée</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Durée Moyenne d'Intervention</span>
          <div className="text-2xl font-black text-cyan-300 mt-2">
            {loading ? '...' : (data?.durations.formattedAverage || 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Départ jusqu'à clôture</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Durée Médiane</span>
          <div className="text-2xl font-black text-white mt-2">
            {loading ? '...' : (data?.durations.formattedMedian || 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Non biaisée par les extrêmes</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Interventions Résolues</span>
          <div className="text-2xl font-black text-emerald-300 mt-2">
            {loading ? '...' : (data?.volume.resolved ?? 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {data ? `${data.volume.inProgress} en cours` : '—'}
          </span>
        </div>
      </div>

      {/* Breakdowns : Types & Criticité */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Incident Type */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Interventions par Type d'Incident
          </h3>
          <div className="space-y-2 mt-4">
            {data?.byType && data.byType.length > 0 ? (
              data.byType.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-300 font-medium">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{item.percentage}%</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">{item.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-500">Aucune donnée sur la période</span>
            )}
          </div>
        </div>

        {/* By Severity */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-rose-400" />
            Interventions par Niveau de Criticité
          </h3>
          <div className="space-y-2 mt-4">
            {data?.bySeverity && data.bySeverity.length > 0 ? (
              data.bySeverity.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-300 font-medium">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">{item.percentage}%</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-rose-300 font-bold">{item.count}</span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-500">Aucune donnée sur la période</span>
            )}
          </div>
        </div>
      </div>

      {/* Sites les plus actifs */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          Sites les Plus Actifs (Volume Observé)
        </h3>
        <p className="text-xs text-slate-400">
          Distribution factuelle des interventions par site protégé.
        </p>

        {data?.bySite && data.bySite.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {data.bySite.map((site) => (
              <div key={site.siteId} className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 truncate pr-2">{site.siteName}</span>
                <span className="px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold">
                  {site.count} inter.
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-6 text-center">Aucun site avec intervention enregistrée.</div>
        )}
      </div>
    </div>
  );
}

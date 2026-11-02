'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Calendar, RefreshCw } from 'lucide-react';
import { RiskAnalyticsSummary } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function RiskAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [riskData, setRiskData] = useState<RiskAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const hoursOfDay = Array.from({ length: 24 }, (_, i) => i);

  const fetchRisk = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/risk?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Risques');
      setRiskData(json.risk);
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRisk();
  }, [range]);

  // Map 7x24 heatmap cells
  const heatmapMap = new Map<string, number>();
  riskData?.heatmapMatrix?.forEach((c) => {
    heatmapMap.set(`${c.dayIndex}-${c.hour}`, c.count);
  });

  const maxHeatmapCount = Math.max(
    1,
    ...(riskData?.heatmapMatrix?.map((c) => c.count) || [1])
  );

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-slate-200">
              Analyse Temporelle &amp; Concentrations d'Incidents
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Formulations factuelles : Nombre d'incidents observés sur la période sans qualification subjective
          </p>
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
            onClick={fetchRisk}
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

      {/* 7x24 Matrix Heatmap (Section 11) */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              Matrice Temporelle : Jour de la Semaine × Heure du Jour
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Concentration historique des alertes selon l'heure de déclenchement (00h à 23h).
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>0</span>
            <div className="flex h-2.5 w-16 rounded overflow-hidden">
              <span className="w-1/4 bg-slate-800" />
              <span className="w-1/4 bg-cyan-900" />
              <span className="w-1/4 bg-cyan-600" />
              <span className="w-1/4 bg-amber-500" />
            </div>
            <span>Max ({maxHeatmapCount})</span>
          </div>
        </div>

        <div className="overflow-x-auto pt-2">
          <table className="w-full text-center text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="p-1.5 text-left text-slate-500 font-normal w-24">Jour</th>
                {hoursOfDay.map((h) => (
                  <th key={h} className="p-1 text-slate-400 font-mono text-[10px]">
                    {h}h
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {daysOfWeek.map((dayName, dayIdx) => (
                <tr key={dayName}>
                  <td className="p-1.5 text-left font-semibold text-slate-300 text-xs">{dayName}</td>
                  {hoursOfDay.map((h) => {
                    const count = heatmapMap.get(`${dayIdx}-${h}`) || 0;
                    const intensity = count === 0 ? 0 : count / maxHeatmapCount;
                    const bgClass =
                      count === 0
                        ? 'bg-slate-900/60 text-slate-600'
                        : intensity > 0.6
                        ? 'bg-amber-500/80 text-black font-bold'
                        : intensity > 0.3
                        ? 'bg-cyan-600 text-white font-semibold'
                        : 'bg-cyan-950 text-cyan-300';

                    return (
                      <td key={h} className="p-0.5">
                        <div
                          className={`h-7 w-full flex items-center justify-center rounded transition-all ${bgClass}`}
                          title={`${dayName} à ${h}h : ${count} alertes enregistrées`}
                        >
                          {count > 0 ? count : '·'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Concentrations par Site Protégé (Section 10) */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            Concentrations Historiques d'Incidents par Site
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Observations basées sur le volume réel d'incidents constatés au cours de la période.
          </p>
        </div>

        {!riskData?.topIncidentSites || riskData.topIncidentSites.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">Aucun incident enregistré sur cette période.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {riskData.topIncidentSites.map((sm) => (
              <div
                key={sm.siteId}
                className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{sm.siteName}</h4>
                    <span className="text-[10px] text-slate-400 block mt-0.5 truncate max-w-[200px]">
                      {sm.address || 'Site référencé'}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-bold text-xs">
                    {sm.totalIncidents} obs.
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 text-slate-400">
                  <span>Critiques : <strong className="text-rose-400">{sm.criticalIncidents}</strong></span>
                  <span>Type dominant : <strong className="text-cyan-300">{sm.dominantIncidentType}</strong></span>
                </div>

                <div className="text-[11px] text-slate-400">
                  Conformité SLA : <strong className="text-emerald-400">
                    {sm.slaCompliancePct != null ? `${sm.slaCompliancePct}%` : 'N/D'}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

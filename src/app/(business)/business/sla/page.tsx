'use client';

import React, { useEffect, useState } from 'react';
import { Clock, ShieldCheck, AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';
import { SlaAnalyticsSummary } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function SlaAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [slaData, setSlaData] = useState<SlaAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSla = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/sla?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API SLA');
      setSlaData(json.sla);
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service SLA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSla();
  }, [range]);

  const totalEvaluated =
    slaData
      ? slaData.statusBreakdown.completedOrNormal +
        slaData.statusBreakdown.atRisk +
        slaData.statusBreakdown.breached
      : 0;

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">
            Audit Analytique SLA (Moteur Phase 2 Certifié)
          </span>
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
            onClick={fetchSla}
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

      {/* KPI Cards SLA Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Taux de Respect Global</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 mt-2">
            {loading ? '...' : slaData?.overallCompliancePct != null ? `${slaData.overallCompliancePct}%` : 'N/D'}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {slaData ? `${slaData.statusBreakdown.completedOrNormal} conformes / ${totalEvaluated} évalués` : '—'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>SLA Respectés (Normal / Terminé)</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-cyan-300 mt-2">
            {loading ? '...' : (slaData?.statusBreakdown.completedOrNormal ?? 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Dans les temps impartis</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>SLA À Risque (Warning)</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-300 mt-2">
            {loading ? '...' : (slaData?.statusBreakdown.atRisk ?? 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Proche du seuil d'alerte</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>SLA Dépassés (Breached)</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-rose-400 mt-2">
            {loading ? '...' : (slaData?.statusBreakdown.breached ?? 'N/D')}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">Hors engagement contractuel</span>
        </div>
      </div>

      {/* Tableau SLA par Site */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-white">Respect SLA par Site Protégé</h3>
        <p className="text-xs text-slate-400">
          Tableau factuel de conformité contractuelle pour chaque site client.
        </p>

        {!slaData?.siteSlaTable || slaData.siteSlaTable.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">Aucune intervention avec SLA enregistré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Site Protégé</th>
                  <th className="p-3">Interventions</th>
                  <th className="p-3">SLA Respectés</th>
                  <th className="p-3">SLA Dépassés</th>
                  <th className="p-3">Taux de Respect</th>
                  <th className="p-3">Arrivée Moyenne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {slaData.siteSlaTable.map((s) => (
                  <tr key={s.siteId} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-white">{s.siteName}</td>
                    <td className="p-3">{s.interventionsCount}</td>
                    <td className="p-3 text-emerald-400 font-semibold">{s.slaRespectedCount}</td>
                    <td className="p-3 text-rose-400 font-semibold">{s.slaBreachedCount}</td>
                    <td className="p-3 font-bold">{s.compliancePct != null ? `${s.compliancePct}%` : 'N/D'}</td>
                    <td className="p-3 text-slate-400">{s.formattedAvgArrival}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tableau SLA par Agent */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div>
          <h3 className="text-base font-bold text-white">Respect SLA par Agent Déployé</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Indicateurs factuels calculés sans attribution automatique de responsabilité.
          </p>
        </div>

        {!slaData?.agentSlaTable || slaData.agentSlaTable.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">Aucune intervention avec agent enregistré.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Agent</th>
                  <th className="p-3">Interventions</th>
                  <th className="p-3">SLA Respectés</th>
                  <th className="p-3">SLA Dépassés</th>
                  <th className="p-3">Taux de Respect</th>
                  <th className="p-3">Arrivée Moyenne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {slaData.agentSlaTable.map((a) => (
                  <tr key={a.agentId} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-white">{a.agentName}</td>
                    <td className="p-3">{a.interventionsCount}</td>
                    <td className="p-3 text-emerald-400 font-semibold">{a.slaRespectedCount}</td>
                    <td className="p-3 text-rose-400 font-semibold">{a.slaBreachedCount}</td>
                    <td className="p-3 font-bold">{a.compliancePct != null ? `${a.compliancePct}%` : 'N/D'}</td>
                    <td className="p-3 text-slate-400">{a.formattedAvgArrival}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

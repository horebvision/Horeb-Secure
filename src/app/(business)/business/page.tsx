'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Radio,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Building,
  ShieldCheck,
  TrendingUp,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { ExecutiveKpiSummary, TrendPoint } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function ExecutiveDashboardPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<ExecutiveKpiSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/kpis?range=${range}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur de chargement des KPIs');
      }
      setKpis(data.kpis);
      setTrends(data.trends || []);
      setPeriodLabel(data.periodLabel || '');
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service analytique');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpis();
  }, [range]);

  const alertsGrowth =
    kpis?.trends?.alertsEvolutionPct != null
      ? `${kpis.trends.alertsEvolutionPct > 0 ? '+' : ''}${kpis.trends.alertsEvolutionPct}%`
      : '—';

  const interventionsGrowth =
    kpis?.trends?.interventionsEvolutionPct != null
      ? `${kpis.trends.interventionsEvolutionPct > 0 ? '+' : ''}${kpis.trends.interventionsEvolutionPct}%`
      : '—';

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">Filtre Temporel :</span>
          <span className="text-xs text-slate-400">{periodLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {(['today', '7d', '30d', '90d'] as const).map((r) => {
            const labels = { today: "Aujourd'hui", '7d': '7 Jours', '30d': '30 Jours', '90d': '90 Jours' };
            const isSelected = range === r;
            return (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-cyan-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {labels[r]}
              </button>
            );
          })}

          <button
            onClick={fetchKpis}
            title="Rafraîchir les données réelles"
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

      {/* 17 KPIs Exécutifs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* KPI 1 : Total Alertes */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Alertes</span>
            <Bell className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.totalAlerts ?? 'N/D')}
            </div>
            <div className="text-xs text-cyan-400 mt-1">{alertsGrowth}</div>
          </div>
        </div>

        {/* KPI 2 : Total Interventions */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Interventions Déclenchées</span>
            <Radio className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.totalInterventions ?? 'N/D')}
            </div>
            <div className="text-xs text-indigo-400 mt-1">{interventionsGrowth}</div>
          </div>
        </div>

        {/* KPI 3 : Alertes Critiques */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Incidents Critiques</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-300">
              {loading ? '...' : (kpis?.criticalAlertsCount ?? 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Priorité Haute / Critique</div>
          </div>
        </div>

        {/* KPI 10 : Taux de respect SLA */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Taux de Respect SLA</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-300">
              {loading ? '...' : kpis?.slaComplianceRatePct != null ? `${kpis.slaComplianceRatePct}%` : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Conformité engagements</div>
          </div>
        </div>

        {/* KPI 4 : Temps moyen acquittement */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Acquittement (T2)</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.formattedAvgAckDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Prise en charge SOC</div>
          </div>
        </div>

        {/* KPI 5 : Temps moyen assignation */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Assignation (T3)</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.formattedAvgAssignDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Choix de l'agent</div>
          </div>
        </div>

        {/* KPI 6 : Temps moyen acceptation */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Acceptation (T4)</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.formattedAvgAcceptDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Confirmation agent</div>
          </div>
        </div>

        {/* KPI 7 : Temps moyen départ */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Départ (T5)</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.formattedAvgDepartDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Départ en route</div>
          </div>
        </div>

        {/* KPI 8 : Temps moyen d'arrivée */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Arrivée Site (T6)</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-200">
              {loading ? '...' : (kpis?.formattedAvgArrivalDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Délai clé de sécurité</div>
          </div>
        </div>

        {/* KPI 9 : Temps moyen de résolution */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Moy. Résolution (T7)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.formattedAvgResolutionDuration || 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Levée de doute &amp; rapport</div>
          </div>
        </div>

        {/* KPI 11 : Taux de résolution */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Taux de Résolution</span>
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : kpis?.resolutionRatePct != null ? `${kpis.resolutionRatePct}%` : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Interventions clôturées</div>
          </div>
        </div>

        {/* KPI 12 : Taux de fausses alertes */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Taux Fausses Alertes</span>
            <AlertTriangle className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : kpis?.falseAlarmRatePct != null ? `${kpis.falseAlarmRatePct}%` : 'N/D'}
            </div>
            <div className="text-xs text-slate-400 mt-1">Alarmes non confirmées</div>
          </div>
        </div>

        {/* KPI 13 : Agents actifs */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Agents Actifs</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">
              {loading ? '...' : (kpis?.activeAgentsCount ?? 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Effectif mobilisé</div>
          </div>
        </div>

        {/* KPI 14 : Agents disponibles */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Agents Disponibles</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-300">
              {loading ? '...' : (kpis?.availableAgentsCount ?? 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Prêts pour dispatch</div>
          </div>
        </div>

        {/* KPI 15 : Agents en intervention */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Agents en Mission</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-300">
              {loading ? '...' : (kpis?.busyAgentsCount ?? 'N/D')}
            </div>
            <div className="text-xs text-slate-400 mt-1">Sur le terrain</div>
          </div>
        </div>

        {/* KPI 16 & 17 : Sites et Clients */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Périmètre Protégé</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-4">
            <div>
              <div className="text-xl font-bold text-white">
                {loading ? '...' : (kpis?.protectedSitesCount ?? 'N/D')}
              </div>
              <div className="text-[10px] text-slate-400 uppercase">Sites</div>
            </div>
            <div>
              <div className="text-xl font-bold text-white">
                {loading ? '...' : (kpis?.activeClientsCount ?? 'N/D')}
              </div>
              <div className="text-[10px] text-slate-400 uppercase">Clients</div>
            </div>
          </div>
        </div>
      </div>

      {/* Graphiques & Tendances (Section 5) */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Évolution Journalière &amp; Respect SLA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Historique réel consolidé sur la période sélectionnée ({periodLabel})
            </p>
          </div>
        </div>

        {trends.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Aucun événement historique enregistré sur cette période.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Alertes</th>
                  <th className="p-3">Interventions</th>
                  <th className="p-3">SLA Conformes</th>
                  <th className="p-3">SLA Dépassés</th>
                  <th className="p-3">Arrivée Moyenne</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {trends.map((pt) => (
                  <tr key={pt.date} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-white">{pt.date}</td>
                    <td className="p-3">{pt.alerts}</td>
                    <td className="p-3">{pt.interventions}</td>
                    <td className="p-3 text-emerald-400 font-semibold">{pt.slaRespected}</td>
                    <td className="p-3 text-rose-400 font-semibold">{pt.slaBreached}</td>
                    <td className="p-3 text-slate-400">
                      {pt.avgArrivalSeconds != null ? `${Math.round(pt.avgArrivalSeconds / 60)} min` : 'N/D'}
                    </td>
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

'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, Settings, AlertCircle, Save, CheckCircle2, RefreshCw } from 'lucide-react';
import { FinancialAnalyticsSummary, OrganizationFinancialSettings } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function FinancialAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [finance, setFinance] = useState<FinancialAnalyticsSummary | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states for settings
  const [agentHourlyRate, setAgentHourlyRate] = useState<number>(0);
  const [vehicleHourlyRate, setVehicleHourlyRate] = useState<number>(0);
  const [fixedFeePerIntervention, setFixedFeePerIntervention] = useState<number>(0);
  const [kilometerRate, setKilometerRate] = useState<number>(0);
  const [defaultClientBilledPrice, setDefaultClientBilledPrice] = useState<number>(0);
  const [targetMarginPercentage, setTargetMarginPercentage] = useState<number>(30);
  const [currency, setCurrency] = useState<string>('FCFA');

  const fetchFinance = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/finance?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Finance');

      setFinance(json.finance);
      const st = json.finance?.settings as OrganizationFinancialSettings | null;
      if (st) {
        setAgentHourlyRate(st.agent_hourly_cost || 0);
        setVehicleHourlyRate(st.vehicle_hourly_cost || 0);
        setFixedFeePerIntervention(st.fixed_intervention_cost || 0);
        setKilometerRate(st.cost_per_kilometer || 0);
        setDefaultClientBilledPrice(st.default_billing_rate || 0);
        setTargetMarginPercentage(st.target_gross_margin_pct || 30);
        setCurrency(st.currency || 'FCFA');
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service financier');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinance();
  }, [range]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      setSaveSuccess(false);
      setError(null);

      const res = await authFetch('/api/business/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_hourly_cost: agentHourlyRate,
          vehicle_hourly_cost: vehicleHourlyRate,
          fixed_intervention_cost: fixedFeePerIntervention,
          cost_per_kilometer: kilometerRate,
          default_billing_rate: defaultClientBilledPrice,
          target_gross_margin_pct: targetMarginPercentage,
          currency,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur de sauvegarde');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchFinance();
    } catch (err: any) {
      setError(err.message || 'Échec de sauvegarde des paramètres financiers');
    } finally {
      setSavingSettings(false);
    }
  };

  const formatAmount = (val: number | null): string => {
    if (val == null) return 'N/D';
    return `${val.toLocaleString('fr-FR')} ${finance?.currency || 'FCFA'}`;
  };

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">
              Analytique Financière &amp; Rentabilité Estimée
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Calculs strictement basés sur les barèmes configurés par l'organisation.
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
            onClick={fetchFinance}
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

      {/* Avertissement si non configuré */}
      {!loading && finance && !finance.isConfigured && (
        <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/50 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 space-y-1">
            <h4 className="font-bold text-amber-300 text-sm">Configuration financière requise</h4>
            <p>
              Les barèmes de coût (agent, véhicule, forfait) n'ont pas encore été définis pour cette organisation.
              Les métriques financières ne sont pas inventées et sont marquées non applicables tant que la configuration ci-dessous n'est pas renseignée.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Financiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">CA Estimé</span>
          <div className="text-xl font-black text-white mt-2">
            {loading ? '...' : formatAmount(finance?.totalEstimatedRevenue ?? null)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Prix facturés barème</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Coût Estimé</span>
          <div className="text-xl font-black text-rose-300 mt-2">
            {loading ? '...' : formatAmount(finance?.totalEstimatedCost ?? null)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Agent + Véhicule + Fixe</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Marge Brute</span>
          <div className="text-xl font-black text-emerald-300 mt-2">
            {loading ? '...' : formatAmount(finance?.estimatedGrossMargin ?? null)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">CA - Coût estimé</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Marge %</span>
          <div className="text-xl font-black text-cyan-300 mt-2">
            {loading ? '...' : finance?.estimatedGrossMarginPct != null ? `${finance.estimatedGrossMarginPct}%` : 'N/D'}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Taux de rentabilité</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Coût Moyen / Mission</span>
          <div className="text-xl font-black text-white mt-2">
            {loading ? '...' : formatAmount(finance?.avgEstimatedCostPerIntervention ?? null)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Par intervention</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Revenu Moyen / Mission</span>
          <div className="text-xl font-black text-white mt-2">
            {loading ? '...' : formatAmount(finance?.avgEstimatedRevenuePerIntervention ?? null)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Par intervention</span>
        </div>
      </div>

      {/* Formulaire de Barèmes Financiers (Section 12) */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            Paramètres Financiers de l'Organisation
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configurez vos barèmes horaires et forfaits réels pour activer les projections financières.
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coût Horaire Agent ({currency}/h)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={agentHourlyRate}
                onChange={(e) => setAgentHourlyRate(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coût Horaire Véhicule ({currency}/h)
              </label>
              <input
                type="number"
                min="0"
                step="50"
                value={vehicleHourlyRate}
                onChange={(e) => setVehicleHourlyRate(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coût Fixe par Intervention ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={fixedFeePerIntervention}
                onChange={(e) => setFixedFeePerIntervention(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Coût Kilométrique ({currency}/km)
              </label>
              <input
                type="number"
                min="0"
                step="10"
                value={kilometerRate}
                onChange={(e) => setKilometerRate(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Prix Moyen Facturé au Client ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="500"
                value={defaultClientBilledPrice}
                onChange={(e) => setDefaultClientBilledPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Devise &amp; Marge Cible (%)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="FCFA / EUR"
                  className="w-1/2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={targetMarginPercentage}
                  onChange={(e) => setTargetMarginPercentage(Number(e.target.value))}
                  className="w-1/2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{savingSettings ? 'Enregistrement...' : 'Enregistrer les Barèmes'}</span>
            </button>

            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                Paramètres financiers sauvegardés avec succès
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

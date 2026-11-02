'use client';

import React, { useEffect, useState } from 'react';
import { Building2, MapPin, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { SiteIncidentRisk } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function SitesAnalyticsPage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteIncidentRisk[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteIncidentRisk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/risk?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Risques/Sites');
      const list = json.risk?.topIncidentSites || [];
      setSites(list);
      if (list.length > 0 && !selectedSite) {
        setSelectedSite(list[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, [range]);

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">
            Analyse d'Activité par Site Protégé
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
            onClick={fetchSites}
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

      {/* Grid Layout : Sites List & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Inventaire des Sites Protégés</h3>
            <span className="text-xs text-slate-400">{sites.length} sites avec incidents</span>
          </div>

          {sites.length === 0 ? (
            <div className="text-xs text-slate-500 py-12 text-center">Aucun incident enregistré sur les sites protégés.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Site</th>
                    <th className="p-3">Incidents</th>
                    <th className="p-3">Critiques</th>
                    <th className="p-3">Type Dominant</th>
                    <th className="p-3">Conformité SLA</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sites.map((s) => {
                    const isSelected = selectedSite?.siteId === s.siteId;
                    return (
                      <tr
                        key={s.siteId}
                        onClick={() => setSelectedSite(s)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-white">{s.siteName}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">{s.address || 'Adresse standard'}</div>
                        </td>
                        <td className="p-3 font-bold">{s.totalIncidents}</td>
                        <td className="p-3 text-rose-400 font-semibold">{s.criticalIncidents}</td>
                        <td className="p-3 text-cyan-300 font-medium">{s.dominantIncidentType}</td>
                        <td className="p-3 text-emerald-400 font-bold">
                          {s.slaCompliancePct != null ? `${s.slaCompliancePct}%` : 'N/D'}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSite(s);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white text-xs font-semibold"
                          >
                            Détail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Site Detail */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Fiche Site Protégé
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Statistiques réelles d'incidents et SLA</p>
          </div>

          {selectedSite ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nom du Site</span>
                <div className="text-base font-black text-white mt-0.5">{selectedSite.siteName}</div>
                <div className="text-slate-400 mt-1 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{selectedSite.address || 'Adresse opérationnelle'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Total Incidents</span>
                  <span className="text-lg font-bold text-white">{selectedSite.totalIncidents}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Critiques</span>
                  <span className="text-lg font-bold text-rose-300">{selectedSite.criticalIncidents}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Type Dominant</span>
                  <span className="text-xs font-bold text-cyan-300 truncate block mt-1">{selectedSite.dominantIncidentType}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Respect SLA</span>
                  <span className="text-lg font-bold text-emerald-400">
                    {selectedSite.slaCompliancePct != null ? `${selectedSite.slaCompliancePct}%` : 'N/D'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                <span className="text-slate-400 text-[10px] block uppercase font-bold">Dernier Incident Observé</span>
                <span className="text-slate-300 text-xs mt-1 block">
                  {selectedSite.lastIncidentDate
                    ? new Date(selectedSite.lastIncidentDate).toLocaleString('fr-FR')
                    : 'Aucun incident récent'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-12 text-center">Sélectionnez un site pour voir ses métriques.</div>
          )}
        </div>
      </div>
    </div>
  );
}

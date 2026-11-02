'use client';

import React, { useEffect, useState } from 'react';
import { Shield, Clock, MapPin, RefreshCw } from 'lucide-react';
import { AgentPerformanceRecord } from '@/lib/analytics/types';
import { authFetch } from '@/lib/utils/api-client';

export default function AgentPerformancePage() {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentPerformanceRecord[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentPerformanceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/business/agents?range=${range}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur API Agents');
      setAgents(json.agents || []);
      if (json.agents?.length > 0 && !selectedAgent) {
        setSelectedAgent(json.agents[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [range]);

  const formatSeconds = (sec: number | null): string => {
    if (sec == null || isNaN(sec)) return 'N/D';
    if (sec < 60) return `${Math.round(sec)}s`;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
  };

  return (
    <div className="space-y-8">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">
            Performance Factuelle des Agents (Aide à la Décision)
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
            onClick={fetchAgents}
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

      {/* Main Layout : Agent List & Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column : Agents Table */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Effectif Opérationnel Déployé</h3>
            <span className="text-xs text-slate-400">{agents.length} agents répertoriés</span>
          </div>

          {agents.length === 0 ? (
            <div className="text-xs text-slate-500 py-12 text-center">Aucun agent enregistré dans l'organisation.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3">Agent</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3">Missions</th>
                    <th className="p-3">Temps Arrivée</th>
                    <th className="p-3">Respect SLA</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {agents.map((a) => {
                    const isSelected = selectedAgent?.agentId === a.agentId;
                    return (
                      <tr
                        key={a.agentId}
                        onClick={() => setSelectedAgent(a)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-semibold text-white">{a.fullName}</div>
                          <div className="text-[10px] text-slate-400">Matricule : {a.badgeNumber}</div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.dutyStatus === 'ON_DUTY'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : a.dutyStatus === 'BUSY'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {a.dutyStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-white">{a.interventionsCompleted}</span>
                          <span className="text-slate-500"> / {a.interventionsAssigned}</span>
                        </td>
                        <td className="p-3 text-slate-300">{formatSeconds(a.avgArrivalSeconds)}</td>
                        <td className="p-3">
                          <span className="text-emerald-400 font-bold">
                            {a.slaCompliancePct != null ? `${a.slaCompliancePct}%` : 'N/D'}
                          </span>
                          <span className="text-[10px] text-slate-500 block">({a.slaBreachedCount} dépassés)</span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAgent(a);
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white text-xs font-semibold"
                          >
                            Fiche
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

        {/* Right Column : Selected Agent Factsheet */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              Fiche Agent Factuelle
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Détail des métriques certifiées sans score arbitraire</p>
          </div>

          {selectedAgent ? (
            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Identité &amp; Véhicule</span>
                <div className="text-base font-black text-white mt-0.5">{selectedAgent.fullName}</div>
                <div className="text-slate-400 mt-0.5">Badge : {selectedAgent.badgeNumber}</div>
                <div className="text-slate-400">Véhicule : {selectedAgent.patrolVehicle || 'Non assigné'}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Missions Assignées</span>
                  <span className="text-lg font-bold text-white">{selectedAgent.interventionsAssigned}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Terminées</span>
                  <span className="text-lg font-bold text-emerald-300">{selectedAgent.interventionsCompleted}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Moy. Acceptation</span>
                  <span className="text-lg font-bold text-white">{formatSeconds(selectedAgent.avgAcceptSeconds)}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400 text-[10px] block">Moy. Arrivée Site</span>
                  <span className="text-lg font-bold text-amber-200">{formatSeconds(selectedAgent.avgArrivalSeconds)}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                <span className="text-slate-400 text-[10px] block uppercase font-bold">Conformité SLA</span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Taux de respect :</span>
                  <span className="font-bold text-emerald-400">
                    {selectedAgent.slaCompliancePct != null ? `${selectedAgent.slaCompliancePct}%` : 'N/D'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>SLA respectés :</span>
                  <span>{selectedAgent.slaRespectedCount}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>SLA dépassés :</span>
                  <span>{selectedAgent.slaBreachedCount}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-12 text-center">Sélectionnez un agent pour voir sa fiche.</div>
          )}
        </div>
      </div>
    </div>
  );
}

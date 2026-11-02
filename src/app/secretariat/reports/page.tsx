'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  FileSpreadsheet,
  Calendar,
  Download,
  RefreshCw,
  Clock,
  Users,
  CheckCircle2,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { SecretariatStats, VisitorVisit } from '@/lib/secretariat/types';

export default function SecretariatReportsPage() {
  const [stats, setStats] = useState<SecretariatStats | null>(null);
  const [recentVisits, setRecentVisits] = useState<VisitorVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/secretariat/reports');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setStats(data.stats);
        }
      }

      const listRes = await authFetch('/api/secretariat/visits?limit=30');
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.success && Array.isArray(listData.visits)) {
          setRecentVisits(listData.visits);
        }
      }
    } catch (e) {
      console.warn('Erreur load reports:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const getCsvUrl = () => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/secretariat/reports?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation retour */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/secretariat"
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 mb-1">
                <FileSpreadsheet className="w-3 h-3 text-purple-400" />
                <span>Analytique & Export Réglementaire</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Rapports du Secrétariat
              </h1>
              <p className="text-xs text-slate-400">
                Extraction du registre avec protection de la confidentialité et traçabilité d'audit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadReports}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Panneau d'exportation CSV */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Exportation du Registre de Présence (CSV)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Téléchargez les données certifiées avec masquage automatique des numéros complets de pièces d'identité.
              </p>
            </div>

            <a
              href={getCsvUrl()}
              download
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger l'Export CSV</span>
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Date de début (optionnel)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Date de fin (optionnel)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Chaque téléchargement d'export est journalisé dans le registre d'audit avec l'identité de l'opérateur, la date serveur et le nombre d'enregistrements exportés.
            </span>
          </div>
        </div>

        {/* Historique récent récapitulatif */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Dernières Visites Enregistrées ({recentVisits.length})</span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-bold">
                  <th className="pb-3 pl-2">Référence</th>
                  <th className="pb-3">Visiteur(s)</th>
                  <th className="pb-3">Société</th>
                  <th className="pb-3">Motif</th>
                  <th className="pb-3">Arrivée</th>
                  <th className="pb-3">Départ</th>
                  <th className="pb-3">Durée</th>
                  <th className="pb-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentVisits.map((v) => {
                  const p = v.people?.[0];
                  return (
                    <tr key={v.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pl-2 font-mono font-bold text-amber-400">
                        <Link href={`/secretariat/visitors/${v.id}`} className="hover:underline">
                          {v.visit_reference}
                        </Link>
                      </td>
                      <td className="py-3 font-bold text-white">
                        {p?.full_name || 'Inconnu'}
                        {(v.people?.length || 0) > 1 ? ` (+${(v.people?.length || 1) - 1})` : ''}
                      </td>
                      <td className="py-3 text-slate-300">{v.visitor_company || 'Particulier'}</td>
                      <td className="py-3 text-slate-300">{v.visit_reason}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">
                        {new Date(v.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">
                        {p?.departure_at
                          ? new Date(p.departure_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '--'}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-slate-300">
                        {p?.duration_minutes ? `${p.duration_minutes} min` : 'En cours'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.status === 'PRESENT'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          }`}
                        >
                          {v.status === 'PRESENT' ? 'PRÉSENT' : 'SORTI'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

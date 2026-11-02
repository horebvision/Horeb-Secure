'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileArchive,
  Download,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Building,
  RefreshCw,
  FileSpreadsheet,
  Layers,
  Calendar,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import { ExportPreviewSummary, ExportFilters } from '@/lib/exports/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ExportCenterPage() {
  const [filters, setFilters] = useState<ExportFilters>({
    startDate: '',
    endDate: '',
    siteId: '',
    status: '',
    incidentType: '',
    severity: '',
    slaStatus: '',
    searchQuery: '',
    includePhotos: true,
  });

  const [summary, setSummary] = useState<ExportPreviewSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Charger la prévisualisation
  const fetchPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.siteId) params.set('siteId', filters.siteId);
      if (filters.status) params.set('status', filters.status);
      if (filters.incidentType) params.set('incidentType', filters.incidentType);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.slaStatus) params.set('slaStatus', filters.slaStatus);
      if (filters.searchQuery) params.set('search', filters.searchQuery);
      params.set('includePhotos', String(filters.includePhotos));

      const res = await authFetch(`/api/exports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Erreur lors de la prévisualisation des interventions.');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreview();
  }, []);

  const handleGenerateExport = async () => {
    try {
      setGenerating(true);
      setError(null);
      setSuccessMsg(null);
      setDownloadUrl(null);

      const res = await authFetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.download_url) {
          setDownloadUrl(data.download_url);
          setSuccessMsg(`Archive générée avec succès (${data.total_items} interventions). Téléchargement prêt.`);
        } else {
          setSuccessMsg(`Job d'export #${data.job.id} en cours de traitement asynchrone.`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Erreur lors de la génération de l’archive.');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur réseau');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* HEADER DE NAVIGATION */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dispatch"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Retour au Command Center"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <FileArchive className="w-5 h-5 text-cyan-400" />
                <h1 className="text-base font-extrabold tracking-wide uppercase text-white">
                  HOREB SECURE EXPORT CENTER
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold">
                  PHASE 4
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Extraction multi-rapports, synthèse CSV certifiée et archives ZIP conformes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchPreview}
              disabled={loading}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* BANNIÈRE SUCCÈS OU ERREUR */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg transition-transform hover:scale-105"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger le ZIP</span>
              </a>
            )}
          </div>
        )}

        {/* SECTION FILTRES SERVEUR (Section 6) */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <Filter className="w-4 h-4 text-cyan-400" />
              <span>Filtres d'exportation serveur</span>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Exécution côté base de données (zéro surcharge navigateur)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Date Début</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Date Fin</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Statut Intervention</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              >
                <option value="">Tous les statuts</option>
                <option value="RESOLVED">Clôturée (RESOLVED)</option>
                <option value="ARRIVED">Arrivée sur site (ARRIVED)</option>
                <option value="EN_ROUTE">En route (EN_ROUTE)</option>
                <option value="ASSIGNED">Assignée (ASSIGNED)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Conformité SLA</label>
              <select
                value={filters.slaStatus}
                onChange={(e) => setFilters({ ...filters, slaStatus: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              >
                <option value="">Tous statuts SLA</option>
                <option value="COMPLETED">SLA Respecté</option>
                <option value="BREACHED">SLA Dépassé</option>
                <option value="AT_RISK">SLA À risque</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Type d'Incident</label>
              <select
                value={filters.incidentType}
                onChange={(e) => setFilters({ ...filters, incidentType: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              >
                <option value="">Tous types d'incidents</option>
                <option value="INTRUSION">Intrusion</option>
                <option value="MENACE">Menace</option>
                <option value="AGRESSION">Agression</option>
                <option value="PERSONNE_SUSPECTE">Personne Suspecte</option>
                <option value="URGENCE">Urgence</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Criticité / Priorité</label>
              <select
                value={filters.severity}
                onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
                className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
              >
                <option value="">Toutes priorités</option>
                <option value="CRITICAL">Critique</option>
                <option value="HIGH">Haute</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="LOW">Basse</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-400 font-semibold mb-1">Recherche (Réf / Site)</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ex: SEC-2026-..., INT-..., ou nom du site..."
                  value={filters.searchQuery}
                  onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                  className="w-full py-2 pl-9 pr-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includePhotos}
                onChange={(e) => setFilters({ ...filters, includePhotos: e.target.checked })}
                className="w-4 h-4 rounded text-cyan-500 bg-slate-950 border-slate-700"
              />
              <span>Inclure les photos justificatives dans le dossier ZIP (/photos/)</span>
            </label>

            <button
              onClick={fetchPreview}
              className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-md transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Appliquer les filtres</span>
            </button>
          </div>
        </div>

        {/* PRÉVISUALISATION ET MÉTRIQUES (Section 7) */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                Interventions Sélectionnées
              </span>
              <span className="text-3xl font-black text-cyan-400 font-mono block">
                {summary.total_count}
              </span>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                Période active
              </span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                Sites Couverts
              </span>
              <span className="text-3xl font-black text-blue-400 font-mono block">
                {summary.sites_count}
              </span>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                Sites protégés distincts
              </span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                SLA Conformes
              </span>
              <span className="text-3xl font-black text-emerald-400 font-mono block">
                {summary.sla_respected_count}
              </span>
              <span className="text-[11px] text-emerald-500/80 font-mono mt-1 block">
                Temps d'arrivée &lt; 10 min
              </span>
            </div>

            <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm">
              <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                SLA Dépassés
              </span>
              <span className="text-3xl font-black text-rose-400 font-mono block">
                {summary.sla_breached_count}
              </span>
              <span className="text-[11px] text-rose-400/80 font-mono mt-1 block">
                Retards d'intervention
              </span>
            </div>
          </div>
        )}

        {/* LISTE DES INTERVENTIONS ET BOUTON D'EXPORT */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span>Rapports prêts à l'export ({summary?.total_count || 0})</span>
              </h2>
              <p className="text-xs text-slate-400">
                L'archive générée contiendra le <strong>manifest.csv</strong> complet et les fichiers PDF individuels.
              </p>
            </div>

            <button
              onClick={handleGenerateExport}
              disabled={generating || !summary || summary.total_count === 0}
              className={`py-3 px-6 rounded-2xl font-black text-xs flex items-center gap-2.5 shadow-xl transition-all ${
                generating || !summary || summary.total_count === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950 hover:scale-[1.02]'
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Compression de l'archive en cours...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-white" />
                  <span>Générer l'export complet (ZIP + CSV)</span>
                </>
              )}
            </button>
          </div>

          {/* Tableau récapitulatif */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Numéro</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Site Protégé</th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3">Incident</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {summary?.interventions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">{item.number}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {format(new Date(item.date), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-200">{item.site_name}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{item.client_name}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                        {item.incident_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.sla_status === 'COMPLETED' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {item.sla_status}
                      </span>
                    </td>
                  </tr>
                ))}
                {summary && summary.interventions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      Aucune intervention ne correspond aux critères sélectionnés.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

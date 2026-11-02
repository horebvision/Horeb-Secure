'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import { calculateAlertSla } from '@/lib/sla';
import {
  FileCheck2,
  Search,
  Filter,
  MapPin,
  Clock,
  Download,
  ChevronRight,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  RefreshCw,
  User,
  CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ClientInterventionsPage() {
  const { sites } = useSecuria();
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedSla, setSelectedSla] = useState('ALL');

  const loadInterventions = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/interventions?limit=100');
      if (res.ok) {
        const data = await res.json();
        setInterventions(data.interventions || []);
      }
    } catch (err) {
      console.warn('Erreur chargement interventions client:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterventions();
  }, []);

  // Filtrage selon Section 21
  const filteredInterventions = useMemo(() => {
    return interventions.filter((int) => {
      const alertData = int.alert || {};
      const num = (int.intervention_number || alertData.alert_number || int.id || '').toLowerCase();
      const siteName = (alertData.site?.name || '').toLowerCase();

      // Recherche
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!num.includes(q) && !siteName.includes(q)) {
          return false;
        }
      }

      // Filtre site
      if (selectedSiteId !== 'ALL' && alertData.site_id !== selectedSiteId && alertData.site?.id !== selectedSiteId) {
        return false;
      }

      // Filtre statut
      if (selectedStatus !== 'ALL' && int.status !== selectedStatus) {
        return false;
      }

      // Filtre SLA
      if (selectedSla !== 'ALL') {
        const sla = calculateAlertSla(alertData, int);
        if (selectedSla === 'COMPLIED' && !['COMPLETED', 'NORMAL'].includes(sla.overallStatus)) {
          return false;
        }
        if (selectedSla === 'BREACHED' && !['BREACHED', 'AT_RISK'].includes(sla.overallStatus)) {
          return false;
        }
      }

      return true;
    });
  }, [interventions, searchQuery, selectedSiteId, selectedStatus, selectedSla]);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleClientExport = async () => {
    try {
      setExporting(true);
      setExportMsg(null);
      const res = await authFetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            siteId: selectedSiteId !== 'ALL' ? selectedSiteId : undefined,
            status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
            searchQuery: searchQuery.trim() || undefined,
            includePhotos: true,
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.download_url) {
          window.location.href = data.download_url;
          setExportMsg(`Export téléchargé avec succès (${data.total_items} interventions).`);
        } else {
          setExportMsg('Export généré avec succès.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setExportMsg(err.error || 'Erreur lors de la génération de l’export.');
      }
    } catch (e: any) {
      setExportMsg(e.message || 'Erreur réseau');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-cyan-400" />
            <span>Mes Preuves d'Intervention ({filteredInterventions.length})</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Consultez les dossiers d'intervention certifiés avec chronologie, performance SLA et téléchargez vos attestations PDF.
          </p>
          {exportMsg && (
            <p className="text-xs font-mono text-cyan-400 mt-1">{exportMsg}</p>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={handleClientExport}
            disabled={exporting || filteredInterventions.length === 0}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              exporting || filteredInterventions.length === 0
                ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md'
            }`}
            title="Exporter l'archive ZIP certifiée de vos interventions"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            <span>{exporting ? 'Export...' : 'Exporter (ZIP)'}</span>
          </button>

          <button
            onClick={loadInterventions}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Barre de filtres (Section 21) */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par numéro d'intervention..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Filtre Site */}
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Filtre Statut */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous statuts</option>
            <option value="RESOLVED">Clôturée / Résolue</option>
            <option value="ARRIVED">Sur les lieux</option>
            <option value="EN_ROUTE">En déplacement</option>
          </select>

          {/* Filtre SLA */}
          <select
            value={selectedSla}
            onChange={(e) => setSelectedSla(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les SLA</option>
            <option value="COMPLIED">SLA Respecté</option>
            <option value="BREACHED">SLA Dépassé / À risque</option>
          </select>
        </div>
      </div>

      {/* Tableau / Cartes des interventions */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Chargement de vos interventions en cours...
          </div>
        ) : filteredInterventions.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 italic">
            Aucune intervention trouvée selon vos filtres.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredInterventions.map((int) => {
              const alertData = int.alert || {};
              const siteData = alertData.site || {};
              const agentData = int.agent || {};
              const isResolved = int.status === 'RESOLVED' || alertData.status === 'RESOLVED';
              const sla = calculateAlertSla(alertData, int);

              return (
                <div
                  key={int.id}
                  className="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-slate-850/50 rounded-2xl px-3 transition-colors"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-cyan-400">
                        #{int.intervention_number || alertData.alert_number || `INT-${int.id.slice(0, 8)}`}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {alertData.type || 'INTERVENTION SÉCURITÉ'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isResolved
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {isResolved ? 'VALIDÉE' : int.status}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sla.overallStatus === 'BREACHED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        SLA {sla.overallStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <strong className="text-slate-300">{siteData.name || 'Site Client'}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {int.created_at ? format(new Date(int.created_at), 'dd/MM/yyyy HH:mm', { locale: fr }) : '—'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>Patrouilleur : <strong className="text-slate-200">{agentData.user?.full_name || agentData.badge_number || 'Agent Sécuria'}</strong></span>
                      </span>
                      <span>•</span>
                      <span className="text-[11px] font-mono text-cyan-300">
                        Arrivée : <strong>{sla.steps.TOTAL_ARRIVAL?.formattedElapsed || sla.formattedTotalElapsed}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/client-portal/interventions/${int.id}`}
                      className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <span>Dossier Complet</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>

                    <a
                      href={`/api/interventions/${int.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-colors"
                      title="Télécharger l'attestation numérique officielle"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Télécharger PDF</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

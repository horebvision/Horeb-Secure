'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import {
  Bell,
  Search,
  Filter,
  MapPin,
  Clock,
  ShieldAlert,
  ChevronRight,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ClientAlertsPage() {
  const { sites } = useSecuria();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/alerts?limit=100');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.warn('Erreur chargement alertes client:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  // Filtrage selon Section 20
  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      // Recherche textuelle
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = (a.alert_number || '').toLowerCase();
        const address = (a.address || a.site?.address || '').toLowerCase();
        const type = (a.type || '').toLowerCase();
        if (!num.includes(q) && !address.includes(q) && !type.includes(q)) {
          return false;
        }
      }

      // Filtre site
      if (selectedSiteId !== 'ALL' && a.site_id !== selectedSiteId) {
        return false;
      }

      // Filtre type
      if (selectedType !== 'ALL' && a.type !== selectedType) {
        return false;
      }

      // Filtre statut
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'RESOLVED' && a.status !== 'RESOLVED') return false;
        if (selectedStatus === 'ACTIVE' && a.status === 'RESOLVED') return false;
      }

      // Filtre priorité / criticité
      if (selectedPriority !== 'ALL' && a.priority !== selectedPriority) {
        return false;
      }

      return true;
    });
  }, [alerts, searchQuery, selectedSiteId, selectedType, selectedStatus, selectedPriority]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-400" />
            <span>Mes Alertes de Sécurité ({filteredAlerts.length})</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Historique complet des déclenchements et des interventions de levée de doute sur vos sites.
          </p>
        </div>

        <button
          onClick={loadAlerts}
          className="self-start sm:self-center py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Barre de filtres (Section 20) */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Recherche textuelle */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par numéro (ex: SEC-2026-...) ou lieu..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Filtre Site */}
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous mes sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Filtre Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous types d'incident</option>
            <option value="INTRUSION">Intrusion</option>
            <option value="AGRESSION">Agression</option>
            <option value="INCENDIE">Incendie</option>
            <option value="MEDICAL">Médical</option>
            <option value="URGENCE">Urgence</option>
            <option value="PANIC">Bouton Panique</option>
          </select>

          {/* Filtre Statut */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous statuts</option>
            <option value="ACTIVE">En cours de traitement</option>
            <option value="RESOLVED">Clôturée & Résolue</option>
          </select>

          {/* Filtre Criticité */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Toute criticité</option>
            <option value="CRITICAL">Critique (P1)</option>
            <option value="HIGH">Élevée (P2)</option>
            <option value="MEDIUM">Moyenne (P3)</option>
            <option value="LOW">Faible (P4)</option>
          </select>
        </div>
      </div>

      {/* Liste des alertes */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Chargement de vos alertes...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 italic">
            Aucune alerte correspondant à vos critères de recherche.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredAlerts.map((alert) => {
              const siteName = alert.site?.name || 'Site Client';
              const isResolved = alert.status === 'RESOLVED';
              const interventionId = alert.interventions?.[0]?.id;

              return (
                <div
                  key={alert.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-850/50 rounded-xl px-2 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-cyan-400">
                        {alert.alert_number}
                      </span>
                      <span className="text-xs font-extrabold text-white">
                        {alert.type}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isResolved
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                      }`}>
                        {alert.status}
                      </span>
                      {alert.priority && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          alert.priority === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {alert.priority}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <strong className="text-slate-300">{siteName}</strong> — {alert.address}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {alert.created_at ? format(new Date(alert.created_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr }) : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Lien vers l'intervention si clôturée ou créée */}
                    {interventionId ? (
                      <Link
                        href={`/client-portal/interventions/${interventionId}`}
                        className="py-2 px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Preuve d'intervention</span>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-mono italic">
                        Intervention en cours de régulation
                      </span>
                    )}
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

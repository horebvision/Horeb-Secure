'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import {
  ShieldAlert,
  Clock,
  MapPin,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Siren,
  Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { authFetch } from '@/lib/utils/api-client';

export default function ClientAlertsHistoryPage() {
  const { alerts, activeAlert } = useSecuria();
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [serverAlerts, setServerAlerts] = useState<any[]>([]);

  useEffect(() => {
    authFetch('/api/alerts?limit=50')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.alerts) {
          setServerAlerts(data.alerts);
        }
      })
      .catch(() => {});
  }, []);

  const combinedAlerts = React.useMemo(() => {
    if (serverAlerts.length === 0) return alerts;
    const map = new Map<string, any>();
    alerts.forEach((a) => map.set(a.id, a));
    serverAlerts.forEach((a) => map.set(a.id, a));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [serverAlerts, alerts]);

  const filteredAlerts = combinedAlerts.filter((alert) => {
    if (filter === 'ACTIVE') {
      return alert.status !== 'RESOLVED' && alert.status !== 'CANCELLED';
    }
    if (filter === 'RESOLVED') {
      return alert.status === 'RESOLVED' || alert.status === 'CANCELLED';
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EN_ROUTE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
            Agent en route
          </span>
        );
      case 'ARRIVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
            Agent sur place
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
            Agent affecté
          </span>
        );
      case 'SENT':
      case 'CREATED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Alerte transmise
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Intervention terminée
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tableau de bord</span>
        </Link>
        <span className="text-xs font-mono text-slate-400">
          {filteredAlerts.length} alerte(s)
        </span>
      </div>

      {/* En-tête */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Mes Alertes & Interventions</h1>
            <p className="text-xs text-slate-400">
              Historique complet de vos déclenchements et rapports d’incident
            </p>
          </div>
        </div>

        {/* Filtres rapides */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('ALL')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === 'ALL'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Toutes
          </button>
          <button
            onClick={() => setFilter('ACTIVE')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === 'ACTIVE'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            En cours
          </button>
          <button
            onClick={() => setFilter('RESOLVED')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              filter === 'RESOLVED'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Résolues
          </button>
        </div>
      </div>

      {/* Alerte active mise en avant */}
      {activeAlert && filter !== 'RESOLVED' && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-red-950/80 to-slate-900 border-2 border-red-500/60 shadow-xl shadow-red-950/40 animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-xs uppercase">
              <Siren className="w-4 h-4 text-red-400 animate-siren" />
              <span>Intervention Actuelle en Cours</span>
            </div>
            {getStatusBadge(activeAlert.status)}
          </div>
          <p className="text-sm font-bold text-white mb-1">
            Urgence {activeAlert.type} • {activeAlert.alert_number}
          </p>
          <p className="text-xs text-slate-300 mb-3">{activeAlert.location_address}</p>
          <Link
            href={`/alert/${activeAlert.id}`}
            className="w-full py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Ouvrir le suivi en direct</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Liste des alertes */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">Aucune alerte trouvée</div>
            <div className="text-xs text-slate-500">
              {filter === 'ACTIVE'
                ? "Aucune intervention n'est actuellement en cours."
                : 'Votre historique d’intervention est vierge.'}
            </div>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <Link
              key={alert.id}
              href={`/alert/${alert.id}`}
              className="block p-4 rounded-2xl bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all shadow-md group"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-red-400">{alert.alert_number}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {alert.type}
                  </span>
                </div>
                {getStatusBadge(alert.status)}
              </div>

              <div className="flex items-start space-x-2 text-xs text-slate-300 mb-2">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span className="truncate">{alert.location_address}</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                <span>
                  {format(new Date(alert.created_at), 'dd MMM yyyy à HH:mm', { locale: fr })}
                </span>
                <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-semibold">
                  Détails & Chronologie
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

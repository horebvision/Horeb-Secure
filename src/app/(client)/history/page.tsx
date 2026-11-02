'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { ALERT_STATUS_CONFIG, ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import type { AlertType, AlertStatus } from '@/lib/types/securia';
import {
  Clock,
  ArrowLeft,
  Shield,
  MapPin,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { authFetch } from '@/lib/utils/api-client';
import { getReportSummaryText } from '@/lib/interventions/report-parser';

export default function HistoryPage() {
  const { alerts, currentRole, currentUser } = useSecuria();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
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

  const userAlerts =
    currentRole === 'USER'
      ? combinedAlerts.filter((a) => currentUser.id && a.user_id === currentUser.id)
      : combinedAlerts;

  const filteredAlerts = userAlerts.filter((a) => {
    if (filter === 'active') return !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status);
    if (filter === 'resolved') return a.status === 'RESOLVED';
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tableau de bord</span>
        </Link>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Historique des Alertes</h1>
              <p className="text-xs text-slate-400">
                Journal complet des alertes déclenchées et des interventions associées
              </p>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Toutes ({userAlerts.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'active' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              En cours
            </button>
            <button
              onClick={() => setFilter('resolved')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'resolved' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Résolues
            </button>
          </div>
        </div>

        {/* Liste des alertes */}
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            Aucune alerte enregistrée dans cette catégorie.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert) => {
              const typeConfig = ALERT_TYPE_CONFIG[alert.type as AlertType] || ALERT_TYPE_CONFIG.INTRUSION;
              const statusConfig = ALERT_STATUS_CONFIG[alert.status as AlertStatus];

              return (
                <Link
                  key={alert.id}
                  href={`/alert/${alert.id}`}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group transition-all"
                >
                  <div className="flex items-start space-x-3">
                    <div className={`p-2.5 rounded-xl ${typeConfig.bgColor} border ${typeConfig.borderColor} mt-0.5`}>
                      <Shield className={`w-5 h-5 ${typeConfig.textColor}`} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          {alert.alert_number}
                        </span>
                        <h4 className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">
                          {typeConfig.label}
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusConfig.badgeClass}`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <span>{alert.location_address || 'Position GPS'}</span>
                      </div>

                      {alert.resolution_report && (
                        <div className="mt-2 text-[11px] text-emerald-300/90 italic bg-emerald-950/20 p-2 rounded-lg border border-emerald-900/40 flex items-start gap-1.5">
                          <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Rapport : {getReportSummaryText(alert.resolution_report)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center">
                    <span className="text-xs font-mono text-slate-500">
                      {format(new Date(alert.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

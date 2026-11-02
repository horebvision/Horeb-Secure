'use client';

import React, { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { LiveTimeline } from '@/components/client/LiveTimeline';
import { ArrowLeft, PhoneCall, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert } from '@/lib/types/securia';
import { useRealtimeSubscription } from '@/lib/supabase/use-realtime';
import { authFetch } from '@/lib/utils/api-client';

export default function ClientAlertTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const alertId = resolvedParams.id;
  const { getAlertById, organization } = useSecuria();

  const localAlert = getAlertById(alertId);
  const [serverAlert, setServerAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(!localAlert);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Récupérer le dossier de l'alerte depuis le backend
  const fetchAlertDetail = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const res = await authFetch(`/api/alerts/${alertId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.alert) {
          setServerAlert(data.alert);
          setErrorMsg(null);
        }
      } else if (res.status === 404 && !localAlert) {
        setErrorMsg('Cette intervention est introuvable ou a été archivée.');
      } else if (res.status === 403) {
        setErrorMsg('Accès non autorisé à cette intervention.');
      }
    } catch (err: any) {
      if (!localAlert) {
        setErrorMsg('Erreur de connexion au serveur de sécurité.');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [alertId, localAlert]);

  // Architecture Realtime Primary + Polling Fallback
  const { isRealtimeActive } = useRealtimeSubscription({
    channelName: `client_alert_${alertId}`,
    table: 'alerts',
    filter: `id=eq.${alertId}`,
    onRefresh: () => fetchAlertDetail(true),
    pollIntervalFallbackMs: 4000,
    pollIntervalHeartbeatMs: 25000,
  });

  useEffect(() => {
    fetchAlertDetail();
  }, [fetchAlertDetail]);

  const activeAlert = serverAlert || localAlert;

  if (loading && !activeAlert) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-400">Connexion au suivi d'intervention en direct...</p>
      </div>
    );
  }

  if (!activeAlert) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Alerte introuvable</h2>
        <p className="text-xs text-slate-400 mb-6">
          {errorMsg || 'Cette intervention est introuvable ou a été archivée.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => fetchAlertDetail()}
            className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réessayer</span>
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tableau de bord</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Barre de retour & assistance directe */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tableau de bord</span>
        </Link>

        <div className="flex items-center space-x-2">
          {isRefreshing && (
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Direct</span>
            </span>
          )}
          {organization.phone && (
            <a
              href={`tel:${organization.phone}`}
              className="py-1.5 px-3 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-700/50 text-red-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5 text-red-400" />
              <span>Ligne Régulateur 24/7</span>
            </a>
          )}
        </div>
      </div>

      {/* Frise en direct */}
      <LiveTimeline alert={activeAlert} />
    </div>
  );
}

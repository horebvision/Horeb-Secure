'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Radio,
  Clock,
  ChevronRight,
  ListFilter,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
} from 'lucide-react';
import { DutyStatusSelector } from '@/components/agent/DutyStatusSelector';
import { AssignedAlertCard } from '@/components/agent/AssignedAlertCard';
import { ActiveMissionPanel } from '@/components/agent/ActiveMissionPanel';
import { InterventionCard } from '@/components/agent/InterventionCard';
import { soundService } from '@/lib/utils/sound';
import { useRealtimeSubscription } from '@/lib/supabase/use-realtime';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';
import { watchAgentLivePosition, getGpsQuality, getGpsQualityBadge, GpsLocationResult } from '@/lib/utils/gps';
import { getBrowserClient } from '@/lib/supabase/client';
import { OfflineStatusBar } from '@/components/agent/OfflineStatusBar';
import { SyncCenterModal } from '@/components/agent/SyncCenterModal';
import { authFetch } from '@/lib/utils/api-client';

const ALLOWED_ROLES = ['AGENT', 'ADMIN'] as const;

export default function AgentDashboardPage() {
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentData, setAgentData] = useState<any>(null);
  const [isSyncCenterOpen, setIsSyncCenterOpen] = useState(false);

  // Enregistrement PWA Service Worker
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ALL'>('ACTIVE');

  // Chargement des données agent depuis l'API backend
  const loadDashboard = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await authFetch('/api/agent/dashboard');
      if (res.ok) {
        const data = await res.json();
        setAgentData(data.agent);
        setActiveAlert(data.active_alert);
        setInterventions(data.interventions || []);

        // Si une nouvelle alerte non acceptée est détectée, jouer la sonnerie d'urgence renforcée
        if (
          data.active_alert &&
          data.active_alert.status === 'ASSIGNED' &&
          (!data.active_alert.intervention ||
            data.active_alert.intervention.status === 'PENDING')
        ) {
          soundService.playMissionAssignedAlarm();
        }
      }
    } catch (err) {
      console.error('Erreur chargement dashboard agent:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Architecture Realtime Primary + Polling Fallback
  const { isRealtimeActive } = useRealtimeSubscription({
    channelName: 'agent_interventions_stream',
    table: 'interventions',
    onRefresh: () => loadDashboard(true),
    pollIntervalFallbackMs: 4000,
    pollIntervalHeartbeatMs: 25000,
  });

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const [liveGps, setLiveGps] = useState<GpsLocationResult | null>(null);

  // Maintien du service et de l'écran allumé (WakeLock API) pour les agents en patrouille
  useEffect(() => {
    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      if (
        typeof navigator !== 'undefined' &&
        'wakeLock' in navigator &&
        agentData?.duty_status &&
        agentData.duty_status !== 'OFF_DUTY'
      ) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        } catch {}
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        loadDashboard(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [agentData?.duty_status, loadDashboard]);

  // Streaming continu de la position de l'agent vers le SOC en temps réel
  useEffect(() => {
    if (!agentData || agentData.duty_status === 'OFF_DUTY') {
      return;
    }

    const unwatch = watchAgentLivePosition(
      async (loc) => {
        setLiveGps(loc);
        try {
          await authFetch('/api/agent/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy,
              heading: loc.heading,
              speed: loc.speed,
              duty_status: agentData.duty_status,
            }),
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('securia:agent_location_updated', { detail: loc }));
          }
        } catch (e) {
          console.warn('[Agent Dashboard] Note transmission position:', e);
        }
      },
      (err) => {
        console.warn('[Agent Dashboard] Note géolocalisation:', err);
      },
      // Au plus une position toutes les 10 s en mouvement (≥ 15 m), une par minute à l'arrêt
      { minDistanceMeters: 15, minIntervalMs: 10000 }
    );

    return () => {
      unwatch();
    };
  }, [agentData?.id, agentData?.duty_status]);

  // Gestion du changement de statut de garde
  const handleStatusChange = (newStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY') => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('securia_agent_duty_status', newStatus);
      } catch {}
    }
    setAgentData((prev: any) => (prev ? { ...prev, duty_status: newStatus } : prev));
  };

  // Garde placée APRÈS tous les Hooks (règle des Hooks React)
  if (isAuthorized === false) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-slate-400">
          Connexion au réseau de patrouille...
        </span>
      </div>
    );
  }

  // Vérifier si l'alerte active doit afficher le panneau d'acceptation [ACCEPTER]
  const isPendingAcceptance =
    activeAlert &&
    (activeAlert.status === 'ASSIGNED' || activeAlert.status === 'SENT') &&
    (!activeAlert.intervention || activeAlert.intervention.status === 'PENDING');

  return (
    <div className="space-y-5 pb-6">
      {/* 0. Barre de statut réseau et synchronisation hors-ligne */}
      <OfflineStatusBar onOpenSyncCenter={() => setIsSyncCenterOpen(true)} />
      <SyncCenterModal isOpen={isSyncCenterOpen} onClose={() => setIsSyncCenterOpen(false)} />

      {/* 1. Sélecteur de statut de garde de l'agent */}
      {agentData && (
        <DutyStatusSelector
          agentId={agentData.id}
          badgeNumber={agentData.badge_number}
          agentName={agentData.full_name}
          patrolVehicle={agentData.patrol_vehicle}
          currentStatus={agentData.duty_status}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Télémétrie GPS en direct de l'agent */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <div>
            <span className="font-bold text-white block">
              {liveGps ? 'Balise GPS Patrouilleur Connectée au SOC' : 'Recherche de la position satellite...'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {liveGps
                ? `Lat: ${liveGps.latitude.toFixed(5)}, Lng: ${liveGps.longitude.toFixed(5)}`
                : 'Initialisation haute précision'}
            </span>
          </div>
        </div>

        {liveGps ? (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getGpsQualityBadge(getGpsQuality(liveGps.accuracy)).bgClass} ${getGpsQualityBadge(getGpsQuality(liveGps.accuracy)).colorClass} ${getGpsQualityBadge(getGpsQuality(liveGps.accuracy)).borderClass}`}>
            {getGpsQualityBadge(getGpsQuality(liveGps.accuracy)).label} (±{Math.round(liveGps.accuracy)}m)
          </span>
        ) : (
          <span className="text-[10px] text-slate-500 font-mono">GPS Actif</span>
        )}
      </div>

      {/* 2. Écran d'Alerte Assignée ou Mission en cours */}
      {isPendingAcceptance ? (
        /* ALERTE DE SÉCURITÉ REÇUE AVEC BOUTON [ACCEPTER] */
        <AssignedAlertCard
          alert={activeAlert}
          agentId={agentData?.id}
          onAccepted={() => loadDashboard(true)}
          onRefresh={() => loadDashboard(true)}
        />
      ) : activeAlert ? (
        /* MISSION ACCEPTÉE : DÉPART -> ARRIVÉE -> TERMINÉE */
        <ActiveMissionPanel
          alert={activeAlert}
          agentId={agentData?.id}
          agentCoordinates={
            liveGps
              ? { latitude: liveGps.latitude, longitude: liveGps.longitude }
              : null
          }
          onRefresh={() => loadDashboard(true)}
        />
      ) : (
        /* ÉTAT STANDBY / PRÊT À INTERVENIR */
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center shadow-xl space-y-4">
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-ping" />
            <div className="w-20 h-20 rounded-full bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center">
              <Radio className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
          </div>

          <div>
            <h3 className="text-base font-extrabold text-white">En veille opérationnelle</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
              Votre patrouille est géolocalisée et prête à recevoir les alertes prioritaires du centre de sécurité.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Secteur opérationnel : </span>
            <span className="font-bold text-white">Zone Centrale & Périphérie</span>
          </div>
        </div>
      )}

      {/* 3. Section Liste des Interventions */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-extrabold text-white">Journal des Interventions</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDashboard()}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Actualiser"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/agent/history"
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            >
              <span>Voir tout</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Onglets Filtres */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ACTIVE'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            En cours ({activeAlert ? 1 : 0})
          </button>
          <button
            onClick={() => setActiveTab('ALL')}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ALL'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Toutes ({interventions.length})
          </button>
        </div>

        {/* Liste */}
        <div className="space-y-2.5">
          {activeTab === 'ACTIVE' ? (
            activeAlert ? (
              <div className="p-4 rounded-3xl bg-slate-900 border border-cyan-900/60 shadow-md">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-mono font-bold text-cyan-300">
                    {activeAlert.alert_number}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {activeAlert.status}
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium">
                  {activeAlert.location_address || activeAlert.site?.address}
                </p>
                <div className="mt-2 text-right">
                  <Link
                    href={`/agent/interventions/${activeAlert.intervention?.id || activeAlert.id}`}
                    className="text-xs font-bold text-cyan-400 hover:underline"
                  >
                    Ouvrir le dossier complet →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                Aucune intervention en cours assignée à votre patrouille.
              </div>
            )
          ) : interventions.length > 0 ? (
            interventions.map((intItem) => (
              <InterventionCard key={intItem.id} intervention={intItem} />
            ))
          ) : (
            <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
              Aucune intervention enregistrée dans l'historique de votre patrouille.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

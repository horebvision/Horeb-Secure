'use client';

import React, { useState } from 'react';
import {
  Car,
  MapPin,
  Clock,
  Key,
  Navigation,
  Phone,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Radio,
  AlertOctagon,
} from 'lucide-react';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';
import { calculateHaversineDistance, estimateArrivalTime } from '@/lib/geo/geo-engine';
import { AbortMissionModal } from './AbortMissionModal';
import { AgentReportModal } from './AgentReportModal';

interface ActiveMissionPanelProps {
  alert: {
    id: string;
    alert_number: string;
    type: string;
    priority: string;
    status: string;
    created_at: string;
    latitude?: number | null;
    longitude?: number | null;
    location_address?: string | null;
    client_notes?: string | null;
    client?: {
      full_name: string;
      phone: string;
      email?: string;
    } | null;
    site?: {
      name: string;
      address: string;
      city?: string;
      postal_code?: string;
      access_instructions?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    intervention?: {
      id: string;
      status: string;
      en_route_at?: string | null;
      arrived_at?: string | null;
    } | null;
  };
  agentId: string;
  agentCoordinates?: { latitude: number; longitude: number } | null;
  onRefresh: () => void;
}

export function ActiveMissionPanel({
  alert,
  agentId,
  agentCoordinates,
  onRefresh,
}: ActiveMissionPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const typeConfig =
    (ALERT_TYPE_CONFIG as any)[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const destLat = alert.latitude || (alert.site as any)?.latitude || 5.3484;
  const destLon = alert.longitude || (alert.site as any)?.longitude || -4.0305;

  const telemetry = React.useMemo(() => {
    if (!agentCoordinates || !destLat || !destLon) return null;
    const distKm = calculateHaversineDistance(
      { latitude: agentCoordinates.latitude, longitude: agentCoordinates.longitude },
      { latitude: destLat, longitude: destLon }
    );
    const eta = estimateArrivalTime(distKm, true);
    return {
      distKm,
      formattedDistance: eta.formattedDistance,
      durationMinutes: eta.durationMinutes,
      formattedEta: eta.formattedEta,
    };
  }, [agentCoordinates, destLat, destLon]);

  const navUrl = agentCoordinates
    ? `https://www.google.com/maps/dir/?api=1&origin=${agentCoordinates.latitude},${agentCoordinates.longitude}&destination=${destLat},${destLon}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}&travelmode=driving`;

  // Signalement du départ (EN_ROUTE)
  const handleDepart = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    soundService.vibrate([150, 100, 150]);

    try {
      const res = await authFetch('/api/interventions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          agent_id: agentId,
          action: 'DEPART',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du départ');

      soundService.playConfirmation();
      onRefresh();
    } catch (err: any) {
      // Résilience hors connexion : mise en file d'attente Outbox sécurisée
      try {
        const { syncManager } = await import('@/lib/sync/sync-manager');
        await syncManager.enqueue('INTERVENTION_STATUS', alert.id, 'STATUS_CHANGE', {
          target_status: 'EN_ROUTE',
          alert_id: alert.id,
          agent_id: agentId,
          action: 'DEPART',
        });
        soundService.playConfirmation();
        setErrorMsg('Enregistré sur l’appareil — en attente de synchronisation');
      } catch {
        setErrorMsg(err.message || 'Impossible de signaler le départ');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Signalement de l'arrivée (ARRIVED / ON_SITE)
  const handleArrive = async () => {
    setIsProcessing(true);
    setErrorMsg('');
    soundService.vibrate(250);

    try {
      const res = await authFetch('/api/interventions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          agent_id: agentId,
          action: 'ARRIVE',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur signalement arrivée');

      soundService.playConfirmation();
      onRefresh();
    } catch (err: any) {
      // Résilience hors connexion : mise en file d'attente Outbox sécurisée
      try {
        const { syncManager } = await import('@/lib/sync/sync-manager');
        await syncManager.enqueue('INTERVENTION_STATUS', alert.id, 'STATUS_CHANGE', {
          target_status: 'ARRIVED',
          alert_id: alert.id,
          agent_id: agentId,
          action: 'ARRIVE',
        });
        soundService.playConfirmation();
        setErrorMsg('Arrivée enregistrée sur l’appareil — en attente de synchronisation');
      } catch {
        setErrorMsg(err.message || 'Impossible de signaler l’arrivée');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Étapes du cycle de vie
  const steps = [
    { key: 'ASSIGNED', label: 'Affecté', active: true },
    {
      key: 'EN_ROUTE',
      label: 'En route',
      active: ['EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status),
    },
    {
      key: 'ARRIVED',
      label: 'Sur site',
      active: ['ARRIVED', 'RESOLVED'].includes(alert.status),
    },
    { key: 'RESOLVED', label: 'Terminé', active: alert.status === 'RESOLVED' },
  ];

  return (
    <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-5 text-white space-y-5">
      {/* En-tête Ordre de Mission Actif */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-black tracking-wider uppercase text-cyan-400">
            INTERVENTION EN COURS
          </h3>
        </div>
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
          {alert.alert_number}
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Stepper Visuel de Progression */}
      <div className="grid grid-cols-4 gap-1 p-2 rounded-2xl bg-slate-950 border border-slate-800">
        {steps.map((st, idx) => (
          <div key={st.key} className="flex flex-col items-center text-center">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 transition-all ${
                st.active
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-950'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {idx + 1}
            </div>
            <span
              className={`text-[10px] font-bold truncate max-w-full ${
                st.active ? 'text-white' : 'text-slate-500'
              }`}
            >
              {st.label}
            </span>
          </div>
        ))}
      </div>

      {/* Résumé de l'Incident */}
      <div className="flex items-start gap-3">
        <div className={`p-3 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor}`}>
          <Car className={`w-6 h-6 ${typeConfig.textColor}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-base font-extrabold text-white">{typeConfig.label}</h4>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-600 text-white">
              {alert.priority}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{typeConfig.description}</p>
        </div>
      </div>

      {/* Détails du Site & Digicode */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-400 block font-semibold">Lieu d'intervention :</span>
              <span className="text-sm font-bold text-white block">
                {alert.location_address || alert.site?.address || 'Position GPS reçue'}
              </span>
              {alert.site?.name && (
                <span className="text-xs text-slate-400 block">
                  {alert.site.name} {alert.site?.city ? `(${alert.site.city})` : ''}
                </span>
              )}
            </div>
          </div>

          <a
            href={navUrl}
            target="_blank"
            rel="noreferrer"
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black flex items-center gap-1.5 shrink-0 shadow-lg shadow-cyan-950/60 transition-all active:scale-95"
          >
            <Navigation className="w-3.5 h-3.5 text-white" />
            <span>Itinéraire GPS</span>
          </a>
        </div>

        {/* Barre de Télémétrie Temps Réel (Distance directe & ETA) */}
        {telemetry && (
          <div className="p-2.5 px-3 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-slate-300">
                Distance : <strong className="text-white font-extrabold">{telemetry.formattedDistance}</strong>
              </span>
            </div>
            <span className="font-mono text-[11px] font-black text-cyan-300 bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-700/50">
              ⏱️ ETA {telemetry.formattedEta}
            </span>
          </div>
        )}

        {/* Consignes sécurisées / Digicode */}
        {alert.site?.access_instructions && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-900/60 flex items-start gap-2.5">
            <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-extrabold text-amber-300 block">
                CONSIGNES D'ACCÈS & DIGICODE :
              </span>
              <span className="text-slate-100 block font-semibold mt-0.5">
                {alert.site.access_instructions}
              </span>
            </div>
          </div>
        )}

        {/* Coordonnées Client */}
        {alert.client && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="text-xs">
              <span className="text-slate-400 block text-[11px]">Résident :</span>
              <span className="font-bold text-white">{alert.client.full_name}</span>
            </div>
            {alert.client.phone && (
              <a
                href={`tel:${alert.client.phone}`}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Appeler {alert.client.phone}</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* BOUTONS D'ACTION DU CYCLE DE VIE */}
      <div className="space-y-3 pt-1">
        {/* Étape 1 : Affecté mais pas encore en route -> Départ */}
        {alert.status === 'ASSIGNED' && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleDepart}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-cyan-950 active:scale-[0.98] transition-all"
          >
            <Car className="w-5 h-5 text-white" />
            <span>{isProcessing ? 'Enregistrement...' : 'SIGNALER LE DÉPART (EN ROUTE)'}</span>
          </button>
        )}

        {/* Étape 2 : En route -> Arrivée sur site */}
        {alert.status === 'EN_ROUTE' && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleArrive}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-orange-950 active:scale-[0.98] transition-all"
          >
            <MapPin className="w-5 h-5 text-white" />
            <span>{isProcessing ? 'Enregistrement...' : 'SIGNALER MON ARRIVÉE SUR PLACE'}</span>
          </button>
        )}

        {/* Étape 3 : Sur site -> Clôture avec compte-rendu */}
        {alert.status === 'ARRIVED' && (
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-green-950 active:scale-[0.98] transition-all"
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
            <span>INTERVENTION TERMINÉE (RÉDIGER RAPPORT)</span>
          </button>
        )}

        {/* Action Secondaire d'urgence : Impossibilité d'intervenir */}
        {['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(alert.status) && (
          <button
            type="button"
            onClick={() => setShowAbortModal(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-rose-900/60 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <AlertOctagon className="w-4 h-4 text-rose-400" />
            <span>IMPOSSIBILITÉ D'INTERVENIR / DEMANDE DE RELÈVE</span>
          </button>
        )}
      </div>

      {/* Raccourcis Radio & Appels d'Urgence */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
        <a
          href="tel:17"
          className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5 text-blue-400" />
          <span>Police 17</span>
        </a>
        <a
          href="tel:18"
          className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5 text-red-400" />
          <span>Pompiers 18</span>
        </a>
      </div>

      {/* Modales */}
      <AbortMissionModal
        isOpen={showAbortModal}
        alertId={alert.id}
        alertNumber={alert.alert_number}
        agentId={agentId}
        onClose={() => setShowAbortModal(false)}
        onSuccess={onRefresh}
      />

      <AgentReportModal
        isOpen={showReportModal}
        alertId={alert.id}
        alertNumber={alert.alert_number}
        interventionId={alert.intervention?.id || ''}
        agentId={agentId}
        onClose={() => setShowReportModal(false)}
        onSuccess={onRefresh}
      />
    </div>
  );
}

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
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';
import { AbortMissionModal } from './AbortMissionModal';

interface AssignedAlertCardProps {
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
    } | null;
    intervention?: {
      id: string;
      status: string;
    } | null;
  };
  agentId: string;
  onAccepted: () => void;
  onRefresh: () => void;
}

export function AssignedAlertCard({
  alert,
  agentId,
  onAccepted,
  onRefresh,
}: AssignedAlertCardProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sonnerie puissante d'urgence dès que la mission s'affiche à l'écran de l'agent
  React.useEffect(() => {
    soundService.playMissionAssignedAlarm();
  }, [alert.id]);

  const typeConfig =
    (ALERT_TYPE_CONFIG as any)[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const handleAccept = async () => {
    setIsAccepting(true);
    setErrorMsg('');
    soundService.vibrate([150, 100, 150]);

    try {
      const res = await authFetch('/api/interventions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          agent_id: agentId,
          action: 'ACCEPT',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l’acceptation');
      }

      soundService.playConfirmation();
      onAccepted();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible d’accepter la mission');
    } finally {
      setIsAccepting(false);
    }
  };

  const formattedTime = new Date(alert.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900 border-2 border-red-500 shadow-2xl shadow-red-950/60 p-5 text-white space-y-4 animate-in fade-in zoom-in-95 duration-300">
      {/* Bandeau clignotant haute visibilité */}
      <div className="flex items-center justify-between pb-3 border-b border-red-500/40">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500" />
          </span>
          <span className="text-xs font-black tracking-wider uppercase text-red-400">
            ALERTE DE SÉCURITÉ ENTRÉE
          </span>
        </div>
        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-red-950 border border-red-800 text-red-300">
          {alert.alert_number}
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {/* Type & Priorité */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor}`}>
            <ShieldAlert className={`w-6 h-6 ${typeConfig.textColor}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white">{typeConfig.label}</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white">
                {alert.priority}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{typeConfig.description}</p>
          </div>
        </div>

        {/* Heure */}
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-red-400" />
            <span className="font-mono font-bold text-white">{formattedTime}</span>
          </div>
          <span className="text-[10px] text-red-400 font-bold uppercase mt-0.5 block">
            Urgence immédiate
          </span>
        </div>
      </div>

      {/* Site & Localisation */}
      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
        <div>
          <span className="text-[11px] text-slate-400 font-semibold block">Site protégé :</span>
          <span className="text-sm font-bold text-white block">
            {alert.site?.name || 'Site résidentiel'}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-200 font-medium block">
                {alert.location_address || alert.site?.address || 'Position GPS reçue'}
              </span>
              {alert.site?.city && (
                <span className="text-[11px] text-slate-400 block">
                  {alert.site.postal_code} {alert.site.city}
                </span>
              )}
            </div>
          </div>

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${alert.latitude || (alert.site as any)?.latitude || 5.3484},${alert.longitude || (alert.site as any)?.longitude || -4.0305}&travelmode=driving`}
            target="_blank"
            rel="noreferrer"
            className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1 shrink-0 transition-colors shadow-sm"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Itinéraire GPS</span>
          </a>
        </div>

        {/* Consignes d'accès et Digicode */}
        {alert.site?.access_instructions && (
          <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-900/60 flex items-start gap-2">
            <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 block">Code d'accès & Digicode :</span>
              <span className="text-slate-200 block font-medium">
                {alert.site.access_instructions}
              </span>
            </div>
          </div>
        )}

        {/* Contact résident */}
        {alert.client && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="text-xs">
              <span className="text-slate-400 block text-[11px]">Client à sécuriser :</span>
              <span className="font-bold text-white">{alert.client.full_name}</span>
            </div>
            {alert.client.phone && (
              <a
                href={`tel:${alert.client.phone}`}
                className="py-1.5 px-3 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 text-xs font-bold flex items-center gap-1"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Appeler</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Boutons d'Action Principaux */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={isAccepting}
          onClick={handleAccept}
          className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-xl shadow-green-950 active:scale-[0.98] transition-all"
        >
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span>{isAccepting ? 'ACCEPTATION EN COURS...' : 'ACCEPTER L’INTERVENTION'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAbortModal(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-rose-900/60 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <AlertOctagon className="w-4 h-4 text-rose-400" />
          <span>IMPOSSIBILITÉ D’INTERVENIR</span>
        </button>
      </div>

      {/* Modal d'impossibilité */}
      <AbortMissionModal
        isOpen={showAbortModal}
        alertId={alert.id}
        alertNumber={alert.alert_number}
        agentId={agentId}
        onClose={() => setShowAbortModal(false)}
        onSuccess={onRefresh}
      />
    </div>
  );
}

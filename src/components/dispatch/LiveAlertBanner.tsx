'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/lib/types/securia';
import { ShieldAlert, Bell, CheckCircle, ArrowRight, X, Volume2, Radio, MapPin, User } from 'lucide-react';
import { soundService } from '@/lib/utils/sound';

interface LiveAlertBannerProps {
  latestAlert: Alert | null;
  onAcknowledge: (alertId: string) => void;
  onDismiss: () => void;
}

export function LiveAlertBanner({ latestAlert, onAcknowledge, onDismiss }: LiveAlertBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (latestAlert && !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(latestAlert.status)) {
      setIsVisible(true);
      // Jouer le carillon d'urgence
      soundService.playEmergencyChime();
      soundService.vibrate([300, 150, 300]);
    } else {
      setIsVisible(false);
    }
  }, [latestAlert]);

  if (!isVisible || !latestAlert) return null;

  const residentName = latestAlert.user?.full_name || 'Client Déclarant';

  return (
    <aside
      aria-label="Alerte de sécurité en cours"
      className="relative z-30 p-4 rounded-3xl bg-gradient-to-r from-red-950 via-red-900 to-red-950 border-2 border-red-500 shadow-2xl shadow-red-950 animate-pulse-slow overflow-hidden"
    >
      {/* Rayonnement lumineux d'urgence */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-red-500/20 blur-2xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Identité de l'incident */}
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="p-3 bg-red-600 rounded-2xl text-white shadow-lg shadow-red-900 animate-bounce-subtle shrink-0">
            <ShieldAlert className="w-7 h-7 animate-pulse" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                🚨 NOUVELLE ALERTE DÉCLENCHÉE
              </span>
              <span className="font-mono text-xs font-black text-red-200">
                {latestAlert.alert_number}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-black/40 text-red-300 border border-red-500/50">
                {latestAlert.priority} • {latestAlert.type}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-bold text-white flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-red-300" />
                <span>{residentName}</span>
              </span>
              <span className="text-red-400">•</span>
              <span className="flex items-center gap-1 text-slate-200">
                <MapPin className="w-3.5 h-3.5 text-red-400" />
                <span>{latestAlert.location_address || 'Position GPS reçue'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Actions directes depuis la bannière d'urgence */}
        <div className="flex items-center space-x-2.5 self-end md:self-center shrink-0">
          {latestAlert.status === 'SENT' || latestAlert.status === 'RECEIVED' || latestAlert.status === 'ESCALATED' ? (
            <button
              onClick={() => onAcknowledge(latestAlert.id)}
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-950 transition-all hover:scale-105 active:scale-95"
            >
              <CheckCircle className="w-4 h-4 text-slate-950" />
              <span>PRENDRE EN CHARGE</span>
            </button>
          ) : null}

          <Link
            href={`/dispatch/alerts/${latestAlert.id}`}
            className="py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-red-950 font-black text-xs flex items-center gap-1.5 shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            <span>VOIR LE DOSSIER</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            onClick={onDismiss}
            aria-label="Fermer la notification visuelle"
            className="p-2 rounded-xl bg-red-900/60 hover:bg-red-800 text-red-300 hover:text-white transition-colors border border-red-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

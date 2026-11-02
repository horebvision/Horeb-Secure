'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/lib/types/securia';
import { useSecuria } from '@/lib/store/securia-context';
import { soundService } from '@/modules/notifications/sound.service';
import { authFetch } from '@/lib/utils/api-client';
import { ShieldAlert, CheckCircle, BellRing, MapPin, Clock, ArrowRight, User } from 'lucide-react';

interface UrgentAlertBannerProps {
  alerts: Alert[];
  onAcknowledge: (alertId: string) => void;
}

export function UrgentAlertBanner({ alerts, onAcknowledge }: UrgentAlertBannerProps) {
  const { currentUser } = useSecuria();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Filtrer les alertes non acquittées (statuts initiaux en attente de prise en charge)
  const unacknowledgedAlerts = alerts.filter(
    (a) => ['SENT', 'OPEN', 'RECEIVED', 'ESCALATED'].includes(a.status)
  );

  const topAlert = unacknowledgedAlerts[0] || null;

  // Déclenchement de la sonnerie répétitive tant qu'il y a des alertes non acquittées
  useEffect(() => {
    if (unacknowledgedAlerts.length > 0) {
      unacknowledgedAlerts.forEach((a) => {
        soundService.startEmergencyAlarmLoop(a.id, (a.priority as any) || 'CRITICAL');
      });
    } else {
      soundService.stopEmergencyAlarmLoop();
    }
  }, [unacknowledgedAlerts.length]);

  if (!topAlert) {
    return null;
  }

  const handleAcknowledge = async (alert: Alert) => {
    setIsProcessing(alert.id);
    try {
      // 1. Appel serveur officiel
      await authFetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          dispatcher_id: currentUser.id,
        }),
      }).catch((e) => console.warn('Acknowledge API note:', e));

      // 2. Arrêt de la sonnerie pour cette alerte
      soundService.stopEmergencyAlarmLoop(alert.id);
      soundService.playConfirmation();

      // 3. Mise à jour de l'état applicatif
      onAcknowledge(alert.id);
    } catch (e) {
      console.error('Erreur acquittement:', e);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="relative overflow-hidden p-5 rounded-3xl bg-gradient-to-r from-red-950 via-rose-950 to-slate-900 border-2 border-red-500 shadow-2xl shadow-red-950/60 animate-in fade-in zoom-in-95 duration-200">
      {/* Halo clignotant d'arrière-plan */}
      <div className="absolute -right-10 -top-10 w-48 h-48 bg-red-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="flex items-start space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-red-600/40 animate-bounce">
            <BellRing className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                🚨 ALERTE CRITIQUE NON ACQUITTÉE
              </span>
              <span className="font-mono text-xs font-black text-red-200 bg-red-950/80 px-2.5 py-0.5 rounded-lg border border-red-500/50">
                {topAlert.alert_number}
              </span>
              {unacknowledgedAlerts.length > 1 && (
                <span className="text-xs font-bold text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-500/40">
                  +{unacknowledgedAlerts.length - 1} autre(s) en attente
                </span>
              )}
            </div>

            <h2 className="text-base font-black text-white">
              Urgence <span className="text-red-400">{topAlert.type}</span> — Priorité {topAlert.priority}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="flex items-center gap-1 text-slate-200 font-semibold">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>{topAlert.user?.full_name || 'Client Sécuria'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-red-400" />
                <span>{topAlert.location_address || 'Coordonnées GPS directes'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>{new Date(topAlert.created_at).toLocaleTimeString('fr-FR')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Boutons d'action prioritaires */}
        <div className="flex items-center space-x-2.5 shrink-0 self-end md:self-center">
          <Link
            href={`/dispatch/alerts/${topAlert.id}`}
            className="py-2.5 px-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <span>Détails</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>

          <button
            onClick={() => handleAcknowledge(topAlert)}
            disabled={isProcessing === topAlert.id}
            type="button"
            className="py-2.5 px-5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-red-950 transition-all cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isProcessing === topAlert.id ? 'Prise en charge...' : 'ACQUITTER & COUPER LA SONNERIE'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

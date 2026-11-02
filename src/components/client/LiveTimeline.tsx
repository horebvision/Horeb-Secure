'use client';

import React from 'react';
import { Alert, AlertStatus } from '@/lib/types/securia';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { useSecuria } from '@/lib/store/securia-context';
import {
  CheckCircle2,
  Clock,
  Car,
  MapPin,
  Shield,
  PhoneCall,
  Radio,
  UserCheck,
  Send,
  Building2,
  Navigation,
  CheckCheck,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getReportSummaryText } from '@/lib/interventions/report-parser';
import { authFetch } from '@/lib/utils/api-client';

interface LiveTimelineProps {
  alert: Alert;
}

interface StepDefinition {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  isReached: (status: AlertStatus) => boolean;
  isCurrent: (status: AlertStatus) => boolean;
  getTimestamp: (alert: Alert) => string | null | undefined;
}

export function LiveTimeline({ alert }: LiveTimelineProps) {
  const { getEventsForAlert, updateAlertStatus, agents } = useSecuria();
  const events = getEventsForAlert(alert.id);
  const typeConfig = ALERT_TYPE_CONFIG[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const assignedAgent = agents.find((ag) => ag.id === alert.assigned_agent_id);

  // 6 étapes réelles exigées par le protocole SECURIA
  const PROTOCOL_STEPS: StepDefinition[] = [
    {
      key: 'SENT',
      label: 'Alerte envoyée',
      description: 'Déclenchement validé depuis le smartphone et transmis au réseau sécurisé',
      icon: <Send className="w-3.5 h-3.5" />,
      isReached: (s) => true,
      isCurrent: (s) => s === 'CREATED' || s === 'SENT',
      getTimestamp: (a) => a.created_at,
    },
    {
      key: 'RECEIVED',
      label: 'Centre informé',
      description: 'Alerte réceptionnée et prise en charge par le régulateur de télésurveillance',
      icon: <Building2 className="w-3.5 h-3.5" />,
      isReached: (s) => !['CREATED', 'SENT'].includes(s),
      isCurrent: (s) => s === 'RECEIVED' || s === 'ACKNOWLEDGED',
      getTimestamp: (a) => events.find((e) => e.to_status === 'RECEIVED' || e.to_status === 'ACKNOWLEDGED')?.created_at || a.created_at,
    },
    {
      key: 'ASSIGNED',
      label: 'Agent affecté',
      description: assignedAgent
        ? `Mission confiée à ${assignedAgent.full_name} (Patrouille opérationnelle)`
        : 'Affectation de la patrouille la plus proche',
      icon: <UserCheck className="w-3.5 h-3.5" />,
      isReached: (s) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(s),
      isCurrent: (s) => s === 'ASSIGNED',
      getTimestamp: (a) => a.assigned_at,
    },
    {
      key: 'EN_ROUTE',
      label: 'Agent en route',
      description: 'Patrouille d’intervention en déplacement prioritaire vers votre adresse',
      icon: <Navigation className="w-3.5 h-3.5" />,
      isReached: (s) => ['EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(s),
      isCurrent: (s) => s === 'EN_ROUTE',
      getTimestamp: (a) => a.en_route_at,
    },
    {
      key: 'ARRIVED',
      label: 'Agent arrivé',
      description: 'Patrouille sur place. Sécurisation immédiate du périmètre et levée de doute',
      icon: <Car className="w-3.5 h-3.5" />,
      isReached: (s) => ['ARRIVED', 'RESOLVED'].includes(s),
      isCurrent: (s) => s === 'ARRIVED',
      getTimestamp: (a) => a.arrived_at,
    },
    {
      key: 'RESOLVED',
      label: 'Intervention terminée',
      description: getReportSummaryText(alert.resolution_report) || 'Lieu sécurisé. Rapport de mission clôturé par l’agent',
      icon: <CheckCheck className="w-3.5 h-3.5" />,
      isReached: (s) => s === 'RESOLVED',
      isCurrent: (s) => s === 'RESOLVED',
      getTimestamp: (a) => a.resolved_at,
    },
  ];

  const handleCancelAlert = async () => {
    if (confirm('Confirmez-vous l’annulation de cette alerte ? Le centre en sera immédiatement notifié.')) {
      updateAlertStatus(alert.id, 'CANCELLED', 'Alerte annulée par le résident (fausse manipulation).');
      try {
        await authFetch(`/api/alerts/${alert.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'CANCELLED',
            comment: 'Alerte annulée par le résident (fausse manipulation).',
          }),
        });
      } catch (e) {
        console.warn('Erreur annulation serveur:', e);
      }
    }
  };

  const isTerminal = ['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(alert.status);

  return (
    <div className="space-y-6">
      {/* En-tête de l'incident en direct */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-2xl ${typeConfig.bgColor} ${typeConfig.borderColor} border`}>
              <Shield className={`w-6 h-6 ${typeConfig.textColor}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black text-white">{typeConfig.label}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-red-600/30 text-red-300 border-red-500/50">
                  {alert.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Intervention : <span className="font-mono text-slate-200">{alert.alert_number}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 block">Heure d’appel</span>
            <span className="text-sm font-mono font-semibold text-white">
              {format(new Date(alert.created_at), 'HH:mm:ss', { locale: fr })}
            </span>
          </div>
        </div>

        {/* Localisation */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-start space-x-3">
          <MapPin className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="text-slate-400 block">Lieu protégé d’intervention :</span>
            <span className="font-semibold text-white block mt-0.5">
              {alert.location_address || 'Position GPS reçue'}
            </span>
            {alert.client_notes && (
              <p className="text-slate-300 mt-1.5 italic bg-slate-900 p-2 rounded-lg border border-slate-800">
                "{alert.client_notes}"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Frise chronologique officielle SECURIA (Les 6 étapes) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Progression de l'Intervention en Temps Réel</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-400">
            Données Réelles
          </span>
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {PROTOCOL_STEPS.map((step, idx) => {
            const reached = step.isReached(alert.status) && alert.status !== 'CANCELLED';
            const current = step.isCurrent(alert.status);
            const timestamp = step.getTimestamp(alert);

            return (
              <div key={step.key} className="relative flex items-start space-x-3.5 group">
                {/* Icône circulaire de l'étape */}
                <div
                  className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    current
                      ? 'bg-red-500 text-white ring-4 ring-red-500/20 animate-pulse'
                      : reached
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-slate-600'
                  }`}
                >
                  {reached && !current ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    step.icon
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-sm font-bold ${
                          current
                            ? 'text-white'
                            : reached
                            ? 'text-slate-200'
                            : 'text-slate-500'
                        }`}
                      >
                        {step.label}
                      </span>
                      {current && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-600/30 text-red-300 border border-red-500/40 animate-pulse">
                          En cours
                        </span>
                      )}
                    </div>

                    {timestamp && reached && (
                      <span className="text-[11px] font-mono text-slate-400">
                        {format(new Date(timestamp), 'HH:mm:ss', { locale: fr })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fiche de l'Agent d'Intervention */}
      {assignedAgent && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-950/40 border border-cyan-800/40 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4" />
              <span>Patrouille d'Intervention Déployée</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-200 border border-cyan-700/50">
              Sur le terrain
            </span>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-900/50 border border-cyan-600/50 flex items-center justify-center font-bold text-white text-base">
                {assignedAgent.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{assignedAgent.full_name}</h4>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Car className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Véhicule d'intervention rapide</span>
                </p>
              </div>
            </div>

            <a
              href={`tel:${assignedAgent.phone}`}
              className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Contacter</span>
            </a>
          </div>
        </div>
      )}

      {/* Journal d'audit officiel */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>Journal des Événements Authentifié</span>
        </h3>

        <div className="space-y-2.5">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-start justify-between text-xs"
            >
              <div>
                <span className="font-semibold text-slate-200 block">{ev.comment}</span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Transition : {ev.event_type}
                </span>
              </div>
              <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-3">
                {format(new Date(ev.created_at), 'HH:mm:ss', { locale: fr })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bouton d'annulation si non terminée */}
      {!isTerminal && (
        <div className="pt-2 text-center">
          <button
            onClick={handleCancelAlert}
            className="text-xs text-slate-400 hover:text-red-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            Annuler cette alerte (fausse alarme)
          </button>
        </div>
      )}
    </div>
  );
}

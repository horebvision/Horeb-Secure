'use client';

import React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  calculateAlertSla,
  SlaStatus,
  formatDurationSeconds,
} from '@/lib/sla';
import { SlaStatusBadge } from './SlaStatusBadge';
import {
  Bell,
  Radio,
  CheckCircle,
  UserCheck,
  CheckCheck,
  Car,
  MapPin,
  ShieldCheck,
  Clock,
} from 'lucide-react';

import { ProofOfInterventionCard } from './ProofOfInterventionCard';

interface InterventionTimelineProps {
  alert: {
    id: string;
    alert_number?: string;
    status: string;
    created_at: string;
    acknowledged_at?: string | null;
    assigned_at?: string | null;
    en_route_at?: string | null;
    arrived_at?: string | null;
    resolved_at?: string | null;
  };
  intervention?: {
    id?: string;
    status?: string;
    assigned_at?: string | null;
    accepted_at?: string | null;
    en_route_at?: string | null;
    arrived_at?: string | null;
    resolved_at?: string | null;
  } | null;
  className?: string;
}

export function InterventionTimeline({
  alert,
  intervention,
  className = '',
}: InterventionTimelineProps) {
  const slaSummary = calculateAlertSla(alert, intervention);

  // Chronologie des 7 jalons opérationnels
  const timelineSteps = [
    {
      key: 'CREATED',
      title: 'Alerte Déclenchée',
      timestamp: alert.created_at,
      icon: Bell,
      color: 'text-rose-400 bg-rose-950/80 border-rose-600',
      description: 'Déclenchement panique ou télésurveillance',
      isCompleted: true,
      slaResult: null,
    },
    {
      key: 'ACK',
      title: 'Prise en charge SOC (ACK)',
      timestamp: alert.acknowledged_at || (['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) ? alert.created_at : null),
      icon: CheckCircle,
      color: 'text-amber-400 bg-amber-950/80 border-amber-600',
      description: 'Accusé de réception par le régulateur',
      isCompleted: Boolean(alert.acknowledged_at || ['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status)),
      slaResult: slaSummary.steps.ACKNOWLEDGEMENT,
    },
    {
      key: 'ASSIGN',
      title: 'Patrouille Assignée',
      timestamp: intervention?.assigned_at || alert.assigned_at,
      icon: UserCheck,
      color: 'text-cyan-400 bg-cyan-950/80 border-cyan-600',
      description: 'Agent désigné via Smart Dispatch ou manuel',
      isCompleted: Boolean(intervention?.assigned_at || alert.assigned_at || ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status)),
      slaResult: slaSummary.steps.ASSIGNMENT,
    },
    {
      key: 'ACCEPT',
      title: 'Ordre de Mission Accepté',
      timestamp: intervention?.accepted_at,
      icon: CheckCheck,
      color: 'text-blue-400 bg-blue-950/80 border-blue-600',
      description: 'Prise en compte sur le smartphone de l’agent',
      isCompleted: Boolean(intervention?.accepted_at || ['EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status)),
      slaResult: slaSummary.steps.ACCEPTANCE,
    },
    {
      key: 'EN_ROUTE',
      title: 'Départ en Route',
      timestamp: intervention?.en_route_at || alert.en_route_at,
      icon: Car,
      color: 'text-indigo-400 bg-indigo-950/80 border-indigo-600',
      description: 'Déplacement prioritaire vers le site protégé',
      isCompleted: Boolean(intervention?.en_route_at || alert.en_route_at || ['EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status)),
      slaResult: slaSummary.steps.DEPARTURE,
    },
    {
      key: 'ARRIVED',
      title: 'Arrivée sur Site (ON_SITE)',
      timestamp: intervention?.arrived_at || alert.arrived_at,
      icon: MapPin,
      color: 'text-purple-400 bg-purple-950/80 border-purple-600',
      description: 'Patrouilleur présent physiquement sur les lieux',
      isCompleted: Boolean(intervention?.arrived_at || alert.arrived_at || ['ARRIVED', 'RESOLVED'].includes(alert.status)),
      slaResult: slaSummary.steps.ARRIVAL,
    },
    {
      key: 'RESOLVED',
      title: 'Mission Clôturée',
      timestamp: alert.resolved_at || intervention?.resolved_at,
      icon: ShieldCheck,
      color: 'text-emerald-400 bg-emerald-950/80 border-emerald-600',
      description: 'Levée de doute effectuée et rapport transmis',
      isCompleted: alert.status === 'RESOLVED',
      slaResult: slaSummary.steps.RESOLUTION,
    },
  ];

  return (
    <div className={`p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h4 className="text-xs font-black uppercase tracking-wider text-white">
            Chronologie de l'Intervention & SLA (Temps Réel)
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">
            Durée totale : <strong className="text-white">{slaSummary.formattedTotalElapsed}</strong>
          </span>
          <SlaStatusBadge status={slaSummary.overallStatus} />
        </div>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
        {timelineSteps.map((step, idx) => {
          const Icon = step.icon;
          const isCurrentActive = step.slaResult?.isActive;

          return (
            <div key={step.key} className="relative flex items-start justify-between gap-4">
              {/* Point de jalon */}
              <div
                className={`absolute -left-6 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  step.isCompleted
                    ? `${step.color} shadow-md`
                    : isCurrentActive
                    ? 'bg-amber-950 border-amber-400 text-amber-300 animate-pulse'
                    : 'bg-slate-900 border-slate-700 text-slate-600'
                }`}
              >
                <Icon className="w-3 h-3" />
              </div>

              {/* Contenu de l'étape */}
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-bold ${
                      step.isCompleted
                        ? 'text-white'
                        : isCurrentActive
                        ? 'text-amber-300 font-extrabold'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.title}
                  </span>

                  {step.slaResult && (
                    <SlaStatusBadge
                      status={step.slaResult.status}
                      label={
                        step.slaResult.isCompleted
                          ? `${formatDurationSeconds(step.slaResult.elapsedSeconds)}`
                          : step.slaResult.status === 'BREACHED'
                          ? `DÉPASSÉ (+${formatDurationSeconds(Math.abs(step.slaResult.remainingSeconds))})`
                          : `Reste ${step.slaResult.formattedRemaining}`
                      }
                      showIcon={false}
                      className="text-[10px] py-0 px-2"
                    />
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {step.description}
                </p>
              </div>

              {/* Horodatage exact certifié */}
              <div className="text-right shrink-0">
                {step.timestamp ? (
                  <div className="font-mono text-xs font-bold text-slate-300">
                    {format(new Date(step.timestamp), 'HH:mm:ss', { locale: fr })}
                    <span className="block text-[10px] text-slate-500 font-normal">
                      {format(new Date(step.timestamp), 'dd/MM/yyyy')}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-slate-600 uppercase">
                    {isCurrentActive ? 'En cours...' : 'En attente'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Proof of Intervention & Rapport de mission (Phase 3) */}
      {(alert.status === 'RESOLVED' || alert.status === 'ARRIVED' || intervention?.id) && (
        <div className="pt-4 border-t border-slate-800">
          <ProofOfInterventionCard
            interventionId={intervention?.id}
            alertId={alert.id}
          />
        </div>
      )}
    </div>
  );
}

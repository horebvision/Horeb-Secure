'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Alert } from '@/lib/types/securia';
import { ALERT_STATUS_CONFIG, ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import { calculateAlertSla } from '@/lib/sla';
import { SlaStatusBadge } from './SlaStatusBadge';
import { getReportSummaryText } from '@/lib/interventions/report-parser';
import { SlaLiveTimer } from './SlaLiveTimer';
import {
  MapPin,
  Clock,
  User,
  Shield,
  UserCheck,
  ChevronRight,
  Flame,
  Radio,
  CheckCircle,
  PhoneCall,
  Map,
  Eye,
  Building,
  Car,
  AlertTriangle,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AlertFeedCardProps {
  alert: Alert;
  onOpenAssignModal: (alert: Alert) => void;
  onOpenCallModal: (alert: Alert) => void;
  onFocusMap: (alert: Alert) => void;
}

export function AlertFeedCard({
  alert,
  onOpenAssignModal,
  onOpenCallModal,
  onFocusMap,
}: AlertFeedCardProps) {
  const { updateAlertStatus, agents, sites, currentUser } = useSecuria();

  const typeConfig = ALERT_TYPE_CONFIG[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;
  const statusConfig = ALERT_STATUS_CONFIG[alert.status];

  // Résolution de l'agent affecté
  const assignedAgent = agents.find((ag) => ag.id === alert.assigned_agent_id);

  // Résolution du client déclarant
  const clientName = alert.user?.full_name || 'Client Abonné';
  const clientPhone = alert.user?.phone || 'Coordonnées sécurisées';

  // Résolution du site protégé
  const site = sites.find((s) => s.id === alert.site_id);
  const siteName = site?.name || alert.site?.name || 'Site Protégé';
  const siteAddress = alert.location_address || site?.address || 'Position GPS mobile reçue';

  const isPendingAck = alert.status === 'SENT' || alert.status === 'RECEIVED' || alert.status === 'ESCALATED';
  const isAwaitingAgent = alert.status === 'ACKNOWLEDGED' || !alert.assigned_agent_id;
  const isCritical = alert.priority === 'CRITICAL';
  const isResolved = ['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(alert.status);

  // Calcul déterministe du SLA basé sur les timestamps réels
  const slaSummary = useMemo(() => calculateAlertSla(alert), [alert]);

  const handleAcknowledge = () => {
    updateAlertStatus(alert.id, 'ACKNOWLEDGED', 'Alerte prise en charge par le régulateur.');
    if (typeof window !== 'undefined') {
      authFetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alert.id,
          dispatcher_id: currentUser.id,
        }),
      }).catch((err) => console.warn('Acknowledge API sync error:', err));
    }
  };

  return (
    <div
      className={`p-5 rounded-3xl border transition-all duration-200 ${
        isCritical && !isResolved
          ? 'bg-red-950/20 border-red-500/60 shadow-xl shadow-red-950/40 hover:border-red-400'
          : alert.status === 'ESCALATED'
          ? 'bg-orange-950/20 border-orange-500/60 shadow-xl shadow-orange-950/40'
          : isResolved
          ? 'bg-slate-900/60 border-slate-800/80 opacity-80'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-lg'
      }`}
    >
      {/* 1. Ligne Supérieure : Numéro, Statut, SLA, Heure */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              isResolved
                ? 'bg-emerald-500'
                : isCritical
                ? 'bg-red-500 animate-ping'
                : 'bg-amber-500'
            }`}
          />
          <span className="font-mono text-sm font-black text-white tracking-wide">
            {alert.alert_number}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusConfig.badgeClass}`}>
            {statusConfig.label}
          </span>
          <SlaStatusBadge status={slaSummary.overallStatus} />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isResolved ? (
            <SlaLiveTimer slaSummary={slaSummary} compact />
          ) : (
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
              Résolu en {slaSummary.formattedTotalElapsed}
            </span>
          )}

          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{format(new Date(alert.created_at), 'HH:mm:ss', { locale: fr })}</span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] text-slate-400">
              {format(new Date(alert.created_at), 'dd/MM/yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Type d'urgence & Priorité */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className={`p-2 rounded-xl ${typeConfig.bgColor} border ${typeConfig.borderColor}`}>
            <Shield className={`w-5 h-5 ${typeConfig.textColor}`} />
          </div>
          <div>
            <h4 className="text-base font-extrabold text-white">{typeConfig.label}</h4>
            <span className="text-[11px] text-slate-400">{typeConfig.description}</span>
          </div>
        </div>

        <span
          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${
            isCritical
              ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-900/50'
              : 'bg-amber-600/30 text-amber-300 border-amber-500/40'
          }`}
        >
          PRIORITÉ {alert.priority}
        </span>
      </div>

      {/* 3. Données Clés : Client, Site Protégé, Localisation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 text-xs mb-3.5">
        {/* Client */}
        <div className="flex items-start space-x-2">
          <User className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Client Abonné</span>
            <span className="font-bold text-white block">{clientName}</span>
            <span className="text-[11px] text-slate-400 font-mono">{clientPhone}</span>
          </div>
        </div>

        {/* Site Protégé */}
        <div className="flex items-start space-x-2">
          <Building className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Site Protégé</span>
            <span className="font-bold text-white block">{siteName}</span>
            <span className="text-[11px] text-slate-400 line-clamp-1">{siteAddress}</span>
          </div>
        </div>
      </div>

      {/* Note client ou consigne si existante */}
      {alert.client_notes && (
        <div className="text-xs text-amber-200/90 italic bg-amber-950/30 p-2.5 rounded-xl border border-amber-900/50 mb-3.5">
          <span className="font-bold not-italic text-amber-400 block mb-0.5">Précision du déclarant :</span>
          "{alert.client_notes}"
        </div>
      )}

      {/* 4. Agent Affecté */}
      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/90 mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center font-bold text-cyan-300 text-xs">
            <Car className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Patrouille Dédiée</span>
            {assignedAgent ? (
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-xs">
                  {assignedAgent.full_name || (assignedAgent as any).user?.full_name || (assignedAgent as any).agent_name || 'Agent'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">({assignedAgent.badge_number || 'AGT-7501'})</span>
              </div>
            ) : (
              <span className="text-amber-400 font-bold text-xs italic">
                En attente d'affectation
              </span>
            )}
          </div>
        </div>

        {assignedAgent ? (
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
            {alert.status === 'EN_ROUTE' ? 'En Route' : alert.status === 'ARRIVED' ? 'Sur Site' : alert.status === 'RESOLVED' ? 'Mission Clôturée' : 'Affecté'}
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
            Non Affecté
          </span>
        )}
      </div>

      {/* RAPPORT DE FIN DE MISSION DE L'AGENT (Si disponible ou résolue) */}
      {(alert.resolution_report || isResolved) && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>RAPPORT DE FIN DE MISSION TRANS-DISPATCH</span>
            </span>
            {alert.resolved_at && (
              <span className="font-mono text-emerald-300/80 text-[10px]">
                {format(new Date(alert.resolved_at), 'dd/MM à HH:mm')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 italic font-sans leading-relaxed line-clamp-3">
            &ldquo;{getReportSummaryText(alert.resolution_report)}&rdquo;
          </p>
        </div>
      )}

      {/* 5. LES 5 ACTIONS DU DISPATCHER : [VOIR], [PRENDRE EN CHARGE], [AFFECTER UN AGENT], [APPELER], [VOIR LA CARTE] */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800">
        {/* ACTION 1: PRENDRE EN CHARGE */}
        {isPendingAck && (
          <button
            onClick={handleAcknowledge}
            className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
            title="Prendre en charge l'alerte au centre de télésurveillance"
          >
            <CheckCircle className="w-4 h-4" />
            <span>PRENDRE EN CHARGE</span>
          </button>
        )}

        {/* ACTION 2: AFFECTER UN AGENT (SMART DISPATCH) */}
        {!isResolved && (
          <button
            onClick={() => onOpenAssignModal(alert)}
            className="flex-1 min-w-[140px] py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 border border-cyan-400/30"
            title="Sélectionner et dépêcher un agent avec le moteur intelligent Smart Dispatch"
          >
            <UserCheck className="w-4 h-4 text-cyan-200" />
            <span>{assignedAgent ? 'RÉAFFECTER' : 'AFFECTER (SMART)'}</span>
          </button>
        )}

        {/* ACTION 3: APPELER */}
        <button
          onClick={() => onOpenCallModal(alert)}
          className="py-2.5 px-3 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
          title="Liaison téléphonique directe avec le client ou les secours"
        >
          <PhoneCall className="w-4 h-4 text-emerald-400" />
          <span>APPELER</span>
        </button>

        {/* ACTION 4: VOIR LA CARTE */}
        <button
          onClick={() => onFocusMap(alert)}
          className="py-2.5 px-3 rounded-xl bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/80 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
          title="Centrer la cartographie sur cet incident"
        >
          <Map className="w-4 h-4 text-sky-400" />
          <span>VOIR CARTE</span>
        </button>

        {/* ACTION 5: VOIR (Page de détail complète) */}
        <Link
          href={`/dispatch/alerts/${alert.id}`}
          className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1 transition-all border border-slate-700 active:scale-95"
          title="Ouvrir le dossier complet et la chronologie de l'incident"
        >
          <Eye className="w-4 h-4 text-slate-300" />
          <span>VOIR</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>
    </div>
  );
}

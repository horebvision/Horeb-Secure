'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { ALERT_STATUS_CONFIG, ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { AssignAgentModal } from '@/components/dispatch/AssignAgentModal';
import { QuickCallModal } from '@/components/dispatch/QuickCallModal';
import { AlertStatus, AlertType } from '@/lib/types/securia';
import { useRealtimeSubscription } from '@/lib/supabase/use-realtime';
import { authFetch } from '@/lib/utils/api-client';
import {
  ArrowLeft,
  Shield,
  MapPin,
  Clock,
  User,
  PhoneCall,
  Key,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  FileText,
  Radio,
  Car,
  Map,
  ShieldAlert,
  ClipboardList,
  Flame,
  CheckCircle2,
  AlertOctagon,
  Lock,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ProofOfInterventionCard } from '@/components/dispatch/ProofOfInterventionCard';
import { AgentReportViewer } from '@/components/dispatch/AgentReportViewer';

export default function DispatchAlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const alertId = resolvedParams.id;
  const { getAlertById, getEventsForAlert, updateAlertStatus, agents, currentUser, sites } = useSecuria();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [reportInput, setReportInput] = useState('');
  const [showReportForm, setShowReportForm] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'EVENTS' | 'AUDIT'>('EVENTS');
  const [serverAlert, setServerAlert] = useState<any>(null);
  const [serverEvents, setServerEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMutatingStatus, setIsMutatingStatus] = useState(false);
  const [statusMutationError, setStatusMutationError] = useState<string | null>(null);

  const localAlert = getAlertById(alertId);

  // Chargement du dossier complet depuis l'API backend
  const loadAlertData = React.useCallback(async () => {
    try {
      const res = await authFetch(`/api/alerts/${alertId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.alert) {
          setServerAlert(data.alert);
          if (data.events) setServerEvents(data.events);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement alerte dispatch:', err);
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  // Architecture Realtime Primary + Polling Fallback
  const { isRealtimeActive } = useRealtimeSubscription({
    channelName: `dispatch_alert_${alertId}`,
    table: 'alerts',
    filter: `id=eq.${alertId}`,
    onRefresh: () => loadAlertData(),
    pollIntervalFallbackMs: 4000,
    pollIntervalHeartbeatMs: 25000,
  });

  useEffect(() => {
    loadAlertData();
  }, [loadAlertData]);

  const alert = serverAlert || localAlert;
  const events = serverEvents.length > 0 ? serverEvents : alert ? getEventsForAlert(alert.id) : [];

  // Chargement des logs d'audit depuis l'API
  useEffect(() => {
    if (alert?.id) {
      authFetch(`/api/audit-logs?entity_id=${alert.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.logs) {
            setAuditLogs(data.logs);
          }
        })
        .catch((err) => console.warn('Audit logs fetch error:', err));
    }
  }, [alert?.id]);

  if (!alert) {
    if (loading) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Chargement du dossier d'incident en direct...</p>
        </div>
      );
    }
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-red-500 mx-auto opacity-70" />
        <h2 className="text-xl font-bold text-white">Alerte introuvable</h2>
        <p className="text-xs text-slate-400">Ce dossier d'incident n'existe pas ou a été archivé.</p>
        <Link
          href="/dispatch"
          className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à la salle de contrôle</span>
        </Link>
      </div>
    );
  }

  const typeConfig = ALERT_TYPE_CONFIG[alert.type as AlertType] || ALERT_TYPE_CONFIG.INTRUSION;
  const statusConfig = ALERT_STATUS_CONFIG[alert.status as AlertStatus];
  const assignedAgent = agents.find((ag) => ag.id === alert.assigned_agent_id);
  const site = sites.find((s) => s.id === alert.site_id);

  const clientName = alert.user?.full_name || 'Client Abonné';
  const clientPhone = alert.user?.phone || 'Coordonnées sécurisées';

  const handleStatusChange = async (newStatus: AlertStatus, comment?: string, report?: string) => {
    setIsMutatingStatus(true);
    setStatusMutationError(null);

    // Optimistic context update
    updateAlertStatus(alert.id, newStatus, comment, report);

    try {
      const res = await authFetch(`/api/alerts/${alert.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          comment: comment || `Mise à jour opérationnelle vers ${newStatus}`,
          report: report || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du statut');
      }

      if (data.alert) {
        setServerAlert(data.alert);
      }
      await loadAlertData();
    } catch (err: any) {
      console.error('[DispatchAlertDetail] Erreur mutation statut:', err);
      setStatusMutationError(err.message || 'Impossible de synchroniser le statut avec le serveur');
    } finally {
      setIsMutatingStatus(false);
    }
  };

  const handleResolveWithReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportInput.trim()) return;

    const reportText = reportInput.trim();
    setShowReportForm(false);
    setReportInput('');

    await handleStatusChange(
      'RESOLVED',
      `Intervention clôturée par ${currentUser.full_name}.`,
      reportText
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Barre supérieure : retour et ID */}
      <div className="flex items-center justify-between">
        <Link
          href="/dispatch"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour au Dashboard de Régulation</span>
        </Link>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-slate-500">DOSSIER :</span>
          <span className="font-extrabold text-white bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            {alert.alert_number}
          </span>
        </div>
      </div>

      {/* En-tête Dossier Opérationnel */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center space-x-4">
          <div className={`p-4 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor} shadow-lg`}>
            <Shield className={`w-8 h-8 ${typeConfig.textColor}`} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-white">{typeConfig.label}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusConfig.badgeClass}`}>
                {statusConfig.label}
              </span>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border ${
                  alert.priority === 'CRITICAL'
                    ? 'bg-red-600 text-white border-red-500'
                    : 'bg-amber-600/30 text-amber-300 border-amber-500/40'
                }`}
              >
                PRIORITÉ {alert.priority}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {typeConfig.description} • Déclenché le{' '}
              <span className="font-mono text-slate-300 font-bold">
                {format(new Date(alert.created_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })}
              </span>
            </p>
          </div>
        </div>

        {/* Boutons d'Action Rapide En-tête */}
        <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center">
          <button
            onClick={() => setIsCallModalOpen(true)}
            className="py-2.5 px-4 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <PhoneCall className="w-4 h-4 text-emerald-400" />
            <span>Appeler Déclarant</span>
          </button>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950 transition-colors"
          >
            <UserCheck className="w-4 h-4" />
            <span>{assignedAgent ? "Réaffecter l'agent" : 'Affecter un agent'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche : Client, Site Protégé & Localisation (1/3) */}
        <div className="space-y-6">
          {/* Fiche Client */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-400" />
              <span>Fiche Client Déclarant</span>
            </h3>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-base font-extrabold text-white block">{clientName}</span>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-400 font-mono">{clientPhone}</span>
                <button
                  onClick={() => setIsCallModalOpen(true)}
                  className="py-1 px-2.5 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-600 hover:text-white transition-colors"
                >
                  <PhoneCall className="w-3 h-3" />
                  <span>Composer</span>
                </button>
              </div>
            </div>
          </div>

          {/* Fiche Site Protégé & Consignes d'Accès */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-red-400" />
              <span>Site Protégé & Consignes d'Accès</span>
            </h3>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-white text-sm">
                  {site?.name || alert.site?.name || 'Résidence Principale'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                  {site?.site_type || 'RÉSIDENCE'}
                </span>
              </div>

              <span className="text-slate-300 block">{alert.location_address}</span>

              {/* Coordonnées GPS certifiées */}
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>GPS : {alert.latitude?.toFixed(4) || '5.3484'}° N, {alert.longitude?.toFixed(4) || '-4.0305'}° W</span>
                <span className="text-emerald-400 font-bold">Fix calibré</span>
              </div>

              {/* Consignes d'accès digicode */}
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-900/60 text-xs mt-2">
                <div className="flex items-center gap-1.5 text-amber-300 font-bold mb-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Consignes d'accès patrouille :</span>
                </div>
                <p className="text-slate-200 italic leading-relaxed">
                  {site?.access_instructions ||
                    'Digicode A412. Portail noir automatique. Clé boîte aux lettres 4.'}
                </p>
              </div>
            </div>
          </div>

          {/* Patrouille Affectée */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Car className="w-4 h-4" />
              <span>Patrouille Affectée</span>
            </h3>

            {assignedAgent ? (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{assignedAgent.full_name}</span>
                  <span className="text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                    {assignedAgent.badge_number || 'AGT-7501'}
                  </span>
                </div>
                <span className="text-slate-400 block font-mono">{assignedAgent.phone}</span>

                <div className="pt-2 flex gap-2">
                  <a
                    href={`tel:${assignedAgent.phone}`}
                    className="flex-1 py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Liaison Radio</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-900/40 text-center space-y-2">
                <span className="text-xs text-amber-400 font-bold block">
                  Aucun agent encore dépêché
                </span>
                <button
                  onClick={() => setIsAssignModalOpen(true)}
                  className="py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs"
                >
                  Affecter maintenant
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Colonne Droite : Contrôles Opérationnels & Événements / Audit (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* RAPPORT DE FIN DE MISSION DE L'AGENT PATROUILLEUR */}
          {(alert.resolution_report || alert.interventions?.[0]?.report || alert.status === 'RESOLVED') && (
            <div className="p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-emerald-950/30 border-2 border-emerald-500/60 shadow-2xl shadow-emerald-950/40 space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-emerald-800/40">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-950 border border-emerald-700 text-emerald-400 shadow-md shadow-emerald-950">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">Rapport Officiel de Fin de Mission</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-emerald-500 text-slate-950 shadow-sm">
                        MISSION CLÔTURÉE
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Transmis par l'agent patrouilleur et certifié en base centrale
                    </p>
                  </div>
                </div>

                {(alert.resolved_at || alert.interventions?.[0]?.resolved_at) && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-800/60 text-xs font-mono text-emerald-300">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>
                      {format(
                        new Date(alert.resolved_at || alert.interventions?.[0]?.resolved_at),
                        'dd/MM/yyyy à HH:mm:ss',
                        { locale: fr }
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Détails de l'agent intervenant */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Agent Intervenant</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      {assignedAgent?.full_name || alert.interventions?.[0]?.security_agents?.users?.full_name || 'Agent Patrouilleur'}
                    </span>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {assignedAgent?.badge_number || alert.interventions?.[0]?.security_agents?.badge_number || 'AGT-SEC'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block font-mono">
                    {assignedAgent?.phone || 'Liaison radio opérationnelle'}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Véhicule d'Intervention</span>
                  <span className="font-bold text-white text-sm block">
                    {assignedAgent?.patrol_vehicle || alert.interventions?.[0]?.security_agents?.patrol_vehicle || 'Patrouille Alpha Horeb Secure'}
                  </span>
                  <span className="text-[11px] text-emerald-400 block font-medium">
                    ✓ Levée de doute effectuée sur site
                  </span>
                </div>
              </div>

              {/* Corps du Compte-rendu formaté */}
              <AgentReportViewer
                rawReport={alert.resolution_report || alert.interventions?.[0]?.report}
              />
            </div>
          )}

          {/* Actions Opérationnelles du Régulateur */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Cycle de Vie Opérationnel de l'Incident
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Synchronisation bidirectionnelle SOC ⇄ Patrouilleur ⇄ Base centrale
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isMutatingStatus && (
                  <span className="text-[11px] text-cyan-400 font-mono animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    Enregistrement serveur...
                  </span>
                )}
                <span className="text-[11px] text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                  Statut : <strong className="text-white">{alert.status}</strong>
                </span>
              </div>
            </div>

            {/* Stepper visuel du cycle de vie */}
            <div className="grid grid-cols-6 gap-1 p-2 rounded-2xl bg-slate-950 border border-slate-800/80 text-[10px] font-bold text-center">
              {[
                { label: '1. Reçu', active: ['CREATED', 'SENT', 'RECEIVED', 'ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) },
                { label: '2. Pris en charge', active: ['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) },
                { label: '3. Affecté', active: ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) },
                { label: '4. En route', active: ['EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) },
                { label: '5. Sur site', active: ['ARRIVED', 'RESOLVED'].includes(alert.status) },
                { label: '6. Sécurisé', active: alert.status === 'RESOLVED' },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`py-1.5 px-1 rounded-xl transition-all ${
                    step.active
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-black shadow-sm'
                      : 'text-slate-600 bg-slate-900/40'
                  }`}
                >
                  {step.label}
                </div>
              ))}
            </div>

            {statusMutationError && (
              <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-800 text-xs text-red-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{statusMutationError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStatusMutationError(null);
                    loadAlertData();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-red-900 hover:bg-red-800 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Actualiser</span>
                </button>
              </div>
            )}

            {/* Bannières pour statuts finaux */}
            {alert.status === 'RESOLVED' && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-600/40 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Incident résolu et clôturé. Le rapport d'intervention officiel est certifié.</span>
              </div>
            )}

            {alert.status === 'CANCELLED' && (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-xs text-slate-400 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Alerte annulée par le déclarant. Le dossier est classé sans suite.</span>
              </div>
            )}

            {alert.status === 'FALSE_ALARM' && (
              <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Classé en fausse alerte après vérification des consignes.</span>
              </div>
            )}

            {/* Boutons d'Action Opérationnelle */}
            {!['RESOLVED', 'CANCELLED'].includes(alert.status) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {/* 1. Prise en charge ACK */}
                <button
                  disabled={isMutatingStatus || !['CREATED', 'SENT', 'RECEIVED'].includes(alert.status)}
                  onClick={() => handleStatusChange('ACKNOWLEDGED', 'Alerte prise en charge par la régulation SOC')}
                  className="py-2.5 px-3.5 rounded-xl bg-amber-900/60 hover:bg-amber-800 disabled:opacity-40 disabled:hover:bg-amber-900/60 text-amber-200 border border-amber-700 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Prendre en charge (ACK)</span>
                </button>

                {/* 2. Passer En Route */}
                <button
                  disabled={
                    isMutatingStatus ||
                    !['ASSIGNED', 'ACKNOWLEDGED'].includes(alert.status) ||
                    !alert.assigned_agent_id
                  }
                  title={!alert.assigned_agent_id ? "Nécessite d'affecter un agent d'abord" : ''}
                  onClick={() => handleStatusChange('EN_ROUTE', 'Patrouille en déplacement prioritaire')}
                  className="py-2.5 px-3.5 rounded-xl bg-blue-900/60 hover:bg-blue-800 disabled:opacity-40 disabled:hover:bg-blue-900/60 text-blue-200 border border-blue-700 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Passer En Route</span>
                </button>

                {/* 3. Marquer Sur Site */}
                <button
                  disabled={
                    isMutatingStatus ||
                    !['EN_ROUTE', 'ASSIGNED'].includes(alert.status) ||
                    !alert.assigned_agent_id
                  }
                  onClick={() => handleStatusChange('ARRIVED', 'Patrouille arrivée sur site - Périmètre en sécurisation')}
                  className="py-2.5 px-3.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 disabled:opacity-40 disabled:hover:bg-emerald-900/60 text-emerald-200 border border-emerald-700 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Marquer Sur Site</span>
                </button>

                {/* 4. Clôturer avec Rapport */}
                <button
                  disabled={isMutatingStatus}
                  onClick={() => setShowReportForm(true)}
                  className="py-2.5 px-4 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-extrabold flex items-center gap-1.5 shadow-lg shadow-green-950 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Clôturer avec Rapport</span>
                </button>

                {/* 5. Fausse Alerte */}
                <button
                  disabled={isMutatingStatus}
                  onClick={() => handleStatusChange('FALSE_ALARM', 'Levée de doute négative - Déclenchement accidentel résident')}
                  className="py-2.5 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 border border-zinc-700 font-semibold transition-colors"
                >
                  Fausse alerte
                </button>

                {/* 6. Escalade Police (17) */}
                <button
                  disabled={isMutatingStatus || alert.status === 'ESCALATED'}
                  onClick={() => handleStatusChange('ESCALATED', 'Escalade vers les services de Police Nationale (17)')}
                  className="py-2.5 px-3.5 rounded-xl bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-rose-300 border border-rose-800 font-extrabold flex items-center gap-1.5 transition-colors"
                >
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                  <span>Escalade Police (17)</span>
                </button>
              </div>
            )}

            {/* Formulaire de Clôture avec Rapport */}
            {showReportForm && (
              <form
                onSubmit={handleResolveWithReport}
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 mt-4"
              >
                <span className="text-xs font-bold text-white block">
                  Rapport de Clôture Officiel :
                </span>
                <textarea
                  rows={3}
                  required
                  value={reportInput}
                  onChange={(e) => setReportInput(e.target.value)}
                  placeholder="Rédigez les conclusions de la levée de doute (ex: Périmètre sécurisé, aucun signe d'effraction...)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-green-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReportForm(false)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-bold"
                  >
                    Valider la clôture
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Proof of Intervention & Rapport de Mission SOC (Phase 3) */}
          <ProofOfInterventionCard alertId={alertId} />

          {/* Onglets Traçabilité : alert_events & audit_logs */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('EVENTS')}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 ${
                    activeTab === 'EVENTS'
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Événements Incident ({events.length})</span>
                </button>

                <button
                  onClick={() => setActiveTab('AUDIT')}
                  className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 ${
                    activeTab === 'AUDIT'
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Journal d'Audit ({auditLogs.length})</span>
                </button>
              </div>

              <span className="text-[11px] text-slate-500 font-mono">Certifié Immuable</span>
            </div>

            {/* Vue 1 : alert_events */}
            {activeTab === 'EVENTS' && (
              <div className="space-y-2.5">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 text-center">
                    Aucun événement enregistré.
                  </p>
                ) : (
                  events.map((ev) => {
                    const isCompleted = ev.event_type === 'INTERVENTION_COMPLETED';
                    const reportText = ev.metadata?.report;

                    return (
                      <div
                        key={ev.id}
                        className={`p-3.5 rounded-2xl border text-xs transition-all ${
                          isCompleted
                            ? 'bg-emerald-950/30 border-emerald-600/70 shadow-md shadow-emerald-950/50'
                            : 'bg-slate-950 border-slate-800/80'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <span className={`font-semibold block ${isCompleted ? 'text-emerald-300 font-bold' : 'text-white'}`}>
                              {ev.comment}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              <span className={`px-2 py-0.5 rounded font-mono ${isCompleted ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-800 text-slate-300'}`}>
                                {ev.event_type}
                              </span>
                              {ev.from_status && ev.to_status && (
                                <span className="font-semibold text-cyan-400">
                                  {ev.from_status} ➔ {ev.to_status}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className="font-mono text-slate-400 text-[11px] shrink-0 ml-3">
                            {format(new Date(ev.created_at), 'HH:mm:ss', { locale: fr })}
                          </span>
                        </div>

                        {reportText && (
                          <div className="mt-2.5 p-3 rounded-xl bg-slate-900/90 border border-emerald-800/60 text-slate-200 text-[11px] leading-relaxed">
                            <span className="text-emerald-400 font-bold block mb-1">
                              📝 Compte-rendu de l'agent :
                            </span>
                            "{reportText}"
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Vue 2 : audit_logs */}
            {activeTab === 'AUDIT' && (
              <div className="space-y-2.5">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 text-center">
                    Aucune entrée d'audit pour cet incident.
                  </p>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          {log.action}
                        </span>
                        <span className="font-mono text-slate-500 text-[11px]">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}
                        </span>
                      </div>

                      {log.details && (
                        <pre className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Affectation d'Agent */}
      {isAssignModalOpen && (
        <AssignAgentModal
          alert={alert}
          onClose={() => setIsAssignModalOpen(false)}
          onAssigned={async () => {
            setIsAssignModalOpen(false);
            await loadAlertData();
          }}
        />
      )}

      {/* Modal Appel Client */}
      {isCallModalOpen && (
        <QuickCallModal
          alert={alert}
          onClose={() => setIsCallModalOpen(false)}
        />
      )}
    </div>
  );
}

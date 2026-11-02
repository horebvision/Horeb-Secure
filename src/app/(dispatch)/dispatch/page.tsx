'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { AlertFeedCard } from '@/components/dispatch/AlertFeedCard';
import { AssignAgentModal } from '@/components/dispatch/AssignAgentModal';
import { IncidentMap } from '@/components/dispatch/IncidentMap';
import { QuickCallModal } from '@/components/dispatch/QuickCallModal';
import { AudioControlBanner } from '@/components/dispatch/AudioControlBanner';
import { UrgentAlertBanner } from '@/components/dispatch/UrgentAlertBanner';
import { NotificationCenter } from '@/components/shared/NotificationCenter';
import { CreateSiteModal } from '@/components/dispatch/CreateSiteModal';
import { CommandCenterMetrics } from '@/components/dispatch/CommandCenterMetrics';
import { InterventionTimeline } from '@/components/dispatch/InterventionTimeline';
import { LiveActivityFeed } from '@/components/dispatch/LiveActivityFeed';
import { GpsFreshnessBadge } from '@/components/dispatch/GpsFreshnessBadge';
import { SlaStatusBadge } from '@/components/dispatch/SlaStatusBadge';
import { SiteVideoPanel } from '@/components/video/SiteVideoPanel';
import { Alert } from '@/lib/types/securia';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';
import { useRealtimeSubscription } from '@/lib/supabase/use-realtime';
import { calculateAlertSla } from '@/lib/sla';
import {
  Building,
  Radio,
  Volume2,
  Users,
  ShieldAlert,
  Car,
  RefreshCw,
  Clock,
  AlertOctagon,
  Activity,
  CheckCircle2,
  ShieldCheck,
  Search,
  Filter,
  Layers,
  Phone,
  FileArchive,
  Webhook,
  Crosshair,
  Timer,
  AlertTriangle,
  Video,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';

const ALLOWED_ROLES = ['SECURITY_MANAGER', 'ADMIN'] as const;

type FilterMode =
  | 'ALL'
  | 'CRITICAL'
  | 'UNASSIGNED'
  | 'INTERVENTIONS'
  | 'SLA_RISK'
  | 'SLA_BREACHED'
  | 'HISTORY';

export default function DispatchDashboardPage() {
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);
  const { alerts, agents, updateAlertStatus, currentUser } = useSecuria();

  // Modales
  const [selectedAlertForAssign, setSelectedAlertForAssign] = useState<Alert | null>(null);
  const [selectedAlertForCall, setSelectedAlertForCall] = useState<Alert | null>(null);
  const [selectedMapAlert, setSelectedMapAlert] = useState<Alert | null>(null);
  const [isCreateSiteModalOpen, setIsCreateSiteModalOpen] = useState(false);

  // Filtres & Recherche
  const [activeFilter, setActiveFilter] = useState<FilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSupervisionTab, setActiveSupervisionTab] = useState<'TIMELINE' | 'FLEET' | 'ACTIVITY'>('TIMELINE');
  const [selectedTimelineAlertId, setSelectedTimelineAlertId] = useState<string | null>(null);

  // Données serveur & Synchronisation
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [serverAlerts, setServerAlerts] = useState<Alert[]>([]);
  const knownAlertIdsRef = useRef<Set<string>>(new Set());
  const mapSectionRef = useRef<HTMLDivElement>(null);

  // Chargement des alertes depuis le backend Supabase
  const loadServerAlerts = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      const res = await authFetch('/api/alerts?limit=50');
      if (res.ok) {
        const data = await res.json();
        const incomingAlerts: Alert[] = data.alerts || [];

        // Détection de nouvelles alertes d'urgence pour le carillon sonore
        let hasNewCriticalAlert = false;
        incomingAlerts.forEach((a) => {
          if (!knownAlertIdsRef.current.has(a.id)) {
            knownAlertIdsRef.current.add(a.id);
            if (['SENT', 'RECEIVED', 'ESCALATED'].includes(a.status) && !isSilent) {
              hasNewCriticalAlert = true;
            }
          }
        });

        if (hasNewCriticalAlert) {
          soundService.playEmergencyChime();
          soundService.vibrate([300, 150, 300]);
        }

        setServerAlerts(incomingAlerts);
      }
    } catch (err) {
      console.warn('[Command Center] Erreur synchronisation alertes:', err);
    } finally {
      if (!isSilent) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, []);

  // Architecture Realtime Primary + Polling Fallback
  const { isRealtimeActive } = useRealtimeSubscription({
    channelName: 'dispatch_command_center_stream',
    table: 'alerts',
    onRefresh: () => loadServerAlerts(true),
    pollIntervalFallbackMs: 4000,
    pollIntervalHeartbeatMs: 25000,
  });

  useEffect(() => {
    loadServerAlerts();
  }, [loadServerAlerts]);

  // Fusion intelligente des alertes serveur et du contexte local réel
  const liveAlerts = useMemo(() => {
    const cleanLocalAlerts = alerts.filter(
      (a) => a.alert_number !== 'SEC-2026-0042' && a.id !== '44444444-4444-4444-4444-444444444444'
    );
    const map = new Map<string, Alert>();
    cleanLocalAlerts.forEach((a) => map.set(a.id, a));
    serverAlerts.forEach((a) => map.set(a.id, a));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [serverAlerts, alerts]);

  // Alertes annotées avec leur résumé SLA déterministe
  const alertsWithSla = useMemo(() => {
    return liveAlerts.map((alert) => ({
      alert,
      slaSummary: calculateAlertSla(alert),
    }));
  }, [liveAlerts]);

  // Calcul 100% réel des 4 métriques de commandement
  const metrics = useMemo(() => {
    const active = liveAlerts.filter(
      (a) => !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
    );
    const critical = active.filter((a) => a.priority === 'CRITICAL');
    const pending = active.filter((a) => ['SENT', 'RECEIVED', 'ESCALATED', 'CREATED'].includes(a.status));
    const inProgress = active.filter((a) => ['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(a.status));
    const resolved = liveAlerts.filter((a) => ['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status));

    const assigned = active.filter((a) => a.status === 'ASSIGNED');
    const enRoute = active.filter((a) => a.status === 'EN_ROUTE');
    const onSite = active.filter((a) => a.status === 'ARRIVED');

    const availableAg = agents.filter(
      (ag) => ag.agent_status === 'AVAILABLE' || ag.duty_status === 'AVAILABLE'
    );
    const enRouteAg = agents.filter(
      (ag) => ag.duty_status === 'DISPATCHED' || ag.agent_status === 'EN_ROUTE'
    );
    const onSiteAg = agents.filter(
      (ag) => ag.duty_status === 'ON_SITE' || ag.agent_status === 'ON_SITE'
    );
    const offDutyAg = agents.filter(
      (ag) => ag.agent_status === 'OFF_DUTY' || ag.duty_status === 'OFF_DUTY'
    );

    let compliantCount = 0;
    let atRiskCount = 0;
    let breachedCount = 0;

    active.forEach((a) => {
      const summary = calculateAlertSla(a);
      if (summary.overallStatus === 'BREACHED') breachedCount++;
      else if (summary.overallStatus === 'AT_RISK') atRiskCount++;
      else compliantCount++;
    });

    const totalActive = active.length;
    const complianceRate = totalActive > 0 ? Math.round((compliantCount / totalActive) * 100) : 100;

    return {
      alerts: {
        criticalCount: critical.length,
        pendingCount: pending.length,
        inProgressCount: inProgress.length,
        resolvedCount: resolved.length,
        totalActive,
      },
      interventions: {
        enRouteCount: enRoute.length,
        onSiteCount: onSite.length,
        assignedCount: assigned.length,
        completedCount: resolved.length,
        totalActive: assigned.length + enRoute.length + onSite.length,
      },
      agents: {
        availableCount: availableAg.length,
        enRouteCount: enRouteAg.length,
        onSiteCount: onSiteAg.length,
        offDutyCount: offDutyAg.length,
        total: agents.length,
      },
      sla: {
        compliantCount,
        atRiskCount,
        breachedCount,
        complianceRate,
      },
    };
  }, [liveAlerts, agents]);

  // Filtrage et Tri Prioritaire de la File Opérationnelle
  const displayedAlerts = useMemo(() => {
    let list = [...alertsWithSla];

    // 1. Filtrage par onglet rapide
    switch (activeFilter) {
      case 'CRITICAL':
        list = list.filter(
          (item) =>
            item.alert.priority === 'CRITICAL' &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
      case 'UNASSIGNED':
        list = list.filter(
          (item) =>
            !item.alert.assigned_agent_id &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
      case 'INTERVENTIONS':
        list = list.filter((item) =>
          ['ASSIGNED', 'EN_ROUTE', 'ARRIVED'].includes(item.alert.status)
        );
        break;
      case 'SLA_RISK':
        list = list.filter(
          (item) =>
            item.slaSummary.overallStatus === 'AT_RISK' &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
      case 'SLA_BREACHED':
        list = list.filter(
          (item) =>
            item.slaSummary.overallStatus === 'BREACHED' &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
      case 'HISTORY':
        list = list.filter((item) =>
          ['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
      case 'ALL':
      default:
        // Par défaut, afficher toutes les alertes actives en premier
        list = list.filter(
          (item) => !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(item.alert.status)
        );
        break;
    }

    // 2. Filtrage textuel de recherche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item) => {
        const a = item.alert;
        const alertNum = a.alert_number?.toLowerCase() || '';
        const clientName = a.user?.full_name?.toLowerCase() || '';
        const siteName = a.site?.name?.toLowerCase() || '';
        const address = a.location_address?.toLowerCase() || '';
        const agentName = agents.find((ag) => ag.id === a.assigned_agent_id)?.full_name?.toLowerCase() || '';
        return (
          alertNum.includes(q) ||
          clientName.includes(q) ||
          siteName.includes(q) ||
          address.includes(q) ||
          agentName.includes(q)
        );
      });
    }

    // 3. Tri Prioritaire : Criticité > Risque SLA > Ancienneté
    const priorityWeight: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    const slaWeight: Record<string, number> = {
      BREACHED: 3,
      AT_RISK: 2,
      NORMAL: 1,
      COMPLETED: 0,
    };

    return list.sort((a, b) => {
      // Si on est dans l'historique, trier par date décroissante
      if (activeFilter === 'HISTORY') {
        return new Date(b.alert.created_at).getTime() - new Date(a.alert.created_at).getTime();
      }

      const pDiff = (priorityWeight[b.alert.priority] || 1) - (priorityWeight[a.alert.priority] || 1);
      if (pDiff !== 0) return pDiff;

      const slaDiff =
        (slaWeight[b.slaSummary.overallStatus] || 0) - (slaWeight[a.slaSummary.overallStatus] || 0);
      if (slaDiff !== 0) return slaDiff;

      // Plus ancienne d'abord (attente la plus longue)
      return new Date(a.alert.created_at).getTime() - new Date(b.alert.created_at).getTime();
    }).map((item) => item.alert);
  }, [alertsWithSla, activeFilter, searchQuery, agents]);

  // Alerte active sélectionnée pour l'inspection de chronologie
  const activeTimelineAlert = useMemo(() => {
    if (selectedTimelineAlertId) {
      const found = liveAlerts.find((a) => a.id === selectedTimelineAlertId);
      if (found) return found;
    }
    // Par défaut, première alerte active de la file ou première alerte
    const activeFirst = liveAlerts.find(
      (a) => !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
    );
    return activeFirst || liveAlerts[0] || null;
  }, [selectedTimelineAlertId, liveAlerts]);

  const handleFocusMap = (alert: Alert) => {
    setSelectedMapAlert(alert);
    setSelectedTimelineAlertId(alert.id);
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBannerAcknowledge = async (alertId: string) => {
    updateAlertStatus(alertId, 'ACKNOWLEDGED', 'Pris en charge depuis la bannière d’urgence');
    try {
      await authFetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      });
      loadServerAlerts(true);
    } catch (err) {
      console.warn('Erreur acquittement:', err);
    }
  };

  const handleRefresh = async () => {
    soundService.playConfirmation();
    await loadServerAlerts(false);
  };

  // Garde placée APRÈS tous les Hooks (règle des Hooks React)
  if (isAuthorized === false) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. CONTRÔLE ET ACTIVATION DES ALERTES SONORES */}
      <AudioControlBanner />

      {/* 2. BANNIÈRE D'URGENCE NON ACQUITTÉE AVEC SIRÈNE */}
      <UrgentAlertBanner alerts={liveAlerts} onAcknowledge={handleBannerAcknowledge} />

      {/* 3. EN-TÊTE OPÉRATIONNEL : SECURIA COMMAND CENTER */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-500/60 flex items-center justify-center text-red-400 shadow-lg shadow-red-950/50">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black text-white tracking-wide">
                HOREB SECURE COMMAND CENTER — SALLE DE CONTRÔLE OPÉRATIONNELLE
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border flex items-center gap-1.5 ${
                  isRealtimeActive
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950 text-amber-400 border-amber-800'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRealtimeActive ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                  }`}
                />
                <span>{isRealtimeActive ? 'REALTIME WS ACTIF' : 'POLLING SECOURS'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Supervision unifiée 24/7 • Respect des engagements SLA • Télémétrie GPS des patrouilles
            </p>
            <div className="flex items-center gap-2 mt-1 text-[11px]">
              <span className="font-semibold text-rose-300">
                Opérateur : {currentUser?.full_name || 'Régulateur SOC'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-medium">District d’Abidjan (CI)</span>
            </div>
          </div>
        </div>

        {/* Commandes du régulateur */}
        <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            title="Rafraîchir les flux"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={() => setIsCreateSiteModalOpen(true)}
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-all"
            title="Créer un nouveau site protégé avec coordonnées GPS pour le Dispatch"
          >
            <Building className="w-4 h-4" />
            <span>Nouveau Site</span>
          </button>

          <Link
            href="/dispatch/agents"
            className="py-2 px-3 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Car className="w-4 h-4 text-cyan-400" />
            <span>Flotte ({agents.length})</span>
          </Link>

          <Link
            href="/settings/users?role=SECURITY_MANAGER"
            className="py-2 px-3 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Gérer et inviter des Contrôleurs Dispatch / Régulateurs SOC"
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Contrôleurs Dispatch</span>
          </Link>

          <Link
            href="/dispatch/exports"
            className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Centre d'exportation multi-rapports (CSV/ZIP)"
          >
            <FileArchive className="w-4 h-4 text-cyan-400" />
            <span>Exports</span>
          </Link>

          <Link
            href="/dispatch/cameras"
            className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Registre des Caméras & Systèmes Vidéo NVR/VMS"
          >
            <Video className="w-4 h-4 text-cyan-400" />
            <span>Caméras</span>
          </Link>

          <Link
            href="/dispatch/integrations"
            className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Configuration des Webhooks Partenaires & Assurances"
          >
            <Webhook className="w-4 h-4 text-purple-400" />
            <span>Webhooks</span>
          </Link>

          <NotificationCenter role="SECURITY_MANAGER" userId={currentUser?.id} />
        </div>
      </div>

      {/* 4. LES 4 INDICATEURS CLÉS DU COMMAND CENTER (SLA & FLOTTE INCLUS) */}
      <CommandCenterMetrics
        alerts={metrics.alerts}
        interventions={metrics.interventions}
        agents={metrics.agents}
        sla={metrics.sla}
        onFilterChange={(f) => {
          if (f === 'CRITICAL') setActiveFilter('CRITICAL');
          else if (f === 'INTERVENTIONS') setActiveFilter('INTERVENTIONS');
          else if (f === 'BREACHED') setActiveFilter('SLA_BREACHED');
          else setActiveFilter('ALL');
        }}
      />

      {/* 5. CARTOGRAPHIE TACTIQUE RADAR */}
      <div ref={mapSectionRef}>
        <IncidentMap
          alerts={liveAlerts}
          selectedAlertId={selectedMapAlert?.id}
          onSelectAlert={(a) => {
            setSelectedMapAlert(a);
            setSelectedTimelineAlertId(a.id);
          }}
        />
      </div>

      {/* 6. BARRE DE RECHERCHE & FILTRES RAPIDES */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Recherche instantanée */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher alerte, client, site, adresse, agent..."
            className="w-full pl-10 pr-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {/* Boutons Filtres */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
            }`}
          >
            Toutes ({metrics.alerts.totalActive})
          </button>

          <button
            onClick={() => setActiveFilter('CRITICAL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'CRITICAL'
                ? 'bg-red-600 text-white shadow'
                : 'text-red-400 hover:text-red-300 bg-red-950/30 border border-red-900/60'
            }`}
          >
            Critiques ({metrics.alerts.criticalCount})
          </button>

          <button
            onClick={() => setActiveFilter('UNASSIGNED')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'UNASSIGNED'
                ? 'bg-amber-600 text-white shadow'
                : 'text-amber-400 hover:text-amber-300 bg-amber-950/30 border border-amber-900/60'
            }`}
          >
            Non assignées ({liveAlerts.filter((a) => !a.assigned_agent_id && !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)).length})
          </button>

          <button
            onClick={() => setActiveFilter('INTERVENTIONS')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'INTERVENTIONS'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 border border-cyan-900/60'
            }`}
          >
            En route / Sur site ({metrics.interventions.totalActive})
          </button>

          <button
            onClick={() => setActiveFilter('SLA_RISK')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'SLA_RISK'
                ? 'bg-orange-600 text-white shadow'
                : 'text-orange-400 hover:text-orange-300 bg-orange-950/30 border border-orange-900/60'
            }`}
          >
            SLA à risque ({metrics.sla.atRiskCount})
          </button>

          <button
            onClick={() => setActiveFilter('SLA_BREACHED')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'SLA_BREACHED'
                ? 'bg-rose-700 text-white shadow'
                : 'text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-900/60'
            }`}
          >
            SLA dépassé ({metrics.sla.breachedCount})
          </button>

          <button
            onClick={() => setActiveFilter('HISTORY')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeFilter === 'HISTORY'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 border border-emerald-900/60'
            }`}
          >
            Clôturées ({metrics.alerts.resolvedCount})
          </button>
        </div>
      </div>

      {/* 7. SECTION PRINCIPALE : FILE PRIORITAIRE DES ALERTES & FLOTTE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche : File des Alertes Triée Prioritairement (2/3 largeur) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-xl">
            <div className="flex items-center space-x-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h2 className="text-base font-extrabold text-white">
                File Opérationnelle Priorisée
                <span className="ml-2 font-mono text-xs text-slate-400 font-normal">
                  ({displayedAlerts.length} affichée{displayedAlerts.length > 1 ? 's' : ''})
                </span>
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Tri: Criticité → Risque SLA → Ancienneté
            </span>
          </div>

          {/* Liste des Cartes d'Alerte */}
          {displayedAlerts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400">
              <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
              <h3 className="text-base font-bold text-white mb-1">Aucune alerte dans cette vue</h3>
              <p className="text-xs text-slate-400">
                {searchQuery
                  ? `Aucun résultat correspondant à "${searchQuery}".`
                  : activeFilter === 'HISTORY'
                  ? 'Aucune intervention archivée pour le moment.'
                  : 'Tous les sites protégés sont calmes et sécurisés.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => setSelectedTimelineAlertId(alert.id)}
                  className={`cursor-pointer transition-transform ${
                    selectedTimelineAlertId === alert.id ? 'ring-2 ring-cyan-500 rounded-3xl' : ''
                  }`}
                >
                  <AlertFeedCard
                    alert={alert}
                    onOpenAssignModal={(a) => setSelectedAlertForAssign(a)}
                    onOpenCallModal={(a) => setSelectedAlertForCall(a)}
                    onFocusMap={handleFocusMap}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne Droite : Vidéo du site, Flotte d'agents, télémesures directes & secours */}
        <div className="space-y-6">
          {/* 1. Panneau VIDÉO DU SITE (Phase 8 - Zéro Fake Vidéo) */}
          <SiteVideoPanel
            siteId={selectedMapAlert?.site_id || displayedAlerts[0]?.site_id || null}
            siteName={selectedMapAlert?.site?.name || displayedAlerts[0]?.site?.name || ''}
          />

          {/* 2. État des Patrouilleurs en direct */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Patrouilleurs de Sécurité</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">Abidjan (CI)</span>
            </div>

            <div className="space-y-3">
              {agents.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-slate-950/80 border border-slate-800/80">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-bold text-slate-300">Aucun patrouilleur en service</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Les patrouilleurs disponibles s'afficheront ici en temps réel.
                  </p>
                </div>
              ) : (
                agents.map((ag) => {
                  const isAvailable =
                    ag.agent_status === 'AVAILABLE' || ag.duty_status === 'AVAILABLE';
                  const isDispatched =
                    ag.duty_status === 'DISPATCHED' || ag.agent_status === 'EN_ROUTE';
                  const isOnSite =
                    ag.duty_status === 'ON_SITE' || ag.agent_status === 'ON_SITE';

                  const agAny = ag as any;
                  const agName =
                    ag.full_name ||
                    agAny.user?.full_name ||
                    agAny.users?.full_name ||
                    agAny.agent_name ||
                    `Agent ${ag.badge_number || 'AGT'}`;
                  const agPhone = ag.phone || agAny.user?.phone || agAny.users?.phone || '';
                  const agInitials =
                    (agName.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2) || 'AG').toUpperCase();

                  return (
                    <div
                      key={ag.id}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/90 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800/80 flex items-center justify-center font-bold text-cyan-300 text-xs">
                            {agInitials}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white">{agName}</h4>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {ag.badge_number || 'AGT-SEC'}{agPhone ? ` • ${agPhone}` : ''}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            isOnSite
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : isDispatched
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : isAvailable
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {isOnSite
                            ? '🟣 Sur Site'
                            : isDispatched
                            ? '🔵 En Route'
                            : isAvailable
                            ? '🟢 Disponible'
                            : '⚫ Hors Service'}
                        </span>
                      </div>

                      {/* Télémétrie GPS de l'agent */}
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-900">
                        <GpsFreshnessBadge lastUpdateIso={ag.last_location_update} />
                        {ag.patrol_vehicle && (
                          <span className="text-slate-400 font-mono">
                            {ag.patrol_vehicle}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Liaisons Secours Publiques (Côte d'Ivoire) */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2">
              Liaisons Secours Publiques
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              En cas d'escalade d'incident, contacter directement les services d'urgence :
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <a
                href="tel:170"
                className="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-red-600 transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-white block">Police / 170</span>
                  <span className="text-[10px] text-slate-400">Police Secours CI</span>
                </div>
                <span className="font-mono text-red-400 font-extrabold text-base">170</span>
              </a>

              <a
                href="tel:180"
                className="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-orange-600 transition-colors flex items-center justify-between"
              >
                <div>
                  <span className="font-bold text-white block">Pompiers / 180</span>
                  <span className="text-[10px] text-slate-400">GSPM Côte d’Ivoire</span>
                </div>
                <span className="font-mono text-orange-400 font-extrabold text-base">180</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 8. MODULES DE SUPERVISION AVANCÉS DU COMMAND CENTER (MULTI-ONGLETS) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-extrabold text-white">
              Supervision Opérationnelle & Télémétrie Avancée
            </h3>
          </div>

          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSupervisionTab('TIMELINE')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeSupervisionTab === 'TIMELINE'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>Chronologie SLA T0-T6</span>
            </button>

            <button
              onClick={() => setActiveSupervisionTab('FLEET')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeSupervisionTab === 'FLEET'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Télémétrie Flotte ({agents.length})</span>
            </button>

            <button
              onClick={() => setActiveSupervisionTab('ACTIVITY')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeSupervisionTab === 'ACTIVITY'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Journal en Direct (Audit)</span>
            </button>
          </div>
        </div>

        {/* ONGLET 1 : CHRONOLOGIE SLA T0-T6 */}
        {activeSupervisionTab === 'TIMELINE' && (
          <div className="space-y-4">
            {activeTimelineAlert ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-sm font-black text-cyan-400">
                      {activeTimelineAlert.alert_number}
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">
                      {activeTimelineAlert.user?.full_name || 'Client Abonné'} — {activeTimelineAlert.site?.name || 'Site Protégé'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">
                      Déclenché à {format(new Date(activeTimelineAlert.created_at), 'HH:mm:ss', { locale: fr })}
                    </span>
                    <Link
                      href={`/dispatch/alerts/${activeTimelineAlert.id}`}
                      className="text-xs font-bold text-cyan-400 hover:underline px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800"
                    >
                      Dossier complet →
                    </Link>
                  </div>
                </div>

                <InterventionTimeline alert={activeTimelineAlert} />
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                Aucune alerte sélectionnée pour la chronologie. Cliquez sur une alerte dans la file ci-dessus.
              </div>
            )}
          </div>
        )}

        {/* ONGLET 2 : TÉLÉMÉTRIE FLOTTE & POSITIONS EN TEMPS RÉEL */}
        {activeSupervisionTab === 'FLEET' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Patrouilleur</th>
                  <th className="py-3 px-4">Matricule & Téléphone</th>
                  <th className="py-3 px-4">Statut Opérationnel</th>
                  <th className="py-3 px-4">Véhicule</th>
                  <th className="py-3 px-4">Fraîcheur GPS</th>
                  <th className="py-3 px-4">Coordonnées GPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {agents.map((ag) => {
                  const isAvailable =
                    ag.agent_status === 'AVAILABLE' || ag.duty_status === 'AVAILABLE';
                  const isDispatched =
                    ag.duty_status === 'DISPATCHED' || ag.agent_status === 'EN_ROUTE';
                  const isOnSite =
                    ag.duty_status === 'ON_SITE' || ag.agent_status === 'ON_SITE';

                  const agAny = ag as any;
                  const agName =
                    ag.full_name ||
                    agAny.user?.full_name ||
                    agAny.users?.full_name ||
                    agAny.agent_name ||
                    `Agent ${ag.badge_number || 'AGT'}`;
                  const agPhone = ag.phone || agAny.user?.phone || agAny.users?.phone || '';
                  const agInitials =
                    (agName.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2) || 'AG').toUpperCase();

                  return (
                    <tr key={ag.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-[10px] text-cyan-300 font-mono">
                          {agInitials}
                        </div>
                        <span>{agName}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {ag.badge_number || 'AGT-SEC'}{agPhone ? ` • ${agPhone}` : ''}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isOnSite
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : isDispatched
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : isAvailable
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {isOnSite
                            ? 'Sur Site'
                            : isDispatched
                            ? 'En Route'
                            : isAvailable
                            ? 'Disponible'
                            : 'Hors Service'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono">
                        {ag.patrol_vehicle || 'Véhicule d’intervention'}
                      </td>
                      <td className="py-3.5 px-4">
                        <GpsFreshnessBadge lastUpdateIso={ag.last_location_update} />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {ag.current_latitude && ag.current_longitude ? (
                          <span>
                            {ag.current_latitude.toFixed(5)}, {ag.current_longitude.toFixed(5)}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Non localisé</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ONGLET 3 : JOURNAL EN DIRECT (AUDIT TRAIL) */}
        {activeSupervisionTab === 'ACTIVITY' && (
          <div>
            <LiveActivityFeed refreshTrigger={liveAlerts.length} />
          </div>
        )}
      </div>

      {/* 9. MODALES OPÉRATIONNELLES (NON-RÉGRESSION V1 & V2 PHASE 1) */}
      {selectedAlertForAssign && (
        <AssignAgentModal
          alert={selectedAlertForAssign}
          onClose={() => setSelectedAlertForAssign(null)}
          onAssigned={async () => {
            setSelectedAlertForAssign(null);
            await loadServerAlerts(false);
          }}
        />
      )}

      {selectedAlertForCall && (
        <QuickCallModal
          alert={selectedAlertForCall}
          onClose={() => setSelectedAlertForCall(null)}
        />
      )}

      <CreateSiteModal
        isOpen={isCreateSiteModalOpen}
        onClose={() => setIsCreateSiteModalOpen(false)}
        onSiteCreated={() => {
          handleRefresh();
        }}
      />
    </div>
  );
}

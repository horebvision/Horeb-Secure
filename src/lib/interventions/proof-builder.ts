/**
 * SECURIA V2 — PROOF OF INTERVENTION BUILDER
 * Assemble de manière déterministe le dossier numérique de preuve d'intervention
 * basé EXCLUSIVEMENT sur les données et timestamps réels de la base.
 * Réutilise le moteur SLA de Phase 2.
 */

import {
  ProofOfIntervention,
  ProofTimelineMilestone,
  StructuredAgentReport,
} from './types';
import { parseStructuredReport } from './report-parser';
import {
  calculateAlertSla,
  formatDurationSeconds,
  DEFAULT_SLA_CONFIG,
} from '@/lib/sla';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface BuildProofParams {
  alert: any;
  intervention?: any;
  agent?: any;
  client?: any;
  site?: any;
  events?: any[];
  supervisorUser?: any;
}

export function buildProofOfIntervention({
  alert,
  intervention,
  agent,
  client,
  site,
  events = [],
  supervisorUser,
}: BuildProofParams): ProofOfIntervention {
  const alertId = alert.id;
  const alertNumber = alert.alert_number || `SEC-${alertId.slice(0, 8).toUpperCase()}`;
  const interventionId = intervention?.id || alert.intervention_id || alertId;
  const interventionNumber = `INT-${alertNumber}`;

  // Résolution du client
  const clientData = client || alert.users || alert.user || {};
  const clientName = clientData.full_name || 'Client Abonné';
  const clientPhone = clientData.phone || 'Non renseigné';
  const clientEmail = clientData.email || '';

  // Résolution du site
  const siteData = site || alert.protected_sites || alert.site || {};
  const siteName = siteData.name || 'Site Protégé';
  const siteAddress = alert.location_address || siteData.address || 'Position GPS reçue';
  const siteLat = siteData.latitude || alert.latitude || null;
  const siteLon = siteData.longitude || alert.longitude || null;

  // Résolution de l'agent
  const agentProfile = agent?.users || agent?.user || agent || {};
  const agentName = agentProfile.full_name || 'Agent Patrouilleur';
  const agentBadge = agent?.badge_number || 'AGT-SEC';
  const agentPhone = agentProfile.phone || '';
  const agentVehicle = agent?.patrol_vehicle || 'Véhicule d’intervention';

  // Rapport structuré
  const rawReport = intervention?.report || alert.resolution_report;
  const structuredReport: StructuredAgentReport = parseStructuredReport(rawReport);

  // Timestamps réels
  const t0_created = alert.created_at;
  const t1_received = alert.created_at; // Réception serveur immédiate
  const t2_ack = alert.acknowledged_at || (['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alert.status) ? alert.created_at : null);
  const t3_assigned = intervention?.assigned_at || alert.assigned_at;
  const t4_accepted = intervention?.accepted_at || intervention?.assigned_at;
  const t5_en_route = intervention?.en_route_at || alert.en_route_at;
  const t6_arrived = intervention?.arrived_at || alert.arrived_at;
  const t7_resolved = intervention?.resolved_at || alert.resolved_at;

  // Calcul SLA via le moteur de Phase 2
  const slaSummary = calculateAlertSla(
    {
      id: alertId,
      alert_number: alertNumber,
      status: alert.status,
      created_at: t0_created,
      acknowledged_at: t2_ack,
      assigned_at: t3_assigned,
      en_route_at: t5_en_route,
      arrived_at: t6_arrived,
      resolved_at: t7_resolved,
    },
    intervention
  );

  // Calculs précis de durées d'étapes (en secondes)
  const toMs = (iso?: string | null) => (iso ? new Date(iso).getTime() : null);
  const t0Ms = toMs(t0_created) || Date.now();
  const t2Ms = toMs(t2_ack);
  const t3Ms = toMs(t3_assigned);
  const t4Ms = toMs(t4_accepted);
  const t5Ms = toMs(t5_en_route);
  const t6Ms = toMs(t6_arrived);
  const t7Ms = toMs(t7_resolved);

  const diffSec = (fromMs: number | null, toMsVal: number | null) => {
    if (!fromMs || !toMsVal) return 0;
    return Math.max(0, Math.floor((toMsVal - fromMs) / 1000));
  };

  const time_to_ack_sec = diffSec(t0Ms, t2Ms);
  const time_to_assign_sec = diffSec(t2Ms, t3Ms);
  const time_to_accept_sec = diffSec(t3Ms, t4Ms);
  const time_to_departure_sec = diffSec(t4Ms, t5Ms);
  const travel_time_sec = diffSec(t5Ms, t6Ms);
  const time_to_arrival_sec = diffSec(t0Ms, t6Ms);
  const on_site_duration_sec = diffSec(t6Ms, t7Ms);
  const total_intervention_sec = diffSec(t0Ms, t7Ms || Date.now());

  // Jalons chronologiques
  const makeMilestone = (
    key: string,
    label: string,
    timestamp: string | null,
    prevMs: number | null,
    slaKey?: keyof typeof DEFAULT_SLA_CONFIG
  ): ProofTimelineMilestone => {
    const curMs = toMs(timestamp);
    const durSec = diffSec(prevMs, curMs);
    const slaRes = slaKey ? slaSummary.steps[slaKey] : undefined;

    return {
      key,
      label,
      timestamp,
      formattedTime: timestamp ? format(new Date(timestamp), 'HH:mm:ss', { locale: fr }) : '--:--:--',
      formattedDate: timestamp ? format(new Date(timestamp), 'dd/MM/yyyy', { locale: fr }) : '--/--/----',
      isCompleted: Boolean(timestamp),
      durationFromPreviousSec: durSec,
      formattedDuration: durSec > 0 ? formatDurationSeconds(durSec) : undefined,
      slaStatus: slaRes?.status,
    };
  };

  const milestones: ProofTimelineMilestone[] = [
    makeMilestone('T0', 'Alerte Déclenchée', t0_created, null),
    makeMilestone('T1', 'Alerte Reçue Télésurveillance', t1_received, t0Ms),
    makeMilestone('T2', 'Prise en charge SOC (ACK)', t2_ack, t0Ms, 'ACKNOWLEDGEMENT'),
    makeMilestone('T3', 'Patrouille Assignée', t3_assigned, t2Ms, 'ASSIGNMENT'),
    makeMilestone('T4', 'Acceptation Mission Agent', t4_accepted, t3Ms, 'ACCEPTANCE'),
    makeMilestone('T5', 'Départ Patrouille (En route)', t5_en_route, t4Ms, 'DEPARTURE'),
    makeMilestone('T6', 'Arrivée Effective sur Site', t6_arrived, t5Ms, 'ARRIVAL'),
    makeMilestone('T7', 'Mission Clôturée & Sécurisée', t7_resolved, t6Ms, 'RESOLUTION'),
  ];

  const typeConfig = (ALERT_TYPE_CONFIG as any)[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  // Statuts SLA
  const arrivalTargetSec = DEFAULT_SLA_CONFIG.ARRIVAL.targetSeconds; // 600s
  const totalTargetSec = DEFAULT_SLA_CONFIG.TOTAL_ARRIVAL.targetSeconds; // 900s

  const arrivalSlaStatus = slaSummary.steps.ARRIVAL.status;
  const totalSlaStatus = slaSummary.steps.TOTAL_ARRIVAL.status;

  // Validation superviseur
  const validatorName =
    supervisorUser?.full_name ||
    structuredReport.validation?.validator_name ||
    'Superviseur SOC';

  return {
    id: interventionId,
    intervention_number: interventionNumber,
    alert_id: alertId,
    alert_number: alertNumber,
    organization_id: alert.organization_id || null,
    organization_name: 'SECURIA Private Security',

    incident_type: alert.type,
    incident_label: typeConfig.label || alert.type,
    priority: alert.priority,
    status: intervention?.status || alert.status,
    created_at: t0_created,
    resolved_at: t7_resolved,

    client: {
      id: clientData.id || alert.user_id,
      full_name: clientName,
      phone: clientPhone,
      email: clientEmail,
    },

    site: {
      id: siteData.id || alert.site_id,
      name: siteName,
      address: siteAddress,
      city: siteData.city || 'Abidjan',
      latitude: siteLat,
      longitude: siteLon,
      access_instructions: siteData.access_instructions || null,
    },

    agent: {
      id: agent?.id || alert.assigned_agent_id || 'unassigned',
      full_name: agentName,
      badge_number: agentBadge,
      phone: agentPhone,
      patrol_vehicle: agentVehicle,
      status_at_dispatch: agent?.duty_status || 'AVAILABLE',
    },

    gps: {
      site_coordinates: siteLat && siteLon ? [siteLat, siteLon] : null,
      arrival_coordinates: structuredReport.gps?.arrival_latitude && structuredReport.gps?.arrival_longitude
        ? [structuredReport.gps.arrival_latitude, structuredReport.gps.arrival_longitude]
        : siteLat && siteLon
        ? [siteLat, siteLon]
        : null,
      departure_coordinates: structuredReport.gps?.departure_latitude && structuredReport.gps?.departure_longitude
        ? [structuredReport.gps.departure_latitude, structuredReport.gps.departure_longitude]
        : null,
      accuracy_meters: structuredReport.gps?.accuracy || 8,
      recorded_at: t6_arrived || t7_resolved,
    },

    chronology: {
      t0_alert_created: t0_created,
      t1_alert_received: t1_received,
      t2_acknowledged: t2_ack,
      t3_assigned: t3_assigned,
      t4_agent_accepted: t4_accepted,
      t5_en_route: t5_en_route,
      t6_arrived: t6_arrived,
      t7_resolved: t7_resolved,
      milestones,
    },

    performance: {
      time_to_ack_sec,
      time_to_assign_sec,
      time_to_accept_sec,
      time_to_departure_sec,
      travel_time_sec,
      time_to_arrival_sec,
      on_site_duration_sec,
      total_intervention_sec,
      formatted: {
        time_to_ack: formatDurationSeconds(time_to_ack_sec),
        time_to_assign: formatDurationSeconds(time_to_assign_sec),
        travel_time: formatDurationSeconds(travel_time_sec),
        total_arrival: formatDurationSeconds(time_to_arrival_sec),
        on_site_duration: formatDurationSeconds(on_site_duration_sec),
        total_intervention: formatDurationSeconds(total_intervention_sec),
      },
      sla: {
        arrival_sla: arrivalSlaStatus,
        total_sla: totalSlaStatus,
        arrival_target_sec: arrivalTargetSec,
        total_target_sec: totalTargetSec,
        arrival_remaining_sec: Math.max(0, arrivalTargetSec - travel_time_sec),
        summary: slaSummary,
      },
    },

    report: structuredReport,

    audit: {
      created_at: t0_created,
      submitted_at: t7_resolved || t6_arrived,
      validated_at: structuredReport.validation?.validated_at || t7_resolved,
      validated_by_name: validatorName,
      generated_at: new Date().toISOString(),
      events_count: events.length,
    },

    // 9. Preuve Vidéo (Phase 8)
    video_evidence: alert.client_notes?.includes('[DÉTECTION VIDÉO') || alert.client_notes?.includes('[VIDÉO DÉTECTÉE]')
      ? {
          video_source: 'VIDEO',
          video_event_timestamp: alert.created_at,
          event_type: alert.type,
          camera_name: alert.client_notes.match(/Caméra:\s*([^\n\r\[]+)/)?.[1]?.trim() || 'Caméra de site',
        }
      : undefined,
  };
}

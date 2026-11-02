/**
 * SECURIA V2 — SMART DISPATCH SCORING ENGINE
 * Calcul déterministe, multicritère et explicable du score d'adéquation (0 à 100).
 * RÈGLE : Aucun facteur boîte noire, chaque point est tracé et justifié.
 */

import {
  DispatchAgentInput,
  DispatchAlertInput,
  DispatchContext,
  DispatchCandidate,
  DispatchScoreBreakdown,
} from './dispatch-types';
import {
  DISPATCH_WEIGHTS,
  DISPATCH_GPS_THRESHOLDS,
  DISPATCH_WORKLOAD_CONFIG,
} from './dispatch-config';
import { calculateDispatchDistance } from './dispatch-distance';
import { estimateDispatchArrivalMinutes } from './dispatch-eta';

export function calculateDispatchScore(
  agent: DispatchAgentInput,
  alert: DispatchAlertInput,
  context?: DispatchContext
): DispatchCandidate {
  const now = context?.now || new Date();
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ===========================================================================
  // 1. VÉRIFICATION D'ÉLIGIBILITÉ STRICTE (CLOISONNEMENT ORGANISATIONNEL & RÔLE)
  // ===========================================================================
  const isSameOrg = agent.organizationId === alert.organizationId;
  const isAccountActive = agent.isActive;
  const isNotOffDuty = agent.dutyStatus !== 'OFF_DUTY';
  const hasNoActiveInterventions = (agent.activeInterventionsCount || 0) === 0;
  const isAvailableDuty = agent.dutyStatus === 'AVAILABLE';

  let isEligible = isSameOrg && isAccountActive && isNotOffDuty && hasNoActiveInterventions && isAvailableDuty;
  let ineligibilityReason: string | undefined;

  if (!isSameOrg) {
    isEligible = false;
    ineligibilityReason = 'Agent appartenant à une autre organisation';
    warnings.push('Inéligible : Organisation différente');
  } else if (!isAccountActive) {
    isEligible = false;
    ineligibilityReason = 'Compte agent désactivé';
    warnings.push('Inéligible : Compte inactif');
  } else if (!isNotOffDuty) {
    isEligible = false;
    ineligibilityReason = 'Agent hors service (OFF_DUTY)';
    warnings.push('Inéligible : Agent hors service');
  } else if (!hasNoActiveInterventions) {
    isEligible = false;
    ineligibilityReason = `Agent déjà engagé sur ${agent.activeInterventionsCount} mission(s) active(s)`;
    warnings.push(`Inéligible : Mission active en cours (${agent.activeInterventionsCount})`);
  } else if (!isAvailableDuty) {
    isEligible = false;
    ineligibilityReason = `Agent non disponible (statut : ${agent.dutyStatus})`;
    warnings.push(`Inéligible : Statut ${agent.dutyStatus}`);
  }

  // ===========================================================================
  // 2. CRITÈRE 1 : DISPONIBILITÉ OPÉRATIONNELLE (MAX 30 POINTS)
  // ===========================================================================
  let availabilityScore = 0;
  if (agent.dutyStatus === 'AVAILABLE') {
    availabilityScore = DISPATCH_WEIGHTS.availability;
    reasons.push('Agent en service et immédiatement disponible');
  } else if (agent.dutyStatus === 'DISPATCHED') {
    availabilityScore = 10;
    warnings.push('Agent déjà sous ordre de mission (DISPATCHED)');
  } else if (agent.dutyStatus === 'BUSY') {
    availabilityScore = 0;
    warnings.push('Agent engagé sur une intervention en cours (BUSY)');
  } else {
    availabilityScore = 0;
  }

  // ===========================================================================
  // 3. CRITÈRE 2 : DISTANCE & PROXIMITÉ GÉOGRAPHIQUE (MAX 30 POINTS)
  // ===========================================================================
  const distResult = calculateDispatchDistance(
    { latitude: agent.latitude, longitude: agent.longitude },
    { latitude: alert.latitude, longitude: alert.longitude }
  );

  const distanceScore = distResult.score;
  const distanceKm = distResult.distanceKm;

  if (distanceKm !== null) {
    if (distanceKm <= 2.5) {
      reasons.push(`Très proche de l'incident (${distResult.formattedDistance})`);
    } else if (distanceKm <= 5.0) {
      reasons.push(`Proche du site (${distResult.formattedDistance})`);
    } else if (distanceKm > 8.0) {
      warnings.push(`Distance importante (${distResult.formattedDistance})`);
    }
  } else {
    warnings.push('Position GPS de l’agent non renseignée');
  }

  // ===========================================================================
  // 4. CRITÈRE 3 : FRAÎCHEUR DE LA BALISE GPS (MAX 15 POINTS)
  // ===========================================================================
  let gpsAgeSeconds: number | null = null;
  let gpsFreshnessScore = 0;
  let gpsStatus: 'REALTIME' | 'RECENT' | 'ACCEPTABLE' | 'STALE' | 'UNKNOWN' = 'UNKNOWN';
  let gpsFreshnessLabel = 'GPS inconnu';

  if (agent.lastLocationUpdate && agent.latitude !== null && agent.longitude !== null) {
    const updateTime = new Date(agent.lastLocationUpdate).getTime();
    const currentTime = now.getTime();
    const diffSec = Math.max(0, Math.floor((currentTime - updateTime) / 1000));
    gpsAgeSeconds = diffSec;

    if (diffSec <= DISPATCH_GPS_THRESHOLDS.realtimeMaxSec) {
      gpsFreshnessScore = DISPATCH_WEIGHTS.gpsFreshness;
      gpsStatus = 'REALTIME';
      gpsFreshnessLabel = `mis à jour il y a ${diffSec}s`;
      reasons.push(`Signal GPS temps réel (${diffSec} sec)`);
    } else if (diffSec <= DISPATCH_GPS_THRESHOLDS.recentMaxSec) {
      gpsFreshnessScore = 12;
      gpsStatus = 'RECENT';
      gpsFreshnessLabel = `mis à jour il y a ${diffSec}s`;
      reasons.push(`GPS récent (${diffSec} sec)`);
    } else if (diffSec <= DISPATCH_GPS_THRESHOLDS.acceptableMaxSec) {
      gpsFreshnessScore = 8;
      gpsStatus = 'ACCEPTABLE';
      const mins = Math.floor(diffSec / 60);
      gpsFreshnessLabel = `il y a ${mins} min`;
    } else if (diffSec <= DISPATCH_GPS_THRESHOLDS.staleMaxSec) {
      gpsFreshnessScore = 3;
      gpsStatus = 'STALE';
      const mins = Math.floor(diffSec / 60);
      gpsFreshnessLabel = `GPS ancien — ${mins} min`;
      warnings.push(`GPS ancien (${mins} min)`);
    } else {
      gpsFreshnessScore = 0;
      gpsStatus = 'STALE';
      const mins = Math.floor(diffSec / 60);
      gpsFreshnessLabel = `GPS obsolète (> 15 min)`;
      warnings.push('Balise GPS non reçue depuis plus de 15 minutes');
    }
  } else {
    gpsFreshnessLabel = 'Aucun signal GPS';
    warnings.push('Aucun relevé GPS disponible');
  }

  // ===========================================================================
  // 5. CRITÈRE 4 : CHARGE OPÉRATIONNELLE / WORKLOAD (MAX 15 POINTS)
  // ===========================================================================
  const activeInterventions = agent.activeInterventionsCount || 0;
  let workloadScore = 0;

  if (activeInterventions === 0) {
    workloadScore = DISPATCH_WORKLOAD_CONFIG.zeroInterventionsScore;
    reasons.push('Aucune intervention active en cours');
  } else if (activeInterventions === 1) {
    workloadScore = DISPATCH_WORKLOAD_CONFIG.oneInterventionScore;
    warnings.push('Agent ayant déjà 1 intervention assignée');
  } else {
    workloadScore = 0;
    warnings.push(`Forte charge : ${activeInterventions} interventions en cours`);
  }

  // ===========================================================================
  // 6. CRITÈRE 5 : STATUT OPÉRATIONNEL & VÉHICULE (MAX 10 POINTS)
  // ===========================================================================
  let operationalStatusScore = 0;
  const vehicle = (agent.patrolVehicle || '').toLowerCase();
  const isMotorized = vehicle.includes('patrouille') || vehicle.includes('voiture') || vehicle.includes('moto') || vehicle.includes('véhicule') || vehicle.includes('4x4');

  if (isMotorized) {
    operationalStatusScore = DISPATCH_WEIGHTS.operationalStatus;
    reasons.push(`Véhicule d’intervention rapide (${agent.patrolVehicle})`);
  } else {
    operationalStatusScore = 6;
  }

  // ===========================================================================
  // 7. TOTAL SCORE & ESTIMATION ETA
  // ===========================================================================
  const isEmergency = alert.priority === 'CRITICAL' || alert.priority === 'HIGH';
  const etaResult = estimateDispatchArrivalMinutes(distanceKm, isEmergency);

  if (etaResult.durationMinutes !== null) {
    if (etaResult.durationMinutes <= 5) {
      reasons.push(`Arrivée estimée très rapide (${etaResult.formattedEta})`);
    } else {
      reasons.push(`${etaResult.formattedEta}`);
    }
  }

  const scoreBreakdown: DispatchScoreBreakdown = {
    availability: availabilityScore,
    distance: distanceScore,
    gpsFreshness: gpsFreshnessScore,
    workload: workloadScore,
    operationalStatus: operationalStatusScore,
  };

  // Si inéligible, le score total est 0
  const rawTotal = isEligible
    ? availabilityScore + distanceScore + gpsFreshnessScore + workloadScore + operationalStatusScore
    : 0;

  const totalScore = Math.min(100, Math.max(0, rawTotal));

  return {
    agentId: agent.id,
    userId: agent.userId,
    agentName: agent.fullName,
    badgeNumber: agent.badgeNumber,
    phone: agent.phone || '',
    email: agent.email || '',
    patrolVehicle: agent.patrolVehicle || 'Patrouille Alpha Securia',
    dutyStatus: agent.dutyStatus,
    organizationId: agent.organizationId,

    distanceKm,
    formattedDistance: distResult.formattedDistance,
    estimatedArrivalMinutes: etaResult.durationMinutes,
    formattedEta: etaResult.formattedEta,

    hasGps: agent.latitude !== null && agent.longitude !== null,
    gpsAgeSeconds,
    gpsFreshnessLabel,
    gpsStatus,

    activeInterventionsCount: activeInterventions,
    totalScore,
    scoreBreakdown,

    reasons,
    warnings,
    isEligible,
    ineligibilityReason,
  };
}

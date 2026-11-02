/**
 * SECURIA V2 — SMART SLA CALCULATION ENGINE
 * Moteur déterministe de calcul des délais d'intervention et conformité SLA.
 * Basé EXCLUSIVEMENT sur les timestamps réels de la base de données.
 */

import {
  SlaStatus,
  SlaStepKey,
  SlaStepResult,
  AlertSlaSummary,
} from './sla-types';
import {
  DEFAULT_SLA_CONFIG,
  formatDurationSeconds,
} from './sla-config';

interface AlertTimestamps {
  id: string;
  alert_number?: string;
  status: string;
  created_at: string;
  acknowledged_at?: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
}

interface InterventionTimestamps {
  id?: string;
  status?: string;
  assigned_at?: string | null;
  accepted_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  resolved_at?: string | null;
}

/**
 * Calcule le statut et les métriques d'une étape SLA unique
 */
export function calculateSingleStepSla(
  stepKey: SlaStepKey,
  startTimeIso: string | null | undefined,
  endTimeIso: string | null | undefined,
  now: Date = new Date(),
  config = DEFAULT_SLA_CONFIG[stepKey]
): SlaStepResult {
  const targetSeconds = config.targetSeconds;
  const warningSeconds = config.warningSeconds;

  // Étape non démarrée
  if (!startTimeIso) {
    return {
      step: stepKey,
      label: config.label,
      startTime: null,
      endTime: null,
      isCompleted: false,
      isActive: false,
      elapsedSeconds: 0,
      remainingSeconds: targetSeconds,
      targetSeconds,
      warningSeconds,
      status: 'NORMAL',
      formattedElapsed: '00:00',
      formattedRemaining: formatDurationSeconds(targetSeconds),
      percentage: 0,
    };
  }

  const startMs = new Date(startTimeIso).getTime();

  // Étape achevée
  if (endTimeIso) {
    const endMs = new Date(endTimeIso).getTime();
    const elapsedSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const isBreached = elapsedSec > targetSeconds;

    return {
      step: stepKey,
      label: config.label,
      startTime: startTimeIso,
      endTime: endTimeIso,
      isCompleted: true,
      isActive: false,
      elapsedSeconds: elapsedSec,
      remainingSeconds: Math.max(0, targetSeconds - elapsedSec),
      targetSeconds,
      warningSeconds,
      status: isBreached ? 'BREACHED' : 'COMPLETED',
      formattedElapsed: formatDurationSeconds(elapsedSec),
      formattedRemaining: isBreached ? '00:00' : formatDurationSeconds(Math.max(0, targetSeconds - elapsedSec)),
      percentage: Math.min(100, Math.round((elapsedSec / targetSeconds) * 100)),
    };
  }

  // Étape en cours (active)
  const currentMs = now.getTime();
  const elapsedSec = Math.max(0, Math.floor((currentMs - startMs) / 1000));
  const remainingSec = targetSeconds - elapsedSec;

  let status: SlaStatus = 'NORMAL';
  if (elapsedSec > targetSeconds) {
    status = 'BREACHED';
  } else if (elapsedSec >= warningSeconds) {
    status = 'AT_RISK';
  }

  return {
    step: stepKey,
    label: config.label,
    startTime: startTimeIso,
    endTime: null,
    isCompleted: false,
    isActive: true,
    elapsedSeconds: elapsedSec,
    remainingSeconds: remainingSec,
    targetSeconds,
    warningSeconds,
    status,
    formattedElapsed: formatDurationSeconds(elapsedSec),
    formattedRemaining: formatDurationSeconds(remainingSec),
    percentage: Math.min(100, Math.round((elapsedSec / targetSeconds) * 100)),
  };
}

/**
 * Calcule l'ensemble des segments SLA pour une alerte et son intervention associée
 */
export function calculateAlertSla(
  alert?: AlertTimestamps | null,
  intervention?: InterventionTimestamps | null,
  now: Date = new Date()
): AlertSlaSummary {
  const safeAlert = alert || ({} as AlertTimestamps);
  const alertId = safeAlert.id || intervention?.id || 'unknown';
  const alertStatus = safeAlert.status || intervention?.status || 'PENDING';

  // 1. Résolution ordonnée des jalons temporels
  const tCreated = safeAlert.created_at || (intervention as any)?.created_at || new Date().toISOString();
  const tAck = safeAlert.acknowledged_at || (['ACKNOWLEDGED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alertStatus) ? (intervention?.assigned_at || safeAlert.updated_at) : null);
  const tAssigned = intervention?.assigned_at || safeAlert.assigned_at || (['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED'].includes(alertStatus) ? safeAlert.updated_at : null);
  const tAccepted = intervention?.accepted_at || (intervention?.en_route_at || null);
  const tEnRoute = intervention?.en_route_at || safeAlert.en_route_at || null;
  const tArrived = intervention?.arrived_at || safeAlert.arrived_at || null;
  const tResolved = safeAlert.resolved_at || intervention?.resolved_at || (alertStatus === 'RESOLVED' || alertStatus === 'COMPLETED' ? (safeAlert.updated_at || new Date().toISOString()) : null);

  // 2. Calcul de chaque segment SLA
  const stepAck = calculateSingleStepSla('ACKNOWLEDGEMENT', tCreated, tAck, now);
  const stepAssign = calculateSingleStepSla('ASSIGNMENT', tAck || tCreated, tAssigned, now);
  const stepAccept = calculateSingleStepSla('ACCEPTANCE', tAssigned, tAccepted, now);
  const stepDepart = calculateSingleStepSla('DEPARTURE', tAccepted || tAssigned, tEnRoute, now);
  const stepArrival = calculateSingleStepSla('ARRIVAL', tEnRoute, tArrived, now);
  const stepResolution = calculateSingleStepSla('RESOLUTION', tArrived, tResolved, now);
  const stepTotalArrival = calculateSingleStepSla('TOTAL_ARRIVAL', tCreated, tArrived, now);

  const steps: Record<SlaStepKey, SlaStepResult> = {
    ACKNOWLEDGEMENT: stepAck,
    ASSIGNMENT: stepAssign,
    ACCEPTANCE: stepAccept,
    DEPARTURE: stepDepart,
    ARRIVAL: stepArrival,
    RESOLUTION: stepResolution,
    TOTAL_ARRIVAL: stepTotalArrival,
  };

  // 3. Détection de l'étape active courante
  let currentActiveStep: SlaStepResult | null = null;
  if (alertStatus !== 'RESOLVED' && alertStatus !== 'COMPLETED' && alertStatus !== 'CANCELLED' && alertStatus !== 'FALSE_ALARM') {
    if (stepArrival.isActive) currentActiveStep = stepArrival;
    else if (stepDepart.isActive) currentActiveStep = stepDepart;
    else if (stepAccept.isActive) currentActiveStep = stepAccept;
    else if (stepAssign.isActive) currentActiveStep = stepAssign;
    else if (stepAck.isActive) currentActiveStep = stepAck;
    else if (stepResolution.isActive) currentActiveStep = stepResolution;
  }

  // 4. Durée totale cumulée
  const startMs = !isNaN(new Date(tCreated).getTime()) ? new Date(tCreated).getTime() : now.getTime();
  const endMs = tResolved && !isNaN(new Date(tResolved).getTime()) ? new Date(tResolved).getTime() : now.getTime();
  const totalElapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

  // 5. Statut global
  let isBreached = Object.values(steps).some((s) => s.status === 'BREACHED');
  let isAtRisk = Object.values(steps).some((s) => s.status === 'AT_RISK');

  let overallStatus: SlaStatus = 'NORMAL';
  if (isBreached) {
    overallStatus = 'BREACHED';
  } else if (isAtRisk) {
    overallStatus = 'AT_RISK';
  } else if (alertStatus === 'RESOLVED' || alertStatus === 'COMPLETED') {
    overallStatus = 'COMPLETED';
  }

  let delaySummaryText = 'Délai sous contrôle';
  if (currentActiveStep?.status === 'BREACHED') {
    delaySummaryText = `Retard SLA (${currentActiveStep.label} : +${formatDurationSeconds(Math.abs(currentActiveStep.remainingSeconds))})`;
  } else if (currentActiveStep?.status === 'AT_RISK') {
    delaySummaryText = `SLA à risque (${currentActiveStep.label} : reste ${currentActiveStep.formattedRemaining})`;
  } else if (currentActiveStep) {
    delaySummaryText = `${currentActiveStep.label} (reste ${currentActiveStep.formattedRemaining})`;
  }

  const alertNumber = safeAlert.alert_number || (alertId !== 'unknown' ? `SEC-${alertId.substring(0, 6).toUpperCase()}` : 'SEC-000000');

  return {
    alertId,
    alertNumber,
    overallStatus,
    currentActiveStep,
    steps,
    totalElapsedSeconds,
    formattedTotalElapsed: formatDurationSeconds(totalElapsedSeconds),
    isBreached,
    isAtRisk,
    delaySummaryText,
  };
}

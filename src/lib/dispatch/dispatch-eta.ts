/**
 * SECURIA V2 — SMART DISPATCH ETA ESTIMATOR
 * Estimation réaliste et sécurisée du temps d'arrivée opérationnel.
 */

import { DISPATCH_SPEED_CONFIG } from './dispatch-config';

export interface DispatchEtaResult {
  durationMinutes: number | null;
  formattedEta: string;
}

export function estimateDispatchArrivalMinutes(
  distanceKm: number | null,
  isEmergency: boolean = true
): DispatchEtaResult {
  if (distanceKm == null || distanceKm <= 0 || isNaN(distanceKm)) {
    return {
      durationMinutes: null,
      formattedEta: 'ETA indéterminée',
    };
  }

  const baseSpeedKmh = isEmergency
    ? DISPATCH_SPEED_CONFIG.emergencySpeedKmh
    : DISPATCH_SPEED_CONFIG.defaultSpeedKmh;

  const trafficMultiplier = 1 + DISPATCH_SPEED_CONFIG.trafficMarginPercent / 100;
  const effectiveSpeedKmh = baseSpeedKmh / trafficMultiplier;

  const rawHours = distanceKm / effectiveSpeedKmh;
  const rawMinutes = rawHours * 60;

  const durationMinutes = Math.max(
    DISPATCH_SPEED_CONFIG.minimumEtaMinutes,
    Math.ceil(rawMinutes)
  );

  let formattedEta = '';
  if (durationMinutes < 60) {
    formattedEta = `ETA estimée : ${durationMinutes} min`;
  } else {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    formattedEta = `ETA estimée : ${hours}h ${mins > 0 ? `${mins}min` : ''}`;
  }

  return {
    durationMinutes,
    formattedEta,
  };
}

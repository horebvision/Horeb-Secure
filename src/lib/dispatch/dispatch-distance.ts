/**
 * SECURIA V2 — SMART DISPATCH DISTANCE ENGINE
 * Calcul de distance déterministe et scoring de proximité géographique.
 */

import { calculateHaversineDistance, Coordinates } from '@/lib/geo/geo-engine';
import { DISPATCH_DISTANCE_THRESHOLDS } from './dispatch-config';

export interface DistanceCalculationResult {
  distanceKm: number | null;
  formattedDistance: string;
  score: number; // 0 à 30
  label: string;
}

export function isValidGpsCoord(lat: number | null | undefined, lon: number | null | undefined): boolean {
  if (lat == null || lon == null) return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export function calculateDispatchDistance(
  agentCoord: { latitude: number | null; longitude: number | null },
  alertCoord: { latitude: number | null; longitude: number | null }
): DistanceCalculationResult {
  const agentValid = isValidGpsCoord(agentCoord.latitude, agentCoord.longitude);
  const alertValid = isValidGpsCoord(alertCoord.latitude, alertCoord.longitude);

  if (!agentValid || !alertValid) {
    return {
      distanceKm: null,
      formattedDistance: 'Distance inconnue (GPS absent)',
      score: 0,
      label: 'Position GPS indéterminée',
    };
  }

  const c1: Coordinates = { latitude: agentCoord.latitude!, longitude: agentCoord.longitude! };
  const c2: Coordinates = { latitude: alertCoord.latitude!, longitude: alertCoord.longitude! };

  const rawDistKm = calculateHaversineDistance(c1, c2);
  const distanceKm = Math.round(rawDistKm * 10) / 10;

  // Calcul du score basé sur les seuils configurés
  let score = 0;
  let label = 'Plus de 12 km (très éloigné)';

  for (const threshold of DISPATCH_DISTANCE_THRESHOLDS) {
    if (distanceKm <= threshold.maxKm) {
      score = threshold.score;
      label = threshold.label;
      break;
    }
  }

  const formattedDistance =
    distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1).replace('.', ',')} km`;

  return {
    distanceKm,
    formattedDistance,
    score,
    label,
  };
}

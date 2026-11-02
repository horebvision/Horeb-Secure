/**
 * SECURIA V2 — SMART DISPATCH CONFIGURATION
 * Paramètres centralisés, pondérations et seuils opérationnels.
 * RÈGLE : Ne jamais disperser ces valeurs dans d'autres fichiers.
 */

export const DISPATCH_WEIGHTS = {
  availability: 30, // Disponibilité immédiate de l'agent
  distance: 30, // Proximité géographique avec le site d'incident
  gpsFreshness: 15, // Fraîcheur temporelle de la dernière balise GPS
  workload: 15, // Charge opérationnelle (missions en cours)
  operationalStatus: 10, // Compte actif & moyen de déplacement patrouille
} as const;

export const DISPATCH_SPEED_CONFIG = {
  defaultSpeedKmh: 35, // Vitesse standard en agglomération
  emergencySpeedKmh: 45, // Vitesse d'intervention prioritaire sécurisée
  trafficMarginPercent: 15, // +15% pour feux, intersections et ralentissements
  minimumEtaMinutes: 1, // Temps incompressible minimum
} as const;

export const DISPATCH_DISTANCE_THRESHOLDS = [
  { maxKm: 1.0, score: 30, label: 'Moins de 1 km (immédiat)' },
  { maxKm: 2.5, score: 25, label: '1 à 2,5 km (très proche)' },
  { maxKm: 5.0, score: 18, label: '2,5 à 5 km (proche)' },
  { maxKm: 8.0, score: 10, label: '5 à 8 km (moyen)' },
  { maxKm: 12.0, score: 5, label: '8 à 12 km (éloigné)' },
] as const;

export const DISPATCH_GPS_THRESHOLDS = {
  realtimeMaxSec: 30, // Moins de 30 secondes -> 100% (15/15 pts)
  recentMaxSec: 120, // 30s à 2 min -> 80% (12/15 pts)
  acceptableMaxSec: 300, // 2 min à 5 min -> 53% (8/15 pts)
  staleMaxSec: 900, // 5 min à 15 min -> 20% (3/15 pts)
} as const;

export const DISPATCH_WORKLOAD_CONFIG = {
  zeroInterventionsScore: 15, // 0 mission en cours -> 15 pts
  oneInterventionScore: 5, // 1 mission en cours -> 5 pts
  maxInterventionsAllowed: 2, // Seuil de saturation
} as const;

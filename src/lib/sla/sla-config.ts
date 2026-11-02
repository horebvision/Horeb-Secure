/**
 * SECURIA V2 — CONFIGURATION CENTRALISÉE DES SLA
 * Paramètres temporels et seuils d'alerte pour chaque étape opérationnelle.
 * RÈGLE : Ne jamais disperser ces valeurs dans d'autres fichiers ou composants.
 */

import { SlaStepKey, SlaStepConfig } from './sla-types';

export const DEFAULT_SLA_CONFIG: Record<SlaStepKey, SlaStepConfig> = {
  ACKNOWLEDGEMENT: {
    label: 'Prise en charge SOC',
    description: 'Délai entre le déclenchement de l’alerte et l’accusé de réception SOC (ACK)',
    targetSeconds: 60, // 1 minute max
    warningSeconds: 45, // Alerte à 45s
  },
  ASSIGNMENT: {
    label: 'Affectation Patrouille',
    description: 'Délai entre l’ACK SOC et l’affectation d’un patrouilleur disponible',
    targetSeconds: 120, // 2 minutes max
    warningSeconds: 90, // Alerte à 1m30s
  },
  ACCEPTANCE: {
    label: 'Confirmation Agent',
    description: 'Délai accordé à l’agent pour accepter l’ordre de mission reçu',
    targetSeconds: 60, // 1 minute max
    warningSeconds: 45, // Alerte à 45s
  },
  DEPARTURE: {
    label: 'Mise en route',
    description: 'Délai entre l’acceptation et le départ effectif du véhicule (EN_ROUTE)',
    targetSeconds: 60, // 1 minute max
    warningSeconds: 45, // Alerte à 45s
  },
  ARRIVAL: {
    label: 'Trajet vers site',
    description: 'Délai de déplacement prioritaire jusqu’à l’arrivée physique sur le site (ON_SITE)',
    targetSeconds: 600, // 10 minutes max en agglomération
    warningSeconds: 480, // Alerte à 8 minutes
  },
  RESOLUTION: {
    label: 'Levée de doute & Clôture',
    description: 'Délai d’inspection sur site jusqu’à la transmission du rapport de mission certifié',
    targetSeconds: 1200, // 20 minutes max
    warningSeconds: 900, // Alerte à 15 minutes
  },
  TOTAL_ARRIVAL: {
    label: 'Délai Total d’Intervention',
    description: 'Délai cumulé de l’alerte client jusqu’à l’arrivée de la patrouille sur les lieux',
    targetSeconds: 900, // 15 minutes max
    warningSeconds: 720, // Alerte à 12 minutes
  },
};

/**
 * Formatage standardisé des durées (ex: 04:21 ou 12m 30s)
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const isNegative = totalSeconds < 0;
  const absSec = Math.abs(Math.floor(totalSeconds));

  const minutes = Math.floor(absSec / 60);
  const seconds = absSec % 60;

  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');

  return isNegative ? `-${minStr}:${secStr}` : `${minStr}:${secStr}`;
}

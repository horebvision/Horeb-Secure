/**
 * SECURIA V2 — SLA & RESPONSE TIME ENGINE
 * Types et interfaces pour la mesure des délais opérationnels et conformité SLA.
 */

export type SlaStatus = 'NORMAL' | 'AT_RISK' | 'BREACHED' | 'COMPLETED';

export type SlaStepKey =
  | 'ACKNOWLEDGEMENT' // T1 : Déclenchement alerte -> Prise en charge SOC (ACK)
  | 'ASSIGNMENT'      // T2 : ACK SOC -> Affectation de l'agent
  | 'ACCEPTANCE'      // T3 : Affectation -> Acceptation mission par l'agent
  | 'DEPARTURE'       // T4 : Acceptation -> Mise en mouvement (EN_ROUTE)
  | 'ARRIVAL'         // T5 : Départ -> Arrivée sur site (ON_SITE / ARRIVED)
  | 'RESOLUTION'      // T6 : Arrivée sur site -> Clôture avec rapport
  | 'TOTAL_ARRIVAL';  // TOTAL : Déclenchement alerte -> Arrivée effective sur site

export interface SlaStepConfig {
  label: string;
  description: string;
  targetSeconds: number;  // Seuil cible (vert / NORMAL)
  warningSeconds: number; // Seuil d'alerte (orange / AT_RISK)
}

export interface SlaStepResult {
  step: SlaStepKey;
  label: string;
  startTime: string | null;
  endTime: string | null;
  isCompleted: boolean;
  isActive: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  targetSeconds: number;
  warningSeconds: number;
  status: SlaStatus;
  formattedElapsed: string;
  formattedRemaining: string;
  percentage: number; // 0 à 100% de progression
}

export interface AlertSlaSummary {
  alertId: string;
  alertNumber: string;
  overallStatus: SlaStatus;
  currentActiveStep: SlaStepResult | null;
  steps: Record<SlaStepKey, SlaStepResult>;
  totalElapsedSeconds: number;
  formattedTotalElapsed: string;
  isBreached: boolean;
  isAtRisk: boolean;
  delaySummaryText: string;
}

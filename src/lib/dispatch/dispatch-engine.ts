/**
 * SECURIA V2 — SMART DISPATCH ENGINE
 * Orchestrateur de calcul, classement déterministe et génération de recommandation.
 */

import {
  DispatchAgentInput,
  DispatchAlertInput,
  DispatchCandidate,
  DispatchContext,
  SmartDispatchRecommendation,
} from './dispatch-types';
import { calculateDispatchScore } from './dispatch-score';

/**
 * Évalue et classe tous les agents candidats pour une alerte donnée
 */
export function rankCandidates(
  agents: DispatchAgentInput[],
  alert: DispatchAlertInput,
  context?: DispatchContext
): DispatchCandidate[] {
  // 1. Calcul du score individuel pour chaque agent
  const evaluated = agents.map((agent) =>
    calculateDispatchScore(agent, alert, context)
  );

  // 2. Tri déterministe
  return evaluated.sort((a, b) => {
    // A. Éligibilité d'abord (les inéligibles vont à la fin)
    if (a.isEligible && !b.isEligible) return -1;
    if (!a.isEligible && b.isEligible) return 1;

    // B. Score total décroissant
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }

    // C. Si scores identiques : départage par distance croissante (le plus proche gagne)
    if (a.distanceKm !== null && b.distanceKm !== null) {
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
    } else if (a.distanceKm !== null && b.distanceKm === null) {
      return -1;
    } else if (a.distanceKm === null && b.distanceKm !== null) {
      return 1;
    }

    // D. Si distances identiques : départage par fraîcheur GPS (le plus récent gagne)
    if (a.gpsAgeSeconds !== null && b.gpsAgeSeconds !== null) {
      if (a.gpsAgeSeconds !== b.gpsAgeSeconds) {
        return a.gpsAgeSeconds - b.gpsAgeSeconds;
      }
    }

    // E. Si tout est identique : départage par moindre charge active
    return a.activeInterventionsCount - b.activeInterventionsCount;
  });
}

/**
 * Génère la recommandation complète pour le Centre Opérationnel (SOC)
 */
export function generateSmartDispatchRecommendation(
  agents: DispatchAgentInput[],
  alert: DispatchAlertInput,
  context?: DispatchContext
): SmartDispatchRecommendation {
  const ranked = rankCandidates(agents, alert, context);
  const eligible = ranked.filter((c) => c.isEligible && c.totalScore > 0);

  const recommendedAgent = eligible.length > 0 ? eligible[0] : null;

  return {
    alertId: alert.id,
    alertNumber: alert.alertNumber,
    organizationId: alert.organizationId,
    alertPriority: alert.priority,
    alertType: alert.type,
    locationAddress: alert.locationAddress || 'Position GPS de l’incident',
    recommendedAgent,
    candidates: ranked,
    totalCandidatesEvaluated: ranked.length,
    eligibleCandidatesCount: eligible.length,
    generatedAt: (context?.now || new Date()).toISOString(),
  };
}

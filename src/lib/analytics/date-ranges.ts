/**
 * SECURIA V2 — PHASE 5 : DATE RANGES RESOLVER
 * Résout les fenêtres d'analyse temporelle et leurs périodes précédentes équivalentes pour comparaison
 */

import { DateRangeKey, DateRangeResolved } from './types';

export function resolveDateRange(
  rangeKey: DateRangeKey = '30d',
  customStart?: string,
  customEnd?: string
): DateRangeResolved {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date(now);
  let label = '30 derniers jours';

  switch (rangeKey) {
    case 'today': {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      label = "Aujourd'hui";
      break;
    }
    case '7d': {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      label = '7 derniers jours';
      break;
    }
    case '30d': {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      label = '30 derniers jours';
      break;
    }
    case '90d': {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 90);
      label = '90 derniers jours';
      break;
    }
    case 'custom': {
      if (customStart) {
        startDate = new Date(customStart);
      } else {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
      }
      if (customEnd) {
        endDate = new Date(customEnd);
      }
      label = 'Période personnalisée';
      break;
    }
  }

  // Calcul de la période précédente équivalente (pour % de variation)
  const durationMs = endDate.getTime() - startDate.getTime();
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = new Date(previousEndDate.getTime() - durationMs);

  return {
    key: rangeKey,
    startDate,
    endDate,
    label,
    previousStartDate,
    previousEndDate,
  };
}

export function formatDurationToMinutesOrSeconds(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds < 0) return 'N/D';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins.toString().padStart(2, '0')}m`;
}

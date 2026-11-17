import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * format() de date-fns lève une RangeError (« Invalid time value ») sur une date absente ou
 * invalide, ce qui fait tomber tout l'écran. Une seule alerte mal horodatée ne doit pas
 * rendre la salle de contrôle inutilisable : on affiche un repli à la place.
 */
export function formatDateSafe(
  value: string | number | Date | null | undefined,
  pattern: string,
  fallback = '—'
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return format(date, pattern, { locale: fr });
}

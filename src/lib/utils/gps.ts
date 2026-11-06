// ==============================================================================
// MODULE GÉOLOCALISATION HAUTE PRÉCISION (GPS RÉEL, QUALITÉ & STREAMING)
// ==============================================================================

export type GpsQualityLevel = 'EXCELLENT' | 'BON' | 'MOYEN' | 'FAIBLE' | 'INDISPONIBLE';
export type GpsLocationSource = 'GPS' | 'NETWORK' | 'FALLBACK';

export interface HighAccuracyPosition {
  latitude: number;
  longitude: number;
  accuracy: number; // en mètres
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  quality: GpsQualityLevel;
  source: GpsLocationSource;
}

export type GpsLocationResult = HighAccuracyPosition;

/**
 * Calcule la distance géodésique (en mètres) entre deux coordonnées GPS
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Détermine la qualité de réception GPS selon la marge d'erreur (accuracy)
 */
export function getGpsQuality(accuracy: number | null | undefined): GpsQualityLevel {
  if (accuracy === null || accuracy === undefined || isNaN(accuracy)) {
    return 'INDISPONIBLE';
  }
  if (accuracy <= 10) return 'EXCELLENT';
  if (accuracy <= 25) return 'BON';
  if (accuracy <= 50) return 'MOYEN';
  return 'FAIBLE';
}

/**
 * Retourne le badge visuel et la couleur selon le niveau de qualité GPS
 */
export function getGpsQualityBadge(quality: GpsQualityLevel): {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotColor: string;
} {
  switch (quality) {
    case 'EXCELLENT':
      return {
        label: 'GPS EXCELLENT',
        colorClass: 'text-emerald-400',
        bgClass: 'bg-emerald-950/80',
        borderClass: 'border-emerald-500/60',
        dotColor: 'bg-emerald-500',
      };
    case 'BON':
      return {
        label: 'GPS BON',
        colorClass: 'text-teal-400',
        bgClass: 'bg-teal-950/80',
        borderClass: 'border-teal-500/60',
        dotColor: 'bg-teal-500',
      };
    case 'MOYEN':
      return {
        label: 'GPS MOYEN',
        colorClass: 'text-amber-400',
        bgClass: 'bg-amber-950/80',
        borderClass: 'border-amber-500/60',
        dotColor: 'bg-amber-500',
      };
    case 'FAIBLE':
      return {
        label: 'GPS FAIBLE',
        colorClass: 'text-rose-400',
        bgClass: 'bg-rose-950/80',
        borderClass: 'border-rose-500/60',
        dotColor: 'bg-rose-500',
      };
    case 'INDISPONIBLE':
    default:
      return {
        label: 'GPS INDISPONIBLE',
        colorClass: 'text-slate-400',
        bgClass: 'bg-slate-900',
        borderClass: 'border-slate-800',
        dotColor: 'bg-slate-500',
      };
  }
}

/**
 * Vérifie si des coordonnées GPS se situent à l'intérieur du territoire de la Côte d'Ivoire
 */
export function isWithinCoteDIvoire(lat: number, lon: number): boolean {
  return lat >= 4.0 && lat <= 11.0 && lon >= -9.0 && lon <= -2.5;
}

/**
 * Obtient la position instantanée avec haute précision matérielle et fallback réseau résilient à 2 étages.
 * Étage 1 : GPS Haute Précision par satellite (Hardware / GNSS).
 * Étage 2 (Fallback automatique) : Réseau cellulaire / Wi-Fi si l'agent est en intérieur ou zone d'ombre.
 */
export function getCurrentHighAccuracyPosition(options?: {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
}): Promise<HighAccuracyPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      return reject(new Error('La géolocalisation n’est pas supportée par ce terminal.'));
    }

    const highTimeout = options?.timeoutMs || 8000;
    const allowHighAccuracy = options?.enableHighAccuracy !== undefined ? options.enableHighAccuracy : true;

    const executeFallback = () => {
      navigator.geolocation.getCurrentPosition(
        (netPos) => {
          const accuracy = netPos.coords.accuracy;
          resolve({
            latitude: netPos.coords.latitude,
            longitude: netPos.coords.longitude,
            accuracy: Math.round(accuracy * 10) / 10,
            altitude: netPos.coords.altitude,
            heading: netPos.coords.heading,
            speed: netPos.coords.speed,
            timestamp: netPos.timestamp,
            quality: getGpsQuality(accuracy),
            source: 'NETWORK',
          });
        },
        (netErr) => {
          let msg = 'Position GPS introuvable.';
          if (netErr.code === netErr.PERMISSION_DENIED) {
            msg = 'Autorisation de géolocalisation refusée par l’utilisateur.';
          } else if (netErr.code === netErr.TIMEOUT) {
            msg = 'Délai dépassé pour la capture GPS / Réseau.';
          }
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: false,
          maximumAge: 15000,
          timeout: 10000,
        }
      );
    };

    if (!allowHighAccuracy) {
      executeFallback();
      return;
    }

    // Étage 1 : Tentative GPS Haute Précision
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const accuracy = pos.coords.accuracy;
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(accuracy * 10) / 10,
          altitude: pos.coords.altitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
          quality: getGpsQuality(accuracy),
          source: 'GPS',
        });
      },
      (err) => {
        // Si permission refusée, ne pas réessayer en fallback
        if (err.code === err.PERMISSION_DENIED) {
          return reject(new Error('Autorisation de géolocalisation refusée par l’utilisateur.'));
        }
        // Sinon (Timeout ou position indisponible par satellite), basculer immédiatement sur le réseau cellulaire/Wi-Fi
        executeFallback();
      },
      {
        enableHighAccuracy: true,
        maximumAge: options?.maximumAge !== undefined ? options.maximumAge : 0,
        timeout: highTimeout,
      }
    );
  });
}

/** Agent immobile : une position de contrôle par minute suffit à prouver qu'il est en ligne. */
const STATIONARY_HEARTBEAT_MS = 60000;

/**
 * Écoute continue des déplacements (watchPosition) avec limitation intelligente de bande passante et streaming temps réel
 */
export function watchAgentLivePosition(
  onUpdate: (pos: HighAccuracyPosition) => void,
  onError?: (err: Error) => void,
  options?: { minDistanceMeters?: number; minIntervalMs?: number }
): () => void {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    if (onError) onError(new Error('Géolocalisation indisponible'));
    return () => {};
  }

  let lastSentTime = 0;
  let lastLat: number | null = null;
  let lastLon: number | null = null;
  const minInterval = options?.minIntervalMs ?? 3000;
  const minDistance = options?.minDistanceMeters ?? 3;

  const handlePosition = (pos: GeolocationPosition, source: GpsLocationSource = 'GPS') => {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;

    if (lastLat !== null && lastLon !== null) {
      const dist = calculateDistance(lastLat, lastLon, lat, lon);
      const timeDiff = now - lastSentTime;

      // 1. Intervalle minimal toujours respecté. Auparavant, tout déplacement au-delà du seuil
      //    était envoyé immédiatement : en véhicule, une requête par seconde et par agent.
      if (timeDiff < minInterval) return;
      // 2. Agent immobile (sous le seuil) : simple position de contrôle toutes les 60 s.
      if (dist < minDistance && timeDiff < STATIONARY_HEARTBEAT_MS) return;
    }

    lastLat = lat;
    lastLon = lon;
    lastSentTime = now;

    onUpdate({
      latitude: lat,
      longitude: lon,
      accuracy: Math.round(accuracy * 10) / 10,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
      quality: getGpsQuality(accuracy),
      source,
    });
  };

  const watchId = navigator.geolocation.watchPosition(
    (pos) => handlePosition(pos, 'GPS'),
    (err) => {
      // Si la précision satellite décroche, on tente un fallback ponctuel
      if (err.code !== err.PERMISSION_DENIED) {
        navigator.geolocation.getCurrentPosition(
          (netPos) => handlePosition(netPos, 'NETWORK'),
          (netErr) => {
            if (onError) onError(new Error(netErr.message));
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 10000 }
        );
      } else if (onError) {
        onError(new Error('Autorisation de géolocalisation refusée.'));
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

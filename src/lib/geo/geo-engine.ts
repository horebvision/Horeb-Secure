/**
 * MOTEUR GÉOSPATIAL ET TÉLÉMÉTRIE SECURIA (PROD-READY)
 * Implémente :
 * - Calcul de distance orthodromique (Formule de Haversine)
 * - Estimation de temps d'arrivée (ETA) avec vitesse d'intervention prioritaire
 * - Détection de franchissement de zone de sécurité (Géofencing point-in-polygon & radial)
 * - Obfuscation / Anonymisation des coordonnées GPS pour la protection de la vie privée
 * - Interpolation de trajectoire pour simulation de télémétrie temps réel
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceZone {
  id: string;
  name: string;
  radiusMeters: number;
  center: Coordinates;
  polygon?: Coordinates[];
}

export interface EtaResult {
  distanceKm: number;
  distanceMeters: number;
  durationMinutes: number;
  formattedDistance: string;
  formattedEta: string;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Calcul précis de la distance entre deux coordonnées GPS via la formule de Haversine
 */
export function calculateHaversineDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  if (
    coord1.latitude == null ||
    coord1.longitude == null ||
    coord2.latitude == null ||
    coord2.longitude == null
  ) {
    return 0;
  }

  const toRad = (angle: number) => (angle * Math.PI) / 180;

  const dLat = toRad(coord2.latitude - coord1.latitude);
  const dLon = toRad(coord2.longitude - coord1.longitude);

  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = EARTH_RADIUS_KM * c;

  return Math.round(distanceKm * 1000) / 1000; // arrondi au millième (1m)
}

/**
 * Estimation du temps d'arrivée (ETA)
 * @param distanceKm Distance en kilomètres
 * @param isEmergency Si vrai, vitesse d'intervention prioritaire avec gyrophare (50 km/h urbain) vs standard (35 km/h)
 */
export function estimateArrivalTime(
  distanceKm: number,
  isEmergency: boolean = true
): EtaResult {
  const averageSpeedKmH = isEmergency ? 50 : 35; // km/h en agglomération
  const trafficFactor = 1.15; // +15% de marge pour feux et intersections
  const effectiveSpeed = averageSpeedKmH / trafficFactor;

  const hours = distanceKm / effectiveSpeed;
  const rawMinutes = hours * 60;
  // Temps incompressible minimum : 1 minute
  const durationMinutes = Math.max(1, Math.ceil(rawMinutes));

  const distanceMeters = Math.round(distanceKm * 1000);
  const formattedDistance =
    distanceKm < 1 ? `${distanceMeters} m` : `${distanceKm.toFixed(1)} km`;

  const formattedEta =
    durationMinutes < 60
      ? `${durationMinutes} min`
      : `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}min`;

  return {
    distanceKm,
    distanceMeters,
    durationMinutes,
    formattedDistance,
    formattedEta,
  };
}

/**
 * Vérifie si un point GPS se trouve dans un rayon donné (Géofence circulaire)
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusMeters: number
): boolean {
  const distKm = calculateHaversineDistance(center, point);
  return distKm * 1000 <= radiusMeters;
}

/**
 * Algorithme de Ray-Casting pour tester si un point est à l'intérieur d'un polygone géospatial
 */
export function isPointInPolygon(
  point: Coordinates,
  polygon: Coordinates[]
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Anonymisation / Obfuscation des coordonnées GPS pour la confidentialité publique
 * Réduit la précision à environ 1-2 km pour masquer l'emplacement exact des particuliers
 */
export function obfuscateCoordinates(
  coord: Coordinates,
  decimals: number = 2
): Coordinates {
  const factor = Math.pow(10, decimals);
  return {
    latitude: Math.round(coord.latitude * factor) / factor,
    longitude: Math.round(coord.longitude * factor) / factor,
  };
}

/**
 * Interpolation de trajectoire (pour animation patrouille en déplacement)
 */
export function interpolateCoordinates(
  start: Coordinates,
  end: Coordinates,
  fraction: number // de 0.0 à 1.0
): Coordinates {
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * clampedFraction,
    longitude:
      start.longitude + (end.longitude - start.longitude) * clampedFraction,
  };
}

export interface RoadRouteResult {
  coordinates: [number, number][]; // format [latitude, longitude][] pour Leaflet
  distanceMeters: number;
  durationSeconds: number;
  isRoadNetwork: boolean;
}

/**
 * Calcule l'itinéraire routier réel via le réseau routier OpenStreetMap / OSRM.
 * Bascule en douceur sur la ligne droite en cas de coupure réseau ou hors-ligne.
 */
export async function fetchRoadRoute(
  start: Coordinates,
  destination: Coordinates
): Promise<RoadRouteResult> {
  const straightLine: [number, number][] = [
    [start.latitude, start.longitude],
    [destination.latitude, destination.longitude],
  ];
  const haversineDistKm = calculateHaversineDistance(start, destination);

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        // OSRM retourne [lon, lat], on convertit en [lat, lon] pour Leaflet
        const latLngs: [number, number][] = route.geometry.coordinates.map(
          ([lon, lat]: [number, number]) => [lat, lon]
        );
        return {
          coordinates: latLngs,
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          isRoadNetwork: true,
        };
      }
    }
  } catch (e) {
    // Mode dégradé sécurisé : utilisation de la trajectoire directe
  }

  return {
    coordinates: straightLine,
    distanceMeters: Math.round(haversineDistKm * 1000),
    durationSeconds: Math.round((haversineDistKm / 45) * 3600),
    isRoadNetwork: false,
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchAgentLivePosition } from '@/lib/utils/gps';

// Simule navigator.geolocation.watchPosition et pilote le temps
let emit: (lat: number, lon: number) => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
  const geolocation = {
    watchPosition: (ok: (p: GeolocationPosition) => void) => {
      emit = (lat, lon) =>
        ok({
          coords: { latitude: lat, longitude: lon, accuracy: 5, altitude: null, heading: null, speed: null, altitudeAccuracy: null },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition);
      return 1;
    },
    clearWatch: () => {},
    getCurrentPosition: () => {},
  };
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { geolocation });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ~0,0001° de latitude ≈ 11 m
const step = 0.0002; // ≈ 22 m

describe('Limitation des envois GPS', () => {
  it('en véhicule (une position par seconde), n’envoie qu’une fois toutes les 10 s', () => {
    const sent: number[] = [];
    watchAgentLivePosition(() => sent.push(Date.now()), undefined, { minDistanceMeters: 15, minIntervalMs: 10000 });
    for (let s = 0; s < 60; s++) {
      emit(5.3 + s * step, -4.0);
      vi.advanceTimersByTime(1000);
    }
    // Avant le correctif : 60 envois en 60 s. Après : 1 toutes les 10 s.
    expect(sent.length).toBeLessThanOrEqual(6);
    expect(sent.length).toBeGreaterThanOrEqual(5);
  });

  it('à l’arrêt, n’envoie qu’une position de contrôle par minute', () => {
    const sent: number[] = [];
    watchAgentLivePosition(() => sent.push(Date.now()), undefined, { minDistanceMeters: 15, minIntervalMs: 10000 });
    for (let s = 0; s < 180; s++) {
      emit(5.3, -4.0);
      vi.advanceTimersByTime(1000);
    }
    expect(sent.length).toBe(3); // t=0, t=60 s, t=120 s
  });
});

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

let channelSeq = 0;
/** Suffixe unique : chaque abonnement possède son propre canal (voir l'explication dans le hook). */
export function uniqueChannelName(base: string): string {
  channelSeq += 1;
  return `${base}#${Date.now().toString(36)}-${channelSeq}`;
}

export type RealtimeStatus ='CONNECTING' | 'CONNECTED' | 'FALLBACK_POLLING' | 'DISCONNECTED';

interface UseRealtimeOptions {
  channelName: string;
  table?: 'alerts' | 'interventions' | 'notifications';
  filter?: string;
  onPayload?: (payload: any) => void;
  onRefresh?: () => void | Promise<void>;
  pollIntervalFallbackMs?: number; // défaut 15 s si Realtime inactif (évite l'emballement si la limite de connexions est atteinte)
  pollIntervalHeartbeatMs?: number; // défaut 60 s si Realtime actif (filet de sécurité)
  enabled?: boolean;
}

/**
 * Custom React hook ensuring:
 * PRIMARY  = Supabase Realtime (WebSockets)
 * FALLBACK = Adaptive Polling (Active when Realtime drops or connects)
 */
export function useRealtimeSubscription({
  channelName,
  table = 'alerts',
  filter,
  onPayload,
  onRefresh,
  pollIntervalFallbackMs = 15000,
  pollIntervalHeartbeatMs = 60000,
  enabled = true,
}: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const onPayloadRef = useRef(onPayload);

  onRefreshRef.current = onRefresh;
  onPayloadRef.current = onPayload;
  const hasRefresh = !!onRefresh;

  // Regroupe les rafales d'événements (ex. 20 changements simultanés) en un seul rechargement :
  // sans cela, chaque événement déclenchait un appel API complet sur chaque console connectée.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      onRefreshRef.current?.();
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  // Supabase Realtime Subscription setup
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let supabase: ReturnType<typeof getBrowserClient>;
    let channel: RealtimeChannel;
    let cancelled = false;
    setStatus('CONNECTING');

    try {
      supabase = getBrowserClient();

      // Nom de canal UNIQUE par abonnement. supabase.channel(nom) renvoie le canal existant
      // s'il porte déjà ce nom : deux composants identiques montés en même temps (ex. le centre
      // de notifications de la barre de navigation ET celui de /dispatch), ou un remontage avant
      // la fin du removeChannel asynchrone, faisaient lever « cannot add postgres_changes
      // callbacks after subscribe() » et plantaient toute la page.
      // Aucun broadcast serveur ne cible ces noms (cf. orgChannelName) : le suffixe ne coupe rien.
      channel = supabase.channel(uniqueChannelName(channelName));

      // 1. Écoute des mutations PostgreSQL (INSERT, UPDATE, DELETE)
      const changeConfig: any = {
        event: '*',
        schema: 'public',
        table,
      };
      if (filter) {
        changeConfig.filter = filter;
      }

      channel.on('postgres_changes', changeConfig, (payload) => {
        onPayloadRef.current?.(payload);
        scheduleRefresh();
      });

      // 2. Écoute des broadcasts applicatifs (ex: avertissements urgents SOC)
      channel.on('broadcast', { event: '*' }, (payload) => {
        onPayloadRef.current?.(payload);
        scheduleRefresh();
      });

      // 3. Gestion du cycle de vie du canal
      channel.subscribe((subStatus, err) => {
        if (cancelled) return;
        if (subStatus === 'SUBSCRIBED') {
          setStatus('CONNECTED');
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
          console.warn(`[Realtime] Coupure (${subStatus}) sur ${channelName}, bascule en polling de secours:`, err);
          setStatus('FALLBACK_POLLING');
        }
      });
    } catch (err) {
      // Le temps réel est un confort : son échec ne doit jamais faire tomber l'écran.
      console.warn(`[Realtime] Abonnement impossible (${channelName}), polling de secours:`, err);
      setStatus('FALLBACK_POLLING');
      return;
    }

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channelRef.current = null;
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [channelName, table, filter, enabled, scheduleRefresh]);

  // Polling de secours : espacé si Realtime actif (simple filet de sécurité), plus fréquent sinon.
  // Suspendu quand l'onglet est masqué (aucune requête pour un écran que personne ne regarde),
  // avec un rafraîchissement immédiat au retour sur l'onglet.
  useEffect(() => {
    if (!enabled || !hasRefresh || typeof document === 'undefined') return;

    const activeIntervalMs = status === 'CONNECTED' ? pollIntervalHeartbeatMs : pollIntervalFallbackMs;

    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      onRefreshRef.current?.();
    }, activeIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') onRefreshRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // onRefresh est lu via sa ref : une fonction recréée à chaque rendu ne réinitialise plus le minuteur
  }, [status, enabled, hasRefresh, pollIntervalFallbackMs, pollIntervalHeartbeatMs]);

  const forceRefresh = useCallback(() => {
    onRefreshRef.current?.();
  }, []);

  return {
    status,
    isRealtimeActive: status === 'CONNECTED',
    forceRefresh,
  };
}

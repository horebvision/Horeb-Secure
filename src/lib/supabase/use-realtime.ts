'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeStatus = 'CONNECTING' | 'CONNECTED' | 'FALLBACK_POLLING' | 'DISCONNECTED';

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

    const supabase = getBrowserClient();
    setStatus('CONNECTING');

    const channel = supabase.channel(channelName);

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
      if (subStatus === 'SUBSCRIBED') {
        console.log(`[Realtime Primary] Connecté avec succès au canal: ${channelName}`);
        setStatus('CONNECTED');
      } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
        console.warn(`[Realtime Primary] Échec ou coupure Realtime (${subStatus}), bascule automatique en FALLBACK POLLING:`, err);
        setStatus('FALLBACK_POLLING');
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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

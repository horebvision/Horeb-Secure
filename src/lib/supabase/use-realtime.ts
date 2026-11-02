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
  pollIntervalFallbackMs?: number; // default 4000ms when Realtime is inactive
  pollIntervalHeartbeatMs?: number; // default 30000ms when Realtime is active
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
  pollIntervalFallbackMs = 4000,
  pollIntervalHeartbeatMs = 30000,
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

  // Fallback Polling Loop : Fréquent (4s) si Realtime déconnecté, Espacé (30s) si Realtime actif
  useEffect(() => {
    if (!enabled || !hasRefresh) return;

    const activeIntervalMs = status === 'CONNECTED' ? pollIntervalHeartbeatMs : pollIntervalFallbackMs;

    const timer = setInterval(() => {
      if (status !== 'CONNECTED') {
        console.debug('[Realtime Fallback] Exécution du polling de secours...');
      }
      onRefreshRef.current?.();
    }, activeIntervalMs);

    return () => clearInterval(timer);
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

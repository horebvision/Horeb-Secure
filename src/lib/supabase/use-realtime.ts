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
      console.log(`[Realtime Primary] Event on ${table}:`, payload.eventType, (payload.new as any)?.id || '');
      onPayloadRef.current?.(payload);
      onRefreshRef.current?.();
    });

    // 2. Écoute des broadcasts applicatifs (ex: avertissements urgents SOC)
    channel.on('broadcast', { event: '*' }, (payload) => {
      console.log(`[Realtime Primary] Broadcast received on ${channelName}:`, payload.event);
      onPayloadRef.current?.(payload);
      onRefreshRef.current?.();
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
  }, [channelName, table, filter, enabled]);

  // Fallback Polling Loop : Fréquent (4s) si Realtime déconnecté, Espacé (30s) si Realtime actif
  useEffect(() => {
    if (!enabled || !onRefresh) return;

    const activeIntervalMs = status === 'CONNECTED' ? pollIntervalHeartbeatMs : pollIntervalFallbackMs;

    const timer = setInterval(() => {
      if (status !== 'CONNECTED') {
        console.debug('[Realtime Fallback] Exécution du polling de secours...');
      }
      onRefreshRef.current?.();
    }, activeIntervalMs);

    return () => clearInterval(timer);
  }, [status, enabled, onRefresh, pollIntervalFallbackMs, pollIntervalHeartbeatMs]);

  const forceRefresh = useCallback(() => {
    onRefreshRef.current?.();
  }, []);

  return {
    status,
    isRealtimeActive: status === 'CONNECTED',
    forceRefresh,
  };
}

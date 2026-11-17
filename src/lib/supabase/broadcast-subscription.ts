'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

type Handler = (payload: { event: string; payload?: Record<string, unknown> }) => void;

interface Entry {
  channel: RealtimeChannel;
  handlers: Set<Handler>;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Un broadcast serveur cible un nom de canal précis (ex. realtime_tracking:<org>) : ce nom ne peut
 * pas être rendu unique côté client. Or supabase.channel(nom) renvoie le canal existant, et son
 * removeChannel est asynchrone. Deux cartes montées en même temps, ou un remontage rapide
 * (React StrictMode, changement de dépendances), se partageaient donc un canal que le premier
 * démontage détruisait, ou récupéraient un canal en cours de fermeture : plus aucune position GPS.
 *
 * Ce registre partage un seul canal par nom entre tous les abonnés, avec un délai de grâce avant
 * fermeture pour absorber les remontages immédiats.
 */
const registry = new Map<string, Entry>();
const RELEASE_GRACE_MS = 3000;

export function subscribeToBroadcast(topic: string, event: string, handler: Handler): () => void {
  const wrapped: Handler = (msg) => {
    if (event === '*' || msg.event === event) handler(msg);
  };

  let entry = registry.get(topic);
  if (entry) {
    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
  } else {
    try {
      const supabase = getBrowserClient();
      const channel = supabase.channel(topic);
      const handlers = new Set<Handler>();
      channel.on('broadcast', { event: '*' }, (msg) => {
        handlers.forEach((h) => {
          try {
            h(msg as Parameters<Handler>[0]);
          } catch (err) {
            console.warn(`[Broadcast] Gestionnaire en échec sur ${topic}:`, err);
          }
        });
      });
      channel.subscribe();
      entry = { channel, handlers, releaseTimer: null };
      registry.set(topic, entry);
    } catch (err) {
      console.warn(`[Broadcast] Abonnement impossible à ${topic}:`, err);
      return () => {};
    }
  }

  const current = entry;
  current.handlers.add(wrapped);

  return () => {
    current.handlers.delete(wrapped);
    if (current.handlers.size > 0 || current.releaseTimer) return;
    current.releaseTimer = setTimeout(() => {
      if (current.handlers.size > 0) {
        current.releaseTimer = null;
        return;
      }
      registry.delete(topic);
      getBrowserClient().removeChannel(current.channel).catch(() => {});
    }, RELEASE_GRACE_MS);
  };
}

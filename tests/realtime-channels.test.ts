import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Non-régression du crash de /dispatch : « cannot add postgres_changes callbacks after subscribe() ».
 * Le faux client reproduit le comportement de realtime-js : channel(nom) renvoie le canal
 * existant, .on('postgres_changes') lève une erreur sur un canal déjà abonné, et removeChannel
 * est asynchrone (le canal reste listé jusqu'à l'accusé du serveur).
 */
type Fake = {
  topic: string;
  subscribed: boolean;
  listeners: Array<(msg: { event: string; payload?: Record<string, unknown> }) => void>;
  on: (type: string, filter: unknown, cb: (msg: never) => void) => Fake;
  subscribe: () => Fake;
};

const channels: Fake[] = [];
const removed: string[] = [];

const fakeClient = {
  channel(topic: string) {
    const existing = channels.find((c) => c.topic === topic);
    if (existing) return existing;
    const ch: Fake = {
      topic,
      subscribed: false,
      listeners: [],
      on(type, _filter, cb) {
        if (type === 'postgres_changes' && ch.subscribed) {
          throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`);
        }
        if (type === 'broadcast') ch.listeners.push(cb as never);
        return ch;
      },
      subscribe() {
        ch.subscribed = true;
        return ch;
      },
    };
    channels.push(ch);
    return ch;
  },
  removeChannel(ch: Fake) {
    removed.push(ch.topic);
    // Retrait différé, comme l'accusé serveur
    return new Promise((resolve) =>
      setTimeout(() => {
        channels.splice(channels.indexOf(ch), 1);
        resolve('ok');
      }, 50)
    );
  },
};

vi.mock('@/lib/supabase/client', () => ({ getBrowserClient: () => fakeClient }));

beforeEach(() => {
  vi.useFakeTimers();
  channels.length = 0;
  removed.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('uniqueChannelName', () => {
  it('donne un canal distinct à deux abonnements portant le même nom de base', async () => {
    const { uniqueChannelName } = await import('@/lib/supabase/use-realtime');
    const a = fakeClient.channel(uniqueChannelName('notifications:u1'));
    a.on('postgres_changes', {}, () => {});
    a.subscribe();
    // Second centre de notifications (barre de navigation + en-tête /dispatch) : ne doit plus lever
    const b = fakeClient.channel(uniqueChannelName('notifications:u1'));
    expect(b).not.toBe(a);
    expect(() => b.on('postgres_changes', {}, () => {})).not.toThrow();
  });
});

describe('subscribeToBroadcast', () => {
  it('partage un seul canal entre plusieurs abonnés et ne le ferme qu’au dernier départ', async () => {
    const { subscribeToBroadcast } = await import('@/lib/supabase/broadcast-subscription');
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = subscribeToBroadcast('realtime_tracking:org1', 'agent_location', first);
    const releaseSecond = subscribeToBroadcast('realtime_tracking:org1', 'agent_location', second);

    expect(channels.filter((c) => c.topic === 'realtime_tracking:org1')).toHaveLength(1);
    channels[0].listeners.forEach((l) => l({ event: 'agent_location', payload: { agent_id: 'a' } }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    releaseFirst();
    vi.advanceTimersByTime(10_000);
    expect(removed).toEqual([]); // le second abonné reçoit toujours les positions

    channels[0].listeners.forEach((l) => l({ event: 'other_event' }));
    expect(second).toHaveBeenCalledTimes(1); // filtrage par événement

    releaseSecond();
    vi.advanceTimersByTime(10_000);
    expect(removed).toEqual(['realtime_tracking:org1']);
  });

  it('réutilise le canal lors d’un remontage immédiat (StrictMode) au lieu d’un canal en fermeture', async () => {
    const { subscribeToBroadcast } = await import('@/lib/supabase/broadcast-subscription');
    const handler = vi.fn();
    subscribeToBroadcast('realtime_tracking:org2', 'agent_location', vi.fn())();
    subscribeToBroadcast('realtime_tracking:org2', 'agent_location', handler);
    vi.advanceTimersByTime(10_000);

    expect(removed).not.toContain('realtime_tracking:org2');
    const ch = channels.find((c) => c.topic === 'realtime_tracking:org2')!;
    ch.listeners.forEach((l) => l({ event: 'agent_location' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Nom de canal Realtime cloisonné par organisation.
 * Un canal global diffusait les alertes et positions GPS de tous les tenants à tout abonné.
 */
export function orgChannelName(base: 'realtime_alerts' | 'realtime_tracking' | 'realtime_video', organizationId: string) {
  return `${base}:${organizationId}`;
}

/**
 * Diffuse un événement broadcast puis libère le canal.
 * Sans removeChannel, chaque appel laissait un canal ouvert sur le client admin partagé
 * (fuite mémoire proportionnelle au trafic : positions GPS, alertes, événements vidéo).
 */
export async function broadcastOnce(channelName: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const channel = supabaseAdmin.channel(channelName);
  try {
    await channel.send({ type: 'broadcast', event, payload });
  } finally {
    await supabaseAdmin.removeChannel(channel).catch(() => {});
  }
}

/**
 * Exécute un effet de bord (notifications, diffusion) après l'envoi de la réponse HTTP,
 * pour ne pas retarder le déclenchement d'une alerte. Hors contexte de requête,
 * l'effet est exécuté immédiatement.
 */
export async function runAfterResponse(task: () => Promise<unknown>): Promise<void> {
  const safeTask = () => task().catch((err) => console.warn('[runAfterResponse] Tâche différée en échec:', err));
  try {
    after(safeTask);
  } catch {
    await safeTask();
  }
}

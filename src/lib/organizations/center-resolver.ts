import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Résout le centre de sécurité à rattacher à une ressource d'une organisation.
 *
 * Ordre : centre préféré (s'il appartient à l'organisation et est actif), sinon
 * premier centre actif de l'organisation, sinon `null` — le rattachement à un
 * centre est facultatif (colonnes nullables).
 *
 * Ne renvoie jamais le centre d'une autre organisation ni un identifiant codé en
 * dur : un centre inexistant viole la clé étrangère et fait échouer l'écriture
 * (création de site, provisioning d'agent…).
 */
export async function resolveOrgCenterId(
  organizationId: string | null | undefined,
  preferredCenterId?: string | null
): Promise<string | null> {
  if (!organizationId) return null;

  const { data, error } = await supabaseAdmin
    .from('security_centers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !data) return null;
  const ids = data.map((c: { id: string }) => c.id);
  if (preferredCenterId && ids.includes(preferredCenterId)) return preferredCenterId;
  return ids[0] ?? null;
}

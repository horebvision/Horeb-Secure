/**
 * SECURIA V2 — WEBHOOK & PARTNER REPOSITORY
 * Persistance résiliente pour les partenaires d'intégration et le journal des livraisons.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { IntegrationPartner, WebhookDelivery, DeliveryStatus } from './types';
import crypto from 'crypto';

// Cache en mémoire pour partenaires et secrets actifs
const inMemoryPartners = new Map<string, IntegrationPartner>();
const inMemorySecrets = new Map<string, string>(); // partnerId -> raw_secret
const inMemoryDeliveries = new Map<string, WebhookDelivery>(); // id -> delivery
const inMemoryPartnerDeliveries = new Map<string, WebhookDelivery>(); // partnerId:eventId -> delivery

export class WebhookRepository {
  /**
   * Crée un nouveau partenaire
   */
  static async createPartner(partner: Omit<IntegrationPartner, 'id' | 'created_at' | 'updated_at'> & { raw_secret: string }): Promise<IntegrationPartner> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newPartner: IntegrationPartner = {
      id,
      organization_id: partner.organization_id,
      name: partner.name,
      type: partner.type,
      status: partner.status,
      endpoint_url: partner.endpoint_url,
      secret_hash: partner.secret_hash,
      events: partner.events,
      created_at: nowIso,
      updated_at: nowIso,
      raw_secret: partner.raw_secret,
    };

    inMemoryPartners.set(id, newPartner);
    inMemorySecrets.set(id, partner.raw_secret);

    // Tentative en base
    try {
      const dbPayload = { ...newPartner };
      delete dbPayload.raw_secret;
      const { error } = await supabaseAdmin.from('integration_partners').insert(dbPayload);
      if (error && error.code === 'PGRST205') {
        // Fallback audit_logs
        await supabaseAdmin.from('audit_logs').insert({
          id,
          user_id: partner.organization_id,
          action: 'PARTNER_CREATED',
          entity_type: 'integration_partners',
          entity_id: id,
          details: dbPayload as any,
          created_at: nowIso,
        });
      }
    } catch {
      // Tolérance
    }

    return newPartner;
  }

  /**
   * Récupère la liste des partenaires d'une organisation
   */
  static async getPartnersByOrg(organizationId: string): Promise<IntegrationPartner[]> {
    const results: IntegrationPartner[] = [];

    // 1. Depuis la base de données
    try {
      const { data, error } = await supabaseAdmin
        .from('integration_partners')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        data.forEach(p => {
          inMemoryPartners.set(p.id, p);
          results.push(p);
        });
        return results;
      }
    } catch {
      // Continuer vers fallback
    }

    // 2. Fallback mémoire
    for (const p of inMemoryPartners.values()) {
      if (p.organization_id === organizationId && !results.some(r => r.id === p.id)) {
        results.push(p);
      }
    }

    // 3. Fallback audit_logs
    if (results.length === 0) {
      try {
        const { data: logs } = await supabaseAdmin
          .from('audit_logs')
          .select('details')
          .eq('entity_type', 'integration_partners');

        if (logs) {
          logs.forEach(l => {
            const p = l.details as IntegrationPartner;
            if (p && p.organization_id === organizationId && !results.some(r => r.id === p.id)) {
              inMemoryPartners.set(p.id, p);
              results.push(p);
            }
          });
        }
      } catch {
        // Ignorer
      }
    }

    return results;
  }

  /**
   * Récupère un partenaire par son ID
   */
  static async getPartnerById(id: string): Promise<IntegrationPartner | null> {
    if (inMemoryPartners.has(id)) {
      return inMemoryPartners.get(id)!;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('integration_partners')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        inMemoryPartners.set(id, data);
        return data;
      }
    } catch {
      // Fallback
    }

    try {
      const { data: log } = await supabaseAdmin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'integration_partners')
        .eq('entity_id', id)
        .maybeSingle();

      if (log?.details) {
        const p = log.details as IntegrationPartner;
        inMemoryPartners.set(id, p);
        return p;
      }
    } catch {
      // Pas trouvé
    }

    return null;
  }

  /**
   * Récupère le secret actif d'un partenaire
   */
  static getPartnerSecret(partnerId: string): string | null {
    return inMemorySecrets.get(partnerId) || null;
  }

  /**
   * Met à jour le secret d'un partenaire
   */
  static updatePartnerSecret(partnerId: string, rawSecret: string, secretHash: string): void {
    inMemorySecrets.set(partnerId, rawSecret);
    const p = inMemoryPartners.get(partnerId);
    if (p) {
      p.secret_hash = secretHash;
      p.updated_at = new Date().toISOString();
    }
  }

  /**
   * Met à jour un partenaire
   */
  static async updatePartner(id: string, updates: Partial<IntegrationPartner>): Promise<IntegrationPartner | null> {
    const p = await this.getPartnerById(id);
    if (!p) return null;

    Object.assign(p, updates, { updated_at: new Date().toISOString() });
    inMemoryPartners.set(id, p);

    try {
      await supabaseAdmin.from('integration_partners').update(updates).eq('id', id);
    } catch {
      // Tolérance
    }

    return p;
  }

  /**
   * Enregistre ou met à jour une livraison de webhook (Idempotence - Section 34)
   */
  static async recordDelivery(delivery: Omit<WebhookDelivery, 'id' | 'created_at'>): Promise<WebhookDelivery> {
    const key = `${delivery.partner_id}:${delivery.event_id}`;
    let existing = inMemoryPartnerDeliveries.get(key);

    const nowIso = new Date().toISOString();

    if (existing) {
      existing.status = delivery.status;
      existing.attempt_count = delivery.attempt_count;
      existing.response_code = delivery.response_code;
      existing.last_error = delivery.last_error;
      existing.sent_at = delivery.sent_at || existing.sent_at;
      existing.completed_at = delivery.completed_at || existing.completed_at;
      existing.next_retry_at = delivery.next_retry_at;
    } else {
      existing = {
        id: crypto.randomUUID(),
        partner_id: delivery.partner_id,
        organization_id: delivery.organization_id,
        event_id: delivery.event_id,
        event_type: delivery.event_type,
        status: delivery.status,
        attempt_count: delivery.attempt_count,
        response_code: delivery.response_code,
        last_error: delivery.last_error,
        payload: delivery.payload,
        next_retry_at: delivery.next_retry_at,
        created_at: nowIso,
        sent_at: delivery.sent_at,
        completed_at: delivery.completed_at,
      };
      inMemoryDeliveries.set(existing.id, existing);
      inMemoryPartnerDeliveries.set(key, existing);
    }

    // Persistance Supabase
    try {
      const { error } = await supabaseAdmin.from('webhook_deliveries').upsert(existing, {
        onConflict: 'partner_id,event_id',
      });
      if (error && error.code === 'PGRST205') {
        // Fallback audit_logs
        await supabaseAdmin.from('audit_logs').insert({
          id: existing.id,
          user_id: delivery.organization_id,
          action: 'WEBHOOK_DELIVERY',
          entity_type: 'webhook_deliveries',
          entity_id: existing.id,
          details: existing as any,
          created_at: nowIso,
        });
      }
    } catch {
      // Tolérance
    }

    return existing;
  }

  /**
   * Liste les livraisons d'un partenaire
   */
  static async getDeliveriesByPartner(partnerId: string): Promise<WebhookDelivery[]> {
    const list: WebhookDelivery[] = [];

    // Mémoire
    for (const d of inMemoryDeliveries.values()) {
      if (d.partner_id === partnerId) {
        list.push(d);
      }
    }

    // DB
    try {
      const { data, error } = await supabaseAdmin
        .from('webhook_deliveries')
        .select('*')
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        data.forEach(d => {
          if (!list.some(item => item.id === d.id)) {
            list.push(d);
          }
        });
      }
    } catch {
      // Tolérance
    }

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Récupère une livraison par son ID
   */
  static async getDeliveryById(deliveryId: string): Promise<WebhookDelivery | null> {
    if (inMemoryDeliveries.has(deliveryId)) {
      return inMemoryDeliveries.get(deliveryId)!;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('webhook_deliveries')
        .select('*')
        .eq('id', deliveryId)
        .maybeSingle();

      if (!error && data) {
        return data;
      }
    } catch {
      // Tolérance
    }

    return null;
  }
}

/**
 * SECURIA V2 — WEBHOOK DISPATCHER & RETRY ENGINE
 * Moteur d'expédition des webhooks avec signature HMAC, anti-SSRF,
 * idempotence, backoff exponentiel et isolation stricte par organisation.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ProofOfIntervention } from '@/lib/interventions/types';
import { IntegrationPartner, WebhookDelivery, WebhookPayload, WebhookEventType } from './types';
import { signWebhookPayload } from './webhook-signer';
import { validateWebhookUrl } from './ssrf-guard';
import { WebhookRepository } from './repository';
import crypto from 'crypto';

// Paliers de backoff exponentiel en millisecondes (Section 35)
export const RETRY_DELAYS_MS = [
  30 * 1000,        // 1er essai : 30 secondes
  2 * 60 * 1000,     // 2e essai  : 2 minutes
  10 * 60 * 1000,    // 3e essai  : 10 minutes
  30 * 60 * 1000,    // 4e essai  : 30 minutes
  2 * 60 * 60 * 1000 // 5e essai  : 2 heures
];

export const MAX_RETRY_ATTEMPTS = 5;

export class WebhookDispatcher {
  /**
   * Construit le payload officiel minimal et sanitisé (Section 31)
   */
  static buildPayload(
    event: WebhookEventType | string,
    proof: ProofOfIntervention,
    options: { test?: boolean; eventId?: string } = {}
  ): WebhookPayload {
    const eventId = options.eventId || `evt_${crypto.randomUUID()}`;

    return {
      event,
      event_id: eventId,
      timestamp: new Date().toISOString(),
      organization_id: proof.organization_id || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
      test: options.test || false,
      intervention: {
        id: proof.id,
        number: proof.intervention_number,
        site: proof.site.name,
        incident_type: proof.incident_label || proof.incident_type,
        severity: proof.priority,
        status: proof.status,
      },
      report: {
        status: proof.report.report_status,
        version: proof.report.report_version || 1,
      },
      sla: {
        arrival_status: proof.performance.sla.arrival_sla,
        total_status: proof.performance.sla.total_sla,
      },
      document: {
        available: true,
        download_url: `/api/interventions/${proof.id}/pdf`,
      },
    };
  }

  /**
   * Expédie un webhook vers un partenaire avec timeout de 10s et HMAC-SHA256
   */
  static async deliverWebhook(
    partner: IntegrationPartner,
    payload: WebhookPayload,
    attemptCount = 1
  ): Promise<WebhookDelivery> {
    // 1. Validation anti-SSRF (Section 40)
    const urlCheck = validateWebhookUrl(partner.endpoint_url, { allowLocalhostInDev: true });
    if (!urlCheck.valid) {
      const failedDelivery = await WebhookRepository.recordDelivery({
        partner_id: partner.id,
        organization_id: partner.organization_id,
        event_id: payload.event_id,
        event_type: payload.event,
        status: 'FAILED',
        attempt_count: attemptCount,
        last_error: `SSRF bloqué : ${urlCheck.error}`,
        payload,
        completed_at: new Date().toISOString(),
      });
      return failedDelivery;
    }

    // 2. Récupération ou résolution du secret
    const secret = WebhookRepository.getPartnerSecret(partner.id) || partner.secret_hash;
    const payloadStr = JSON.stringify(payload);

    // 3. Signature HMAC-SHA256 & Horodatage anti-rejeu (Section 32 & 33)
    const timestampMs = Date.now();
    const { signature } = signWebhookPayload(payloadStr, secret, timestampMs);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout 10s

    let responseCode: number | null = null;
    let lastError: string | null = null;
    let isSuccess = false;

    const sentAt = new Date().toISOString();

    try {
      const res = await fetch(urlCheck.sanitizedUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SECURIA-Signature': signature,
          'X-SECURIA-Timestamp': String(timestampMs),
          'X-SECURIA-Event': payload.event,
          'X-SECURIA-Delivery': payload.event_id,
          'User-Agent': 'SECURIA-Webhook-Engine/2.0',
        },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      responseCode = res.status;

      if (res.ok) {
        isSuccess = true;
      } else {
        lastError = `Erreur HTTP ${res.status} (${res.statusText})`;
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err.name === 'AbortError' ? 'Délai d’attente réseau dépassé (Timeout 10s)' : (err.message || 'Erreur réseau');
    }

    const completedAt = new Date().toISOString();

    // 4. Calcul de réessai avec backoff exponentiel (Section 35)
    const isRetryable =
      !isSuccess &&
      attemptCount < MAX_RETRY_ATTEMPTS &&
      (!responseCode || [408, 429, 500, 502, 503, 504].includes(responseCode));

    let status: WebhookDelivery['status'] = isSuccess ? 'SUCCESS' : isRetryable ? 'RETRYING' : 'FAILED';
    let nextRetryAt: string | null = null;

    if (isRetryable) {
      const delayMs = RETRY_DELAYS_MS[attemptCount - 1] || 30000;
      nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    }

    // 5. Enregistrement de la livraison (Idempotence - Section 34)
    const delivery = await WebhookRepository.recordDelivery({
      partner_id: partner.id,
      organization_id: partner.organization_id,
      event_id: payload.event_id,
      event_type: payload.event,
      status,
      attempt_count: attemptCount,
      response_code: responseCode,
      last_error: lastError,
      payload,
      next_retry_at: nextRetryAt,
      sent_at: sentAt,
      completed_at: isSuccess || !isRetryable ? completedAt : undefined,
    });

    // 6. Audit Trail (Section 48)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: partner.organization_id,
      action: isSuccess ? 'WEBHOOK_SENT' : isRetryable ? 'WEBHOOK_RETRIED' : 'WEBHOOK_FAILED',
      entity_type: 'webhook_deliveries',
      entity_id: delivery.id,
      details: {
        partner_id: partner.id,
        event_id: payload.event_id,
        event_type: payload.event,
        attempt: attemptCount,
        status,
        response_code: responseCode,
        error: lastError,
        timestamp: completedAt,
      },
    });

    return delivery;
  }

  /**
   * Déclenche l'envoi vers tous les partenaires de l'organisation abonnés à l'événement (Section 41)
   */
  static async dispatchToPartners(
    eventType: WebhookEventType,
    proof: ProofOfIntervention
  ): Promise<WebhookDelivery[]> {
    const orgId = proof.organization_id;
    if (!orgId) return [];

    // Isolation stricte par organisation (Section 41)
    const partners = await WebhookRepository.getPartnersByOrg(orgId);
    const activeSubscribers = partners.filter(
      p => p.status === 'ACTIVE' && p.events && p.events.includes(eventType)
    );

    const deliveries: WebhookDelivery[] = [];
    const payload = this.buildPayload(eventType, proof);

    for (const partner of activeSubscribers) {
      try {
        const d = await this.deliverWebhook(partner, payload, 1);
        deliveries.push(d);
      } catch (e) {
        console.warn(`[WebhookDispatcher] Échec livraison partenaire ${partner.id}:`, e);
      }
    }

    return deliveries;
  }

  /**
   * Envoi d'un événement de test synthétique explicitement tagué test: true (Section 38)
   */
  static async sendTestWebhook(partnerId: string): Promise<WebhookDelivery> {
    const partner = await WebhookRepository.getPartnerById(partnerId);
    if (!partner) {
      throw new Error('Partenaire introuvable');
    }

    // Payload synthétique de test
    const syntheticPayload: WebhookPayload = {
      event: 'REPORT_VALIDATED',
      event_id: `test_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      organization_id: partner.organization_id,
      test: true,
      intervention: {
        id: '00000000-0000-0000-0000-000000000001',
        number: 'INT-TEST-0001',
        site: 'Site Test Conforme',
        incident_type: 'INTRUSION',
        severity: 'HIGH',
        status: 'RESOLVED',
      },
      report: {
        status: 'REPORT_VALIDATED',
        version: 1,
      },
      sla: {
        arrival_status: 'COMPLETED',
        total_status: 'COMPLETED',
      },
      document: {
        available: true,
        download_url: '/api/interventions/00000000-0000-0000-0000-000000000001/pdf',
      },
    };

    return await this.deliverWebhook(partner, syntheticPayload, 1);
  }

  /**
   * Réessai manuel d'une livraison (Section 37)
   */
  static async retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await WebhookRepository.getDeliveryById(deliveryId);
    if (!delivery) {
      throw new Error('Livraison introuvable');
    }

    const partner = await WebhookRepository.getPartnerById(delivery.partner_id);
    if (!partner) {
      throw new Error('Partenaire introuvable');
    }

    return await this.deliverWebhook(partner, delivery.payload, delivery.attempt_count + 1);
  }
}

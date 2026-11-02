/**
 * SECURIA V2 — PHASE 7 : PAYMENT GATEWAY MANAGER
 * Gestionnaire unifié et sécurisé des passerelles de paiement (CI / UEMOA)
 */

import {
  PaymentProviderInterface,
  PaymentProviderCode,
  PaymentCreationParams,
  PaymentCreationResult,
  PaymentTransactionStatus,
  WebhookProcessingResult,
} from './types';
import { OfflinePaymentProvider } from './providers/offline-payment-provider';
import { CiMobileMoneyProvider } from './providers/ci-mobile-money-provider';
import { PaymentStateMachine } from './payment-state-machine';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export class PaymentGatewayManager {
  private static providers: Map<PaymentProviderCode, PaymentProviderInterface> = new Map([
    ['OFFLINE_TRANSFER', new OfflinePaymentProvider()],
    ['WAVE_CI', new CiMobileMoneyProvider()],
  ]);

  private static processedWebhookEvents: Set<string> = new Set();

  /**
   * Enregistre un fournisseur de paiement personnalisé
   */
  public static registerProvider(provider: PaymentProviderInterface): void {
    this.providers.set(provider.providerCode, provider);
  }

  /**
   * Récupère un fournisseur par son code
   */
  public static getProvider(code: PaymentProviderCode = 'OFFLINE_TRANSFER'): PaymentProviderInterface {
    const provider = this.providers.get(code);
    if (!provider) {
      throw new Error(`Fournisseur de paiement ${code} non supporté`);
    }
    return provider;
  }

  /**
   * Récupère la liste de tous les fournisseurs enregistrés
   */
  public static getAllProviders(): PaymentProviderInterface[] {
    return Array.from(this.providers.values());
  }

  /**
   * Indique si une passerelle de paiement en ligne est activement configurée
   */
  public static isOnlinePaymentConfigured(): boolean {
    const wave = this.providers.get('WAVE_CI');
    return wave ? wave.isConfigured() : false;
  }

  /**
   * Initialise un paiement de manière sécurisée
   */
  public static async processPaymentRequest(
    params: PaymentCreationParams,
    providerCode?: PaymentProviderCode
  ): Promise<PaymentCreationResult> {
    const isOnline = this.isOnlinePaymentConfigured();
    const selectedCode = providerCode || (isOnline ? 'WAVE_CI' : 'OFFLINE_TRANSFER');
    const provider = this.getProvider(selectedCode);

    return provider.createPayment(params);
  }

  /**
   * Initialise un paiement avec vérification préliminaire des paramètres
   */
  public static async createPayment(
    params: PaymentCreationParams,
    providerCode?: PaymentProviderCode
  ): Promise<PaymentCreationResult & { success?: boolean; error?: string }> {
    if (!params.amount || params.amount <= 0) {
      return {
        id: '',
        invoiceId: params.invoiceId,
        organizationId: params.organizationId,
        amount: params.amount,
        currency: params.currency || 'XOF',
        status: 'FAILED',
        provider: providerCode || 'OFFLINE_TRANSFER',
        checkoutUrl: null,
        success: false,
        error: 'Montant invalide pour la transaction.',
        createdAt: new Date().toISOString(),
      };
    }

    if (!params.invoiceId) {
      return {
        id: '',
        invoiceId: '',
        organizationId: params.organizationId,
        amount: params.amount,
        currency: params.currency || 'XOF',
        status: 'FAILED',
        provider: providerCode || 'OFFLINE_TRANSFER',
        checkoutUrl: null,
        success: false,
        error: 'Identifiant de facture manquant.',
        createdAt: new Date().toISOString(),
      };
    }

    try {
      const res = await this.processPaymentRequest(params, providerCode);
      return {
        ...res,
        success: true,
      };
    } catch (err: any) {
      return {
        id: '',
        invoiceId: params.invoiceId,
        organizationId: params.organizationId,
        amount: params.amount,
        currency: params.currency || 'XOF',
        status: 'FAILED',
        provider: providerCode || 'OFFLINE_TRANSFER',
        checkoutUrl: null,
        success: false,
        error: err.code || err.message,
        createdAt: new Date().toISOString(),
      };
    }
  }

  public async createPayment(
    params: PaymentCreationParams,
    providerCode?: PaymentProviderCode
  ) {
    return PaymentGatewayManager.createPayment(params, providerCode);
  }

  /**
   * Traitement d'un webhook de paiement avec protection anti-rejeu et idempotence
   */
  public static async processWebhook(
    providerCode: PaymentProviderCode,
    payload: any,
    headers: Record<string, string>,
    rawBody?: string
  ): Promise<WebhookProcessingResult> {
    const provider = this.getProvider(providerCode);

    // 1. Délégation au provider pour validation de signature et parsing
    const result = await provider.handleWebhook(payload, headers, rawBody);
    if (!result.handled) {
      return result;
    }

    // 2. Idempotence persistante (contrainte UNIQUE provider + event_id), partagée entre instances
    if (isRealServiceRoleKey()) {
      const { error } = await supabaseAdmin.from('payment_webhook_events').insert({
        provider: providerCode,
        event_id: String(result.eventId),
        event_type: payload?.type || 'unknown',
        signature: headers['wave-signature'] || headers['x-wave-signature'] || headers['x-signature'] || null,
        payload: payload || {},
        processed: false,
      });
      if (error) {
        if ((error as any).code === '23505') {
          return {
            ...result,
            isDuplicate: true,
            message: 'Événement webhook déjà traité (Idempotence respectée)',
          };
        }
        throw new Error(`Journalisation du webhook impossible : ${error.message}`);
      }
      return result;
    }

    // Repli mémoire (développement local sans clé service uniquement)
    const eventKey = `${providerCode}_${result.eventId}`;
    if (this.processedWebhookEvents.has(eventKey)) {
      return {
        ...result,
        isDuplicate: true,
        message: 'Événement webhook déjà traité (Idempotence respectée)',
      };
    }
    this.processedWebhookEvents.add(eventKey);
    return result;
  }

  public static async markWebhookProcessed(
    providerCode: PaymentProviderCode,
    eventId: string,
    processingError?: string
  ): Promise<void> {
    if (!isRealServiceRoleKey()) return;
    await supabaseAdmin
      .from('payment_webhook_events')
      .update({
        processed: !processingError,
        processing_error: processingError || null,
        processed_at: new Date().toISOString(),
      })
      .eq('provider', providerCode)
      .eq('event_id', eventId);
  }
}

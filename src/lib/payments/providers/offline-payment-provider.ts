/**
 * SECURIA V2 — PHASE 7 : OFFLINE PAYMENT PROVIDER (CÔTE D'IVOIRE)
 * Virement Bancaire BACI / SGCI et Dépôt Mobile Money Officiel avec validation auditée
 */

import {
  PaymentProviderInterface,
  PaymentProviderCode,
  PaymentMethod,
  PaymentCreationParams,
  PaymentCreationResult,
  PaymentTransactionStatus,
  WebhookProcessingResult,
} from '../types';

export class OfflinePaymentProvider implements PaymentProviderInterface {
  public providerCode: PaymentProviderCode = 'OFFLINE_TRANSFER';
  public displayName = 'Virement Bancaire / Mobile Money Direct (Côte d’Ivoire)';
  public supportedCurrencies = ['XOF'];
  public supportedMethods: PaymentMethod[] = ['BANK_TRANSFER', 'MOBILE_MONEY'];
  public environment: 'sandbox' | 'production' = 'production';

  public isConfigured(): boolean {
    return true; // Toujours opérationnel pour les entreprises en Côte d'Ivoire
  }

  public async createPayment(params: PaymentCreationParams): Promise<PaymentCreationResult> {
    const transactionId = `tx_offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id: transactionId,
      invoiceId: params.invoiceId,
      organizationId: params.organizationId,
      amount: Math.round(params.amount),
      currency: params.currency || 'XOF',
      status: 'PENDING',
      provider: this.providerCode,
      checkoutUrl: null,
      offlineInstructions: {
        bankName: 'Banque Atlantique Côte d’Ivoire (BACI)',
        accountNumber: 'CI092 01001 002345678901 45',
        beneficiary: 'HOREB SECURE TECHNOLOGIES CI',
        rib: '01001 002345678901 45',
        merchantNumbers: {
          wave: '+225 07 00 00 00 01 (HOREB SECURE CI)',
          orangeMoney: '+225 07 00 00 00 02 (Code Marchand: 541209)',
          mtnMoney: '+225 05 00 00 00 03 (Code Marchand: 881920)',
        },
      },
      createdAt: new Date().toISOString(),
    };
  }

  public async getPaymentStatus(_transactionId: string): Promise<PaymentTransactionStatus> {
    return 'PENDING';
  }

  public async verifyPayment(transactionId: string): Promise<{
    success: boolean;
    status: PaymentTransactionStatus;
    verifiedAt: string;
  }> {
    return {
      success: false,
      status: 'PENDING',
      verifiedAt: new Date().toISOString(),
    };
  }

  public async handleWebhook(_payload: any, _headers: Record<string, string>): Promise<WebhookProcessingResult> {
    return {
      handled: false,
      provider: this.providerCode,
      eventId: `off_${Date.now()}`,
      message: 'Les règlements hors-ligne sont validés manuellement par l’administration',
    };
  }
}

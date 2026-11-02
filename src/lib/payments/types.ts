/**
 * SECURIA V2 — PHASE 7 : PAYMENTS ARCHITECTURE TYPES
 * Machine d'état complète, abstraction multi-fournisseurs et réconciliation financière
 */

export type PaymentTransactionStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'AUTHORIZED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentProviderCode =
  | 'OFFLINE_TRANSFER'
  | 'WAVE_CI'
  | 'ORANGE_MONEY_CI'
  | 'MTN_MOMO_CI'
  | 'CINETPAY';

export type PaymentMethod = 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';

export interface PaymentTransaction {
  id: string;
  organizationId: string;
  invoiceId: string;
  provider: PaymentProviderCode;
  providerTransactionId?: string | null;
  amount: number; // En FCFA (XOF) entier
  currency: string; // 'XOF'
  status: PaymentTransactionStatus;
  method?: PaymentMethod;
  webhookEventId?: string | null;
  rawPayload?: Record<string, any>;
  errorMessage?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCreationParams {
  invoiceId: string;
  organizationId: string;
  amount: number;
  currency: string;
  method?: PaymentMethod;
  provider?: PaymentProviderCode;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  description?: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentCreationResult {
  id: string;
  invoiceId: string;
  organizationId: string;
  amount: number;
  currency: string;
  status: PaymentTransactionStatus;
  provider: PaymentProviderCode;
  checkoutUrl?: string | null;
  offlineInstructions?: {
    bankName: string;
    accountNumber: string;
    beneficiary: string;
    rib?: string;
    merchantNumbers?: {
      wave?: string;
      orangeMoney?: string;
      mtnMoney?: string;
    };
  };
  errorMessage?: string | null;
  createdAt: string;
}

export interface WebhookProcessingResult {
  handled: boolean;
  provider: PaymentProviderCode;
  eventId: string;
  transactionId?: string;
  invoiceId?: string;
  organizationId?: string;
  newStatus?: PaymentTransactionStatus;
  amount?: number;
  currency?: string;
  isDuplicate?: boolean;
  message?: string;
}

export interface PaymentProviderInterface {
  providerCode: PaymentProviderCode;
  displayName: string;
  supportedCurrencies: string[];
  supportedMethods: PaymentMethod[];
  environment: 'sandbox' | 'production';
  isConfigured(): boolean;
  createPayment(params: PaymentCreationParams): Promise<PaymentCreationResult>;
  getPaymentStatus(transactionId: string): Promise<PaymentTransactionStatus>;
  verifyPayment(transactionId: string): Promise<{ success: boolean; status: PaymentTransactionStatus; verifiedAt: string }>;
  handleWebhook(payload: any, headers: Record<string, string>, rawBody?: string): Promise<WebhookProcessingResult>;
  refundPayment?(transactionId: string, amount?: number, reason?: string): Promise<{ success: boolean; status: PaymentTransactionStatus }>;
  cancelPayment?(transactionId: string, reason?: string): Promise<{ success: boolean; status: PaymentTransactionStatus }>;
}

export type ReconciliationAnomalyType =
  | 'PAYMENT_WITHOUT_INVOICE'
  | 'INVOICE_WITHOUT_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE_TRANSACTION'
  | 'UNKNOWN_TRANSACTION'
  | 'UNCONFIRMED_ONLINE_STATUS'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_REFUNDED';

export interface ReconciliationAnomaly {
  id: string;
  type: ReconciliationAnomalyType;
  severity: 'WARNING' | 'CRITICAL';
  organizationId?: string;
  invoiceId?: string;
  transactionId?: string;
  description: string;
  expectedValue?: string | number;
  actualValue?: string | number;
  detectedAt: string;
}

export interface ReconciliationReport {
  generatedAt: string;
  totalTransactionsChecked: number;
  totalInvoicesChecked: number;
  anomaliesCount: number;
  anomalies: ReconciliationAnomaly[];
  status: 'CLEAN' | 'ANOMALIES_DETECTED';
}

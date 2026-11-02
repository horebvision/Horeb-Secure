/**
 * SECURIA V2 — PHASE 7 : FISCAL ARCHITECTURE TYPES
 * Typage pour la conformité fiscale, l'immuabilité et la gestion documentaire
 */

export type FiscalDocumentType =
  | 'PROFORMA'
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'ANNULLED';

export type FiscalValidationStatus =
  | 'PENDING_REGULATORY_APPROVAL'
  | 'CONFIGURED'
  | 'CERTIFIED';

export interface FiscalConfiguration {
  id: string;
  organizationId: string;
  country: string; // 'CI'
  currency: string; // 'XOF'
  taxRate: number; // 0.18 pour la TVA en Côte d'Ivoire
  taxName: string; // 'TVA'
  companyLegalName: string;
  companyTradeName?: string;
  rccm?: string; // Registre du Commerce et du Crédit Mobilier
  ncc?: string;  // Numéro de Compte Contribuable (DGI)
  taxRegime: string; // 'RÉEL NORMAL', 'RÉEL SIMPLIFIÉ'
  legalMentions: string;
  validationStatus: FiscalValidationStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaxCalculationResult {
  subtotalHt: number; // En FCFA entier
  taxRate: number;
  taxAmount: number;  // En FCFA entier
  discountAmount: number;
  totalTtc: number;   // En FCFA entier
  currency: string;
}

export interface CreditNoteCreationParams {
  originalInvoiceId?: string;
  organizationId: string;
  amount: number;
  reason: string;
  adminUserId?: string;
  createdBy?: string;
}

export interface FiscalDocumentVersion {
  id: string;
  invoiceId: string;
  version: number;
  documentType: FiscalDocumentType;
  invoiceNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  fiscalHash: string; // SHA-256 du document finalisé
  reason?: string;
  createdBy: string;
  createdAt: string;
}

/**
 * SECURIA V2 — PHASE 7 : FISCAL DOCUMENT SERVICE
 * Immuabilité des factures, gestion des avoirs (Credit Notes), annulations auditées et scellé SHA-256
 */

import crypto from 'crypto';
import { Invoice } from '@/lib/billing/types';
import {
  FiscalDocumentType,
  CreditNoteCreationParams,
  FiscalDocumentVersion,
} from './types';

export class FiscalDocumentService {
  private static versionStore: Map<string, FiscalDocumentVersion[]> = new Map();

  /**
   * Calcule le hash cryptographique SHA-256 garantissant l'intégrité de la facture fiscale
   */
  public static computeFiscalHash(params: {
    invoiceNumber: string;
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
    organizationId: string;
    createdAt: string;
    rccm?: string;
    ncc?: string;
  }): string {
    const payload = [
      params.invoiceNumber,
      params.subtotal,
      params.tax,
      params.total,
      params.currency,
      params.organizationId,
      params.createdAt,
      params.rccm || 'NO_RCCM',
      params.ncc || 'NO_NCC',
    ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Vérifie si une facture est modifiable ou strictement verrouillée
   */
  public static assertInvoiceMutable(invoice: Invoice): void {
    const isImmutable = (invoice as any).is_immutable === true;
    const isFinalStatus = ['ISSUED', 'PAID', 'VOID', 'CANCELLED'].includes(invoice.status);

    if (isImmutable || isFinalStatus) {
      const err = new Error(
        `[FiscalDocumentService] La facture ${
          invoice.invoiceNumber || (invoice as any).invoice_number
        } est finalisée et immuable. Toute modification directe est rejetée. Utilisez un avoir ou une annulation.`
      );
      (err as any).code = 'INVOICE_IS_IMMUTABLE';
      (err as any).statusCode = 403;
      throw err;
    }
  }

  /**
   * Construit un objet facture draft standardisé
   */
  public static buildDraftInvoice(params: {
    organizationId: string;
    customerName: string;
    customerAddress?: string;
    customerNcc?: string;
    planName?: string;
    amountHT: number;
    taxRate?: number;
    currency?: string;
  }): any {
    const rate = params.taxRate !== undefined ? params.taxRate : 0.18;
    const taxAmount = Math.round(params.amountHT * rate);
    const total = params.amountHT + taxAmount;
    const currentYear = new Date().getFullYear();
    const invNum = `INV-${currentYear}-${Date.now().toString().slice(-6)}`;

    return {
      id: `inv_draft_${Date.now()}`,
      organization_id: params.organizationId,
      organizationId: params.organizationId,
      customer_name: params.customerName,
      customer_address: params.customerAddress || 'Abidjan, Côte d’Ivoire',
      customer_ncc: params.customerNcc,
      company_rccm: 'CI-ABJ-2026-B-12849',
      company_ncc: 'NCC-00293847-A',
      invoice_number: invNum,
      invoiceNumber: invNum,
      number: invNum,
      invoice_type: 'FACTURE',
      plan_name: params.planName || 'STARTER',
      amount_ht: params.amountHT,
      tax_rate: rate,
      tax_amount: taxAmount,
      subtotal: params.amountHT,
      tax: taxAmount,
      total,
      amount: total,
      currency: params.currency || 'XOF',
      status: 'DRAFT',
      is_immutable: false,
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Finalise et verrouille une facture avec un scellé cryptographique
   */
  public static freezeInvoice(
    invoice: Invoice,
    metadata?: { rccm?: string; ncc?: string }
  ): any {
    const invNum = invoice.invoiceNumber || (invoice as any).invoice_number || (invoice as any).number;
    const orgId = invoice.organizationId || (invoice as any).organization_id;
    const createdAt = invoice.createdAt || (invoice as any).created_at || new Date().toISOString();
    
    // Hash scellé SHA-256 standard
    const fiscalHash = crypto.createHash('sha256')
      .update(`${invoice.id}:${invNum}:${invoice.total || (invoice as any).amount}:${orgId}`)
      .digest('hex');

    const frozenAt = new Date().toISOString();

    const versionRecord: FiscalDocumentVersion = {
      id: `ver_${Date.now()}`,
      invoiceId: invoice.id,
      version: ((invoice as any).version || 1),
      documentType: ((invoice as any).invoice_type as FiscalDocumentType) || 'INVOICE',
      invoiceNumber: invNum,
      subtotal: invoice.subtotal || (invoice as any).amount_ht,
      tax: invoice.tax || (invoice as any).tax_amount,
      total: invoice.total || (invoice as any).amount,
      currency: invoice.currency,
      fiscalHash,
      createdBy: 'SYSTEM_FREEZE',
      createdAt: frozenAt,
    };

    const list = this.versionStore.get(invoice.id) || [];
    list.push(versionRecord);
    this.versionStore.set(invoice.id, list);

    return {
      ...invoice,
      status: 'OPEN',
      is_immutable: true,
      isImmutable: true,
      fiscal_seal: fiscalHash,
      fiscalHash,
      frozen_at: frozenAt,
      frozenAt,
    };
  }

  /**
   * Crée un Avoir (Credit Note) officiel lié à une facture existante
   */
  public static createCreditNote(
    originalInvoice: Invoice,
    paramsOrReason: CreditNoteCreationParams | string
  ): any {
    const now = new Date();
    const currentYear = now.getFullYear();
    const creditNoteNumber = `AVO-${currentYear}-${Date.now().toString().slice(-6)}`;

    const params: CreditNoteCreationParams = typeof paramsOrReason === 'string'
      ? {
          organizationId: originalInvoice.organizationId || (originalInvoice as any).organization_id,
          amount: originalInvoice.total || (originalInvoice as any).amount,
          reason: paramsOrReason,
          createdBy: 'ADMIN'
        }
      : paramsOrReason;

    const originalTotal = originalInvoice.total || (originalInvoice as any).amount || 0;
    const amount = Math.min(originalTotal, Math.max(0, Math.round(params.amount)));
    const taxPart = Math.round(amount * (0.18 / 1.18));
    const subtotalPart = amount - taxPart;

    const creditNote: any = {
      id: `cn_${Date.now()}`,
      organization_id: params.organizationId,
      organizationId: params.organizationId,
      subscription_id: originalInvoice.subscriptionId || (originalInvoice as any).subscription_id,
      invoice_number: creditNoteNumber,
      invoiceNumber: creditNoteNumber,
      number: creditNoteNumber,
      invoice_type: 'AVOIR',
      original_invoice_id: originalInvoice.id,
      status: 'PAID', // Un avoir émis compense immédiatement la créance
      currency: originalInvoice.currency || 'XOF',
      subtotal: -subtotalPart,
      tax: -taxPart,
      discount: 0,
      total: -amount,
      amount: -amount,
      due_date: now.toISOString(),
      paid_at: now.toISOString(),
      period_start: originalInvoice.periodStart || (originalInvoice as any).period_start,
      period_end: originalInvoice.periodEnd || (originalInvoice as any).period_end,
      notes: `Avoir émis en compensation de la facture ${
        originalInvoice.invoiceNumber || (originalInvoice as any).invoice_number || (originalInvoice as any).number
      }. Motif : ${params.reason}`,
      is_immutable: true,
      version: 1,
      created_at: now.toISOString(),
      createdAt: now.toISOString(),
      updated_at: now.toISOString(),
    };

    return creditNote;
  }

  /**
   * Annule une facture avec motif documenté
   */
  public static annulInvoice(
    invoice: Invoice,
    reason: string,
    actorUserId: string = 'ADMIN'
  ): any {
    const now = new Date().toISOString();

    return {
      ...invoice,
      status: 'CANCELLED',
      annulment_reason: reason,
      annulled_at: now,
      notes: `Facture annulée le ${now} par l'administrateur (${actorUserId}). Motif : ${reason}`,
      is_immutable: true,
      updated_at: now,
    };
  }

  /**
   * Récupère l'historique des versions d'un document fiscal
   */
  public static getVersions(invoiceId: string): FiscalDocumentVersion[] {
    return this.versionStore.get(invoiceId) || [];
  }
}

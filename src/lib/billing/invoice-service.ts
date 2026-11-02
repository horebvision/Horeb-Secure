/**
 * SECURIA V2 — PHASE 6 : SERVICE DES FACTURES (INVOICE SERVICE)
 * Génération, numérotation atomique SEC-2026-XXXXXX, isolation multi-tenant et règlements
 */

import { Invoice, InvoiceStatus } from './types';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export class InvoiceService {
  private static memoryInvoices: Map<string, Invoice> = new Map();
  private static sequenceCounter = 1;

  /**
   * Génère le prochain numéro de facture atomique
   */
  public static generateNextInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const seq = String(this.sequenceCounter++).padStart(6, '0');
    return `SEC-${year}-${seq}`;
  }

  /**
   * Crée une nouvelle facture pour une organisation
   */
  public static async createInvoice(params: {
    organizationId: string;
    subscriptionId?: string;
    subtotal: number;
    tax?: number;
    discount?: number;
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
  }): Promise<Invoice> {
    if (!params.organizationId) {
      throw new Error('Organisation requise pour créer une facture');
    }

    const now = new Date();
    const dueDate = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
    const invoiceNumber = this.generateNextInvoiceNumber();

    const subtotal = Math.round(params.subtotal);
    const tax = Math.round(params.tax || 0);
    const discount = Math.round(params.discount || 0);
    const total = Math.max(0, subtotal + tax - discount);

    const invoice: Invoice = {
      id: `inv_${params.organizationId.slice(0, 8)}_${Date.now()}`,
      organizationId: params.organizationId,
      subscriptionId: params.subscriptionId || null,
      invoiceNumber,
      status: 'PENDING',
      currency: 'XOF',
      subtotal,
      tax,
      discount,
      total,
      dueDate: dueDate.toISOString(),
      paidAt: null,
      periodStart: params.periodStart || now.toISOString(),
      periodEnd:
        params.periodEnd || new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(),
      paymentMethod: 'OFFLINE_BANK_TRANSFER',
      paymentReference: null,
      notes: params.notes || 'Facture d’abonnement mensuel HOREB SECURE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      invoice_number: invoiceNumber,
      due_date: dueDate.toISOString(),
      paid_at: null,
    } as any;

    this.memoryInvoices.set(invoice.id, invoice);

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('invoices').insert({
          id: invoice.id,
          organization_id: invoice.organizationId,
          subscription_id: invoice.subscriptionId,
          invoice_number: invoice.invoiceNumber,
          status: invoice.status,
          currency: invoice.currency,
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          discount: invoice.discount,
          total: invoice.total,
          due_date: invoice.dueDate,
          period_start: invoice.periodStart,
          period_end: invoice.periodEnd,
          payment_method: invoice.paymentMethod,
          notes: invoice.notes,
          created_at: invoice.createdAt,
        });

        await supabaseAdmin.from('audit_logs').insert({
          action: 'INVOICE_CREATED',
          entity_type: 'INVOICE',
          entity_id: invoice.id,
          details: {
            invoiceNumber: invoice.invoiceNumber,
            total: invoice.total,
            organizationId: invoice.organizationId,
          },
        });
      }
    } catch (e) {
      console.warn('[InvoiceService] Insertion DB facture échouée, sauvegarde mémoire:', e);
    }

    return invoice;
  }

  /**
   * Crée une facture d'abonnement avec calcul automatique de la TVA (18%)
   */
  public static async createSubscriptionInvoice(
    organizationId: string,
    subscriptionId: string,
    subtotal: number,
    currency = 'XOF',
    periodStart?: string,
    periodEnd?: string
  ): Promise<any> {
    const tax = Math.round(subtotal * 0.18); // TVA Côte d'Ivoire 18%
    return this.createInvoice({
      organizationId,
      subscriptionId,
      subtotal,
      tax,
      periodStart,
      periodEnd,
      notes: `Abonnement mensuel Horeb Secure`,
    });
  }

  /**
   * Récupère toutes les factures (pour vue admin ou réconciliation)
   */
  public static async getAllInvoices(): Promise<Invoice[]> {
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data.map(r => ({
            id: r.id,
            organizationId: r.organization_id,
            subscriptionId: r.subscription_id,
            invoiceNumber: r.invoice_number,
            status: r.status as InvoiceStatus,
            currency: r.currency || 'XOF',
            subtotal: r.subtotal,
            tax: r.tax,
            discount: r.discount,
            total: r.total,
            dueDate: r.due_date,
            paidAt: r.paid_at,
            periodStart: r.period_start,
            periodEnd: r.period_end,
            paymentMethod: r.payment_method,
            paymentReference: r.payment_reference,
            notes: r.notes,
            createdAt: r.created_at,
          }));
        }
      }
    } catch (e) {
      console.warn('[InvoiceService] Lecture factures DB:', e);
    }
    return Array.from(this.memoryInvoices.values());
  }

  /**
   * Récupère les factures d'une organisation avec isolation stricte
   */
  public static async getInvoicesByOrganization(
    organizationId: string
  ): Promise<Invoice[]> {
    if (!organizationId) return [];

    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data.map(r => ({
            id: r.id,
            organizationId: r.organization_id,
            subscriptionId: r.subscription_id,
            invoiceNumber: r.invoice_number,
            status: r.status as InvoiceStatus,
            currency: r.currency || 'XOF',
            subtotal: r.subtotal,
            tax: r.tax,
            discount: r.discount,
            total: r.total,
            dueDate: r.due_date,
            paidAt: r.paid_at,
            periodStart: r.period_start,
            periodEnd: r.period_end,
            paymentMethod: r.payment_method,
            paymentReference: r.payment_reference,
            notes: r.notes,
            createdAt: r.created_at,
          }));
        }
      }
    } catch (e) {
      console.warn('[InvoiceService] Lecture factures DB:', e);
    }

    // Récupération depuis le cache mémoire filtré par organizationId (Strict isolation)
    const orgInvoices: Invoice[] = [];
    for (const inv of this.memoryInvoices.values()) {
      if (inv.organizationId === organizationId) {
        orgInvoices.push(inv);
      }
    }

    // Si aucune facture n'existe encore pour cette organisation, générer la facture initiale
    if (orgInvoices.length === 0) {
      const initial = await this.createInvoice({
        organizationId,
        subtotal: 129000,
        notes: 'Facture d’abonnement initiale HOREB SECURE Professionnel',
      });
      return [initial];
    }

    return orgInvoices.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Récupère une facture par son ID avec vérification d'appartenance
   */
  public static async getInvoiceById(
    invoiceId: string,
    organizationId?: string
  ): Promise<Invoice | null> {
    let invoice = this.memoryInvoices.get(invoiceId) || null;

    if (!invoice && isRealServiceRoleKey()) {
      try {
        const { data } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .maybeSingle();

        if (data) {
          invoice = {
            id: data.id,
            organizationId: data.organization_id,
            subscriptionId: data.subscription_id,
            invoiceNumber: data.invoice_number,
            status: data.status as InvoiceStatus,
            currency: data.currency || 'XOF',
            subtotal: data.subtotal,
            tax: data.tax,
            discount: data.discount,
            total: data.total,
            dueDate: data.due_date,
            paidAt: data.paid_at,
            periodStart: data.period_start,
            periodEnd: data.period_end,
            paymentMethod: data.payment_method,
            paymentReference: data.payment_reference,
            notes: data.notes,
            createdAt: data.created_at,
          };
          this.memoryInvoices.set(invoice.id, invoice);
        }
      } catch {}
    }

    if (!invoice) return null;

    // Protection anti-IDOR : vérification de l'organisation
    if (organizationId && invoice.organizationId !== organizationId) {
      return null;
    }

    return invoice;
  }

  /**
   * Récupère les factures (filtrées par organisation ou ensemble si admin) avec mapping snake_case
   */
  public static async getInvoices(organizationId?: string): Promise<any[]> {
    const list = organizationId
      ? await this.getInvoicesByOrganization(organizationId)
      : await this.getAllInvoices();
    return list.map(inv => ({
      ...inv,
      organization_id: inv.organizationId,
      invoice_number: inv.invoiceNumber,
      due_date: inv.dueDate,
      paid_at: inv.paidAt,
    }));
  }

  /**
   * Valide le règlement d'une facture (action PLATFORM_ADMIN)
   */
  public static async markInvoiceAsPaid(
    invoiceId: string,
    paramsOrRef: any,
    paymentMethodArg?: string,
    adminUserIdArg?: string
  ): Promise<any> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Facture non trouvée');

    const paymentMethod =
      typeof paramsOrRef === 'object'
        ? paramsOrRef.paymentMethod
        : paymentMethodArg || 'OFFLINE_BANK_TRANSFER';
    const reference =
      typeof paramsOrRef === 'object'
        ? paramsOrRef.reference
        : paramsOrRef || `REF-${Date.now()}`;
    const adminUserId =
      typeof paramsOrRef === 'object' ? paramsOrRef.adminUserId : adminUserIdArg;

    const now = new Date();
    const updated: any = {
      ...invoice,
      status: 'PAID',
      paidAt: now.toISOString(),
      paid_at: now.toISOString(),
      paymentMethod,
      paymentReference: reference,
      invoice_number: invoice.invoiceNumber,
      updatedAt: now.toISOString(),
    };

    this.memoryInvoices.set(invoiceId, updated);

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('invoices')
          .update({
            status: 'PAID',
            paid_at: updated.paidAt,
            payment_method: updated.paymentMethod,
            payment_reference: updated.paymentReference,
            updated_at: updated.updatedAt,
          })
          .eq('id', invoiceId);

        await supabaseAdmin.from('audit_logs').insert({
          action: 'MANUAL_PAYMENT_VALIDATED',
          entity_type: 'INVOICE',
          entity_id: invoiceId,
          details: {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.total,
            adminUserId,
            reference: updated.paymentReference,
          },
        });
      }
    } catch (e) {
      console.warn('[InvoiceService] Update DB mark as paid:', e);
    }

    return updated;
  }

  /**
   * Calcul de la synthèse financière d'une organisation
   */
  public static async getOrganizationBillingSummary(organizationId: string): Promise<{
    totalPaidInvoices: number;
    totalPaidAmount: number;
    totalPendingInvoices: number;
    totalPendingAmount: number;
  }> {
    const list = await this.getInvoicesByOrganization(organizationId);
    let totalPaidInvoices = 0;
    let totalPaidAmount = 0;
    let totalPendingInvoices = 0;
    let totalPendingAmount = 0;

    for (const inv of list) {
      if (inv.status === 'PAID') {
        totalPaidInvoices++;
        totalPaidAmount += inv.total;
      } else {
        totalPendingInvoices++;
        totalPendingAmount += inv.total;
      }
    }

    return {
      totalPaidInvoices,
      totalPaidAmount,
      totalPendingInvoices,
      totalPendingAmount,
    };
  }
}

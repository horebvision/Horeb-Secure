/**
 * SECURIA V2 — PHASE 7 : RECONCILIATION SERVICE
 * Réconciliation financière automatisée : Détection des anomalies entre Factures, Paiements et Passerelles
 */

import {
  ReconciliationAnomaly,
  ReconciliationReport,
  PaymentTransaction,
} from './types';
import { Invoice } from '@/lib/billing/types';

export class ReconciliationService {
  /**
   * Effectue un audit de réconciliation entre un ensemble de factures et transactions
   */
  public static reconcile(
    invoices: Invoice[],
    transactions: PaymentTransaction[]
  ): ReconciliationReport {
    const anomalies: ReconciliationAnomaly[] = [];
    const txByInvoiceId = new Map<string, PaymentTransaction[]>();
    const seenTxIds = new Set<string>();

    for (const tx of transactions) {
      // 1. Détection de doublon de transaction
      if (tx.providerTransactionId) {
        if (seenTxIds.has(tx.providerTransactionId)) {
          anomalies.push({
            id: `anom_dup_${tx.id}`,
            type: 'DUPLICATE_TRANSACTION',
            severity: 'CRITICAL',
            organizationId: tx.organizationId,
            transactionId: tx.id,
            description: `La référence de transaction ${tx.providerTransactionId} est enregistrée en double`,
            detectedAt: new Date().toISOString(),
          });
        } else {
          seenTxIds.add(tx.providerTransactionId);
        }
      }

      // 2. Détection de paiement sans facture
      if (!tx.invoiceId) {
        anomalies.push({
          id: `anom_orphan_${tx.id}`,
          type: 'PAYMENT_WITHOUT_INVOICE',
          severity: 'CRITICAL',
          organizationId: tx.organizationId,
          transactionId: tx.id,
          description: `Transaction de ${tx.amount} ${tx.currency} orpheline (aucun invoice_id rattaché)`,
          detectedAt: new Date().toISOString(),
        });
      } else {
        const list = txByInvoiceId.get(tx.invoiceId) || [];
        list.push(tx);
        txByInvoiceId.set(tx.invoiceId, list);
      }
    }

    // 3. Vérification des factures
    for (const inv of invoices) {
      const invId = inv.id;
      const associatedTxs = txByInvoiceId.get(invId) || [];
      const successfulTxs = associatedTxs.filter(t => t.status === 'SUCCEEDED');

      if (inv.status === 'PAID') {
        if (associatedTxs.length === 0) {
          anomalies.push({
            id: `anom_nopay_${invId}`,
            type: 'INVOICE_WITHOUT_PAYMENT',
            severity: 'CRITICAL',
            organizationId: inv.organizationId || (inv as any).organization_id,
            invoiceId: invId,
            description: `Facture ${inv.invoiceNumber || (inv as any).invoice_number} marquée PAID sans transaction associée`,
            detectedAt: new Date().toISOString(),
          });
        } else if (successfulTxs.length === 0) {
          anomalies.push({
            id: `anom_unconfirmed_${invId}`,
            type: 'UNCONFIRMED_ONLINE_STATUS',
            severity: 'CRITICAL',
            organizationId: inv.organizationId || (inv as any).organization_id,
            invoiceId: invId,
            description: `Facture ${inv.invoiceNumber || (inv as any).invoice_number} marquée PAID sans confirmation de transaction réussie`,
            detectedAt: new Date().toISOString(),
          });
        } else {
          // Vérification du montant encaissé vs total facture
          const totalPaid = successfulTxs.reduce((sum, t) => sum + t.amount, 0);
          if (totalPaid !== inv.total) {
            anomalies.push({
              id: `anom_amount_${invId}`,
              type: 'AMOUNT_MISMATCH',
              severity: 'WARNING',
              organizationId: inv.organizationId || (inv as any).organization_id,
              invoiceId: invId,
              expectedValue: inv.total,
              actualValue: totalPaid,
              description: `Écart de montant sur la facture ${inv.invoiceNumber || (inv as any).invoice_number}: attendu ${inv.total} FCFA, reçu ${totalPaid} FCFA`,
              detectedAt: new Date().toISOString(),
            });
          }

          // Vérification de la devise
          const badCurrency = successfulTxs.find(t => t.currency !== inv.currency);
          if (badCurrency) {
            anomalies.push({
              id: `anom_curr_${invId}`,
              type: 'CURRENCY_MISMATCH',
              severity: 'CRITICAL',
              organizationId: inv.organizationId || (inv as any).organization_id,
              invoiceId: invId,
              expectedValue: inv.currency,
              actualValue: badCurrency.currency,
              description: `Conflit de devise sur facture ${inv.invoiceNumber || (inv as any).invoice_number}: attendu ${inv.currency}, reçu ${badCurrency.currency}`,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totalTransactionsChecked: transactions.length,
      totalInvoicesChecked: invoices.length,
      anomaliesCount: anomalies.length,
      anomalies,
      status: anomalies.length === 0 ? 'CLEAN' : 'ANOMALIES_DETECTED',
    };
  }
}

export { ReconciliationService as PaymentReconciliationService };


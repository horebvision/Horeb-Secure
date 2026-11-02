/**
 * SECURIA V2 — PHASE 7 : FISCAL PDF GENERATOR
 * Génération de factures, proformas, avoirs et factures annulées conformes
 */

import { jsPDF } from 'jspdf';
import { Invoice } from '@/lib/billing/types';
import { FiscalDocumentType } from './types';
import { FiscalDocumentService } from './fiscal-document-service';

export interface FiscalPdfOptions {
  invoice: Invoice;
  documentType?: FiscalDocumentType;
  organizationName?: string;
  organizationAddress?: string;
  organizationRccm?: string;
  organizationNcc?: string;
  sellerRccm?: string;
  sellerNcc?: string;
}

export class FiscalPdfGenerator {
  public static async generateFiscalPdf(invoice: Invoice): Promise<Buffer> {
    const uint8 = this.generatePdf({ invoice });
    return Buffer.from(uint8);
  }

  public static generatePdf(options: FiscalPdfOptions): Uint8Array {
    const { invoice } = options;
    const docType: FiscalDocumentType =
      options.documentType || ((invoice as any).invoice_type as FiscalDocumentType) || 'INVOICE';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const invNum = invoice.invoiceNumber || (invoice as any).invoice_number || 'N/A';
    const subtotal = invoice.subtotal || 0;
    const tax = invoice.tax || 0;
    const total = invoice.total || 0;
    const currency = invoice.currency || 'FCFA';

    // 1. En-tête et Titre du Document
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('HOREB SECURE TECHNOLOGIES', 15, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Plateforme de Sécurité Opérationnelle & SaaS', 15, 25);
    doc.text('Abidjan, Côte d’Ivoire — contact@horebsecure.ci', 15, 30);

    // Badge Document Type
    let badgeText = 'FACTURE';
    let badgeColor: [number, number, number] = [6, 182, 212]; // cyan-500
    if (docType === 'PROFORMA') {
      badgeText = 'FACTURE PROFORMA';
      badgeColor = [59, 130, 246]; // blue-500
    } else if (docType === 'CREDIT_NOTE') {
      badgeText = 'AVOIR (NOTE DE CRÉDIT)';
      badgeColor = [245, 158, 11]; // amber-500
    } else if (docType === 'ANNULLED' || invoice.status === 'CANCELLED') {
      badgeText = 'DOCUMENT ANNULÉ';
      badgeColor = [239, 68, 68]; // red-500
    }

    doc.setFillColor(...badgeColor);
    doc.roundedRect(130, 10, 65, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(badgeText, 162.5, 19, { align: 'center' });

    // 2. Coordonnées Émetteur & Destinataire
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('ÉMETTEUR :', 15, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('HOREB SECURE TECHNOLOGIES SARL', 15, 54);
    doc.text(`RCCM : ${options.sellerRccm || 'CI-ABJ-03-2026-B12-00452'}`, 15, 59);
    doc.text(`Compte Contribuable (NCC) : ${options.sellerNcc || '2604921-A'}`, 15, 64);
    doc.text('Régime d’imposition : Réel Normal', 15, 69);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CLIENT / ORGANISATION :', 115, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(options.organizationName || 'Société de Sécurité Partenaire', 115, 54);
    doc.text(`RCCM : ${options.organizationRccm || 'Non renseigné'}`, 115, 59);
    doc.text(`Compte Contribuable (NCC) : ${options.organizationNcc || 'Non renseigné'}`, 115, 64);
    doc.text(`Adresse : ${options.organizationAddress || 'Abidjan, Côte d’Ivoire'}`, 115, 69);

    // 3. Métadonnées de Facturation
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(15, 76, 195, 76);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Numéro de référence : ${invNum}`, 15, 83);
    const dateFormatted = invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('fr-FR') : 'N/A';
    doc.text(`Date d'émission : ${dateFormatted}`, 80, 83);
    const dueFormatted = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-FR') : 'N/A';
    doc.text(`Échéance : ${dueFormatted}`, 145, 83);

    // 4. Lignes de Prestation
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(15, 92, 180, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DÉSIGNATION DE LA PRESTATION', 20, 97);
    doc.text('QTÉ', 120, 97);
    doc.text('P.U. HT', 145, 97);
    doc.text('TOTAL HT', 175, 97);

    doc.setFont('helvetica', 'normal');
    doc.text('Abonnement Plateforme SaaS HOREB SECURE Business OS', 20, 107);
    doc.text('1', 122, 107);
    doc.text(`${Math.abs(subtotal).toLocaleString('fr-FR')} ${currency}`, 140, 107);
    doc.text(`${subtotal.toLocaleString('fr-FR')} ${currency}`, 170, 107);

    doc.line(15, 115, 195, 115);

    // 5. Tableau des Totaux
    const totalBoxY = 125;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Hors Taxes (HT) :', 120, totalBoxY);
    doc.text(`${subtotal.toLocaleString('fr-FR')} ${currency}`, 170, totalBoxY);

    doc.text('TVA (18% Réglementaire CI) :', 120, totalBoxY + 7);
    doc.text(`${tax.toLocaleString('fr-FR')} ${currency}`, 170, totalBoxY + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Net à Payer TTC :', 120, totalBoxY + 16);
    doc.text(`${total.toLocaleString('fr-FR')} ${currency}`, 170, totalBoxY + 16);

    // 6. Filigrane si document annulé ou proforma
    if (docType === 'ANNULLED' || invoice.status === 'CANCELLED') {
      doc.setTextColor(239, 68, 68);
      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.text('ANNULÉE', 105, 160, { align: 'center', angle: 30 });
    } else if (docType === 'PROFORMA') {
      doc.setTextColor(203, 213, 225); // slate-300
      doc.setFontSize(32);
      doc.setFont('helvetica', 'bold');
      doc.text('PROFORMA', 105, 160, { align: 'center', angle: 30 });
    }

    // 7. Sceau cryptographique et mentions réglementaires obligatoires
    const fiscalHash = FiscalDocumentService.computeFiscalHash({
      invoiceNumber: invNum,
      subtotal,
      tax,
      total,
      currency,
      organizationId: invoice.organizationId || (invoice as any).organization_id || 'org_unknown',
      createdAt: invoice.createdAt || (invoice as any).created_at || new Date().toISOString(),
      rccm: options.sellerRccm,
      ncc: options.sellerNcc,
    });

    const footerY = 245;
    doc.setDrawColor(226, 232, 240);
    doc.line(15, footerY, 195, footerY);

    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Scellé cryptographique d’intégrité fiscale (SHA-256) :', 15, footerY + 6);
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text(fiscalHash, 15, footerY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Document émis par HOREB SECURE. Configuration fiscale conforme aux textes UEMOA / CI. En attente de certification DGI directe.',
      105,
      footerY + 18,
      { align: 'center' }
    );
    doc.text(
      'Conditions de règlement : Paiement à réception par virement bancaire ou Mobile Money certifié.',
      105,
      footerY + 23,
      { align: 'center' }
    );

    return new Uint8Array(doc.output('arraybuffer'));
  }
}

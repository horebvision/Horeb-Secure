/**
 * SECURIA V2 — PHASE 7 : TAX ENGINE
 * Moteur fiscal déterministe pour la Côte d'Ivoire & zone UEMOA (TVA 18%)
 * Précision monétaire en nombres entiers (FCFA / XOF) sans dérive à virgule flottante
 */

import { TaxCalculationResult } from './types';

export class TaxEngine {
  public static readonly DEFAULT_CI_TAX_RATE = 0.18; // TVA standard Côte d'Ivoire 18%
  public static readonly DEFAULT_CURRENCY = 'XOF';

  /**
   * Calcule les taxes et le montant TTC à partir d'un montant HT
   */
  public static calculate(
    subtotalHt: number,
    options?: {
      taxRate?: number;
      discountAmount?: number;
      currency?: string;
    }
  ): TaxCalculationResult {
    const rawSubtotal = Math.max(0, Math.round(subtotalHt));
    const discount = Math.min(rawSubtotal, Math.max(0, Math.round(options?.discountAmount || 0)));
    const taxableBase = rawSubtotal - discount;

    const rate = options?.taxRate !== undefined ? Math.max(0, options.taxRate) : this.DEFAULT_CI_TAX_RATE;
    const taxAmount = Math.round(taxableBase * rate);
    const totalTtc = taxableBase + taxAmount;

    return {
      subtotalHt: rawSubtotal,
      taxRate: rate,
      taxAmount,
      discountAmount: discount,
      totalTtc,
      currency: options?.currency || this.DEFAULT_CURRENCY,
    };
  }

  /**
   * Extrait le montant HT et la TVA à partir d'un montant TTC (dé-taxation)
   */
  public static extractFromTtc(
    totalTtc: number,
    taxRate: number = this.DEFAULT_CI_TAX_RATE
  ): { subtotalHt: number; taxAmount: number } {
    const ttc = Math.max(0, Math.round(totalTtc));
    const subtotalHt = Math.round(ttc / (1 + taxRate));
    const taxAmount = ttc - subtotalHt;

    return {
      subtotalHt,
      taxAmount,
    };
  }

  /**
   * Calcule le TTC avec validation stricte du taux de taxe
   */
  public static calculateTTC(
    amountHT: number,
    taxRate: number = this.DEFAULT_CI_TAX_RATE,
    currency: string = this.DEFAULT_CURRENCY
  ): {
    amountHT: number;
    taxRate: number;
    taxAmount: number;
    amountTTC: number;
    taxName: string;
    currency: string;
  } {
    if (taxRate < 0 || taxRate > 1.0) {
      throw new Error(`[TaxEngine] Taux de taxe invalide : ${(taxRate * 100).toFixed(2)}%. Doit être compris entre 0% et 100%.`);
    }

    const calc = this.calculate(amountHT, { taxRate, currency });
    return {
      amountHT: calc.subtotalHt,
      taxRate: calc.taxRate,
      taxAmount: calc.taxAmount,
      amountTTC: calc.totalTtc,
      taxName: `TVA (${Math.round(calc.taxRate * 100)}%)`,
      currency: calc.currency,
    };
  }

  /**
   * Arrondit strictement une valeur monétaire selon la devise
   */
  public static roundCurrency(amount: number, currency: string = this.DEFAULT_CURRENCY): number {
    if (currency === 'XOF' || currency === 'FCFA') {
      return Math.round(amount);
    }
    return Math.round(amount * 100) / 100;
  }
}

export const FiscalTaxEngine = TaxEngine;

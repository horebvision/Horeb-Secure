/**
 * SECURIA V2 — PHASE 7 : PAYMENT STATE MACHINE
 * Contrôle rigoureux et déterministe des transitions d'état des paiements
 */

import { PaymentTransactionStatus } from './types';

const ALLOWED_TRANSITIONS: Record<PaymentTransactionStatus, PaymentTransactionStatus[]> = {
  CREATED: ['PENDING', 'CANCELLED'],
  PENDING: ['PROCESSING', 'CANCELLED', 'EXPIRED', 'FAILED', 'SUCCEEDED'],
  PROCESSING: ['AUTHORIZED', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['SUCCEEDED', 'CANCELLED', 'FAILED'],
  SUCCEEDED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export class PaymentStateMachine {
  /**
   * Vérifie si une transition entre deux états est autorisée
   */
  public static canTransition(
    currentStatus: PaymentTransactionStatus,
    targetStatus: PaymentTransactionStatus
  ): boolean {
    if (currentStatus === targetStatus) return true;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  public static isValidTransition(
    currentStatus: PaymentTransactionStatus,
    targetStatus: PaymentTransactionStatus
  ): boolean {
    return this.canTransition(currentStatus, targetStatus);
  }

  /**
   * Valide et applique une transition ou lève une exception métier explicite
   */
  public static assertValidTransition(
    currentStatus: PaymentTransactionStatus,
    targetStatus: PaymentTransactionStatus,
    context?: { transactionId?: string; invoiceId?: string }
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      const err = new Error(
        `[PaymentStateMachine] Transition invalide refusée : de ${currentStatus} vers ${targetStatus}${
          context?.transactionId ? ` pour la transaction ${context.transactionId}` : ''
        }`
      );
      (err as any).code = 'INVALID_PAYMENT_STATE_TRANSITION';
      (err as any).statusCode = 400;
      throw err;
    }
  }

  /**
   * Détermine si le statut garantit un encaissement définitif permettant l'activation du service
   */
  public static isSettledAndConfirmed(status: PaymentTransactionStatus): boolean {
    return status === 'SUCCEEDED';
  }

  /**
   * Détermine si le statut correspond à un échec ou une annulation
   */
  public static isFailedOrTerminated(status: PaymentTransactionStatus): boolean {
    return ['FAILED', 'CANCELLED', 'EXPIRED'].includes(status);
  }
}

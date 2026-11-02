/**
 * SECURIA V2 — WEBHOOK SIGNER & VERIFIER
 * Implémente la signature cryptographique HMAC-SHA256 et la protection anti-rejeu.
 */

import crypto from 'crypto';

export function generatePartnerSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashPartnerSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function signWebhookPayload(
  payloadString: string,
  secret: string,
  timestampMs = Date.now()
): { signature: string; timestamp: number } {
  const message = `${timestampMs}.${payloadString}`;
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const signature = `sha256=${hmac}`;

  return { signature, timestamp: timestampMs };
}

export function verifyWebhookSignature({
  payloadString,
  signatureHeader,
  timestampHeader,
  secret,
  toleranceSeconds = 300, // 5 minutes anti-rejeu
}: {
  payloadString: string;
  signatureHeader: string;
  timestampHeader: string | number;
  secret: string;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const timestamp = typeof timestampHeader === 'string' ? parseInt(timestampHeader, 10) : timestampHeader;

  if (isNaN(timestamp)) {
    return { valid: false, reason: 'En-tête X-SECURIA-Timestamp invalide ou absent' };
  }

  // Vérification de l'anti-rejeu (Section 33)
  const now = Date.now();
  const diffSec = Math.abs(now - timestamp) / 1000;
  if (diffSec > toleranceSeconds) {
    return { valid: false, reason: `Timestamp expiré (tolérance maximale : ${toleranceSeconds}s, reçu : ${Math.floor(diffSec)}s)` };
  }

  // Vérification du format de signature sha256=...
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'Format de signature invalide (doit débuter par sha256=)' };
  }

  const expectedHmac = signatureHeader.slice(7);
  const message = `${timestamp}.${payloadString}`;
  const computedHmac = crypto.createHmac('sha256', secret).update(message).digest('hex');

  // Comparaison en temps constant pour éviter les attaques temporelles
  try {
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');
    const computedBuffer = Buffer.from(computedHmac, 'hex');

    if (expectedBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, computedBuffer)) {
      return { valid: false, reason: 'Signature HMAC invalide' };
    }
  } catch {
    return { valid: false, reason: 'Échec du décodage de la signature HMAC' };
  }

  return { valid: true };
}

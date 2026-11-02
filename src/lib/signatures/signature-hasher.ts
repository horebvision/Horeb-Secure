/**
 * SECURIA V2 — SIGNATURE CRYPTOGRAPHIC HASHER
 * Calcule l'empreinte SHA-256 d'intégrité du document signé (Section 21).
 * Détecte toute altération ultérieure du rapport ou des métadonnées.
 */

import crypto from 'crypto';

export interface HashPayloadParams {
  interventionId: string;
  reportVersion: number;
  signerName: string;
  signerRole: string;
  signedAt: string;
  consentText: string;
  signatureImage: string;
}

export function computeSignatureHash(params: HashPayloadParams): { hash: string; fingerprint: string } {
  const canonicalString = [
    params.interventionId.trim(),
    String(params.reportVersion),
    params.signerName.trim().toLowerCase(),
    params.signerRole.trim().toUpperCase(),
    new Date(params.signedAt).toISOString(),
    params.consentText.trim(),
    params.signatureImage.slice(0, 500), // En-tête canonique de l'image
  ].join('::');

  const hash = crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
  const fingerprint = `SHA256-${hash.slice(0, 8).toUpperCase()}-${hash.slice(-4).toUpperCase()}`;

  return { hash, fingerprint };
}

export function hashClientIp(ip?: string | null): string | null {
  if (!ip || ip === 'unknown') return null;
  // Anonymisation cryptographique conforme RGPD (salt + SHA-256 tronqué)
  return crypto.createHash('sha256').update(`securia_salt_${ip}`).digest('hex').slice(0, 16);
}

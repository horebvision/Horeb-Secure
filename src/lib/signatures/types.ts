/**
 * SECURIA V2 — PHASE 4 : ELECTRONIC SIGNATURE TYPES
 */

export type SignatureStatus = 'NOT_SIGNED' | 'PENDING' | 'SIGNED' | 'REVOKED';

export type SignerRole = 'CLIENT' | 'ON_SITE_REPRESENTATIVE' | 'WITNESS' | 'SECURITY_MANAGER';

export interface InterventionSignature {
  id: string;
  intervention_id: string;
  organization_id?: string | null;
  report_version: number;
  signer_name: string;
  signer_role: SignerRole | string;
  signed_at: string;
  signature_image: string; // Base64 data URI ou URL
  signature_hash: string;  // SHA-256 hex
  signature_fingerprint: string; // 12-char fingerprint
  consent_text: string;
  consent_timestamp: string;
  ip_hash?: string | null;
  user_agent?: string | null;
  actor_id?: string | null;
  status: SignatureStatus;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  revoked_by?: string | null;
  revoked_by_name?: string | null;
  created_at: string;
}

export interface CreateSignatureInput {
  intervention_id: string;
  signer_name: string;
  signer_role?: SignerRole | string;
  signature_image: string;
  consent: boolean;
  consent_text?: string;
  user_agent?: string;
  ip_address?: string;
  allow_new_version?: boolean;
}

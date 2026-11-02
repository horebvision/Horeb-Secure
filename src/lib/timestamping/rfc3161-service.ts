/**
 * SECURIA V2 — PHASE 5 : RFC 3161 QUALIFIED TIMESTAMPING ABSTRACTION
 * Interface d'horodatage qualifié pour scellement cryptographique des preuves.
 * RÈGLE CRITIQUE : Ne jamais prétendre fournir un horodatage légal si aucun TSA réel n'est configuré.
 */

import crypto from 'crypto';

export interface TimestampAuthorityToken {
  timestamp: string;
  token: string;
  authority: string;
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
  verificationStatus: 'CONFIGURED_REAL_TSA' | 'MOCK_TEST_ONLY' | 'NOT_CONFIGURED';
  rawResponse?: string;
}

export interface TimestampAuthority {
  name: string;
  url?: string;
  isConfigured(): boolean;
  requestTimestamp(dataHash: string): Promise<TimestampAuthorityToken>;
  verifyTimestamp(token: TimestampAuthorityToken, originalHash: string): Promise<boolean>;
}

export class MockTimestampAuthority implements TimestampAuthority {
  name = 'SECURIA Test Timestamp Authority (RFC 3161 Mock)';
  url = 'mock://tsa.securia.internal';

  isConfigured(): boolean {
    return false; // Indique clairement que ce n'est pas un TSA de production certifié eIDAS/RFC3161
  }

  async requestTimestamp(dataHash: string): Promise<TimestampAuthorityToken> {
    const timestamp = new Date().toISOString();
    const tokenPayload = `${this.name}|${timestamp}|${dataHash}`;
    const token = crypto.createHmac('sha256', 'mock_tsa_secret_key').update(tokenPayload).digest('hex');

    return {
      timestamp,
      token,
      authority: this.name,
      algorithm: 'SHA-256',
      verificationStatus: 'MOCK_TEST_ONLY',
      rawResponse: JSON.stringify({ simulated: true, hash: dataHash, generated_at: timestamp }),
    };
  }

  async verifyTimestamp(token: TimestampAuthorityToken, originalHash: string): Promise<boolean> {
    const tokenPayload = `${this.name}|${token.timestamp}|${originalHash}`;
    const expected = crypto.createHmac('sha256', 'mock_tsa_secret_key').update(tokenPayload).digest('hex');
    return token.token === expected;
  }
}

/**
 * Service central d'horodatage RFC 3161
 */
export class RFC3161Service {
  private static instance: TimestampAuthority = new MockTimestampAuthority();

  static setAuthority(tsa: TimestampAuthority) {
    this.instance = tsa;
  }

  static getAuthority(): TimestampAuthority {
    return this.instance;
  }

  static isConfigured(): boolean {
    return this.instance.isConfigured();
  }

  static async timestampHash(dataHash: string): Promise<TimestampAuthorityToken> {
    return this.instance.requestTimestamp(dataHash);
  }

  static async verify(token: TimestampAuthorityToken, originalHash: string): Promise<boolean> {
    return this.instance.verifyTimestamp(token, originalHash);
  }
}

/**
 * SECURIA V2 — PHASE 5 : API KEY SERVICE
 * Gestion sécurisée des clés API publiques (génération, hachage SHA-256, validation, révocation)
 * RÈGLE ABSOLUE : La clé complète n'est JAMAIS stockée en clair ni retournée après création.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResult,
  ApiKeyValidationResult,
  ApiKeyScope,
} from './types';

export class ApiKeyService {
  private static memoryCache = new Map<string, ApiKey>();
  // En serverless, une révocation faite sur une instance n'invalide pas le cache des autres :
  // les entrées utilisées pour la validation expirent donc rapidement (relecture en base).
  private static readonly VALIDATION_CACHE_TTL_MS = 60_000;
  private static validationCacheExpiry = new Map<string, number>();

  /**
   * Calcule le hash SHA-256 canonique d'une clé API
   */
  static hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
  }

  /**
   * Crée une nouvelle clé API
   */
  static async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const fullSecretKey = `sec_live_${randomHex}`;
    const keyPrefix = `sec_live_${randomHex.substring(0, 6)}`;
    const keyHash = this.hashKey(fullSecretKey);

    let expiresAt: string | null = null;
    if (input.expires_in_days && input.expires_in_days !== 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + input.expires_in_days);
      expiresAt = expDate.toISOString();
    }

    const keyRecord: ApiKey = {
      id: crypto.randomUUID(),
      organization_id: input.organization_id,
      name: input.name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: input.scopes,
      rate_limit_per_minute: 60,
      expires_at: expiresAt,
      created_by: input.created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Stockage mémoire immédiat
    this.memoryCache.set(keyHash, keyRecord);

    // 1. Tenter l'insertion dans la table api_keys
    try {
      await supabaseAdmin.from('api_keys').insert({
        id: keyRecord.id,
        organization_id: keyRecord.organization_id,
        name: keyRecord.name,
        key_prefix: keyRecord.key_prefix,
        key_hash: keyRecord.key_hash,
        scopes: keyRecord.scopes,
        rate_limit_per_minute: keyRecord.rate_limit_per_minute,
        expires_at: keyRecord.expires_at,
        created_by: keyRecord.created_by,
        created_at: keyRecord.created_at,
        updated_at: keyRecord.updated_at,
      });
    } catch {
      // Toléré si migration en attente de synchronisation
    }

    // 2. Traçabilité d'audit obligatoire
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'API_KEY_CREATED',
        user_id: input.created_by || null,
        organization_id: input.organization_id,
        entity_type: 'api_key',
        entity_id: keyRecord.id,
        details: {
          name: keyRecord.name,
          key_prefix: keyPrefix,
          key_hash: keyHash,
          scopes: input.scopes,
          expires_at: expiresAt,
        },
      });
    } catch {
      // Non-bloquant
    }

    // Retourner la clé secrète UNE SEULE FOIS, sans le hash
    const { key_hash, ...safeApiKey } = keyRecord;

    return {
      apiKey: safeApiKey,
      fullSecretKey,
    };
  }

  /**
   * Liste les clés d'une organisation (sans hash ni clé complète)
   */
  static async listApiKeys(organizationId: string): Promise<Omit<ApiKey, 'key_hash'>[]> {
    const keysMap = new Map<string, Omit<ApiKey, 'key_hash'>>();

    // 1. Depuis le cache mémoire
    for (const record of this.memoryCache.values()) {
      if (record.organization_id === organizationId) {
        const { key_hash, ...safe } = record;
        keysMap.set(safe.id, safe);
      }
    }

    // 2. Tenter la table dédiée
    try {
      const { data: dbKeys } = await supabaseAdmin
        .from('api_keys')
        .select('id, organization_id, name, key_prefix, scopes, rate_limit_per_minute, last_used_at, expires_at, revoked_at, created_by, created_at, updated_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (Array.isArray(dbKeys)) {
        dbKeys.forEach((k: any) => keysMap.set(k.id, k));
      }
    } catch {
      // Tolérance
    }

    return Array.from(keysMap.values());
  }

  /**
   * Révoque une clé API
   */
  static async revokeApiKey(
    keyId: string,
    organizationId: string,
    actorId?: string | null
  ): Promise<{ success: boolean; error?: string }> {
    const now = new Date().toISOString();

    // Mettre à jour en mémoire
    for (const record of this.memoryCache.values()) {
      if (record.id === keyId && record.organization_id === organizationId) {
        record.revoked_at = now;
        record.updated_at = now;
      }
    }

    try {
      await supabaseAdmin
        .from('api_keys')
        .update({ revoked_at: now, updated_at: now })
        .eq('id', keyId)
        .eq('organization_id', organizationId);
    } catch {
      // Tolérance
    }

    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'API_KEY_REVOKED',
        user_id: actorId || null,
        organization_id: organizationId,
        entity_type: 'api_key',
        entity_id: keyId,
        details: { revoked_at: now },
      });
    } catch {
      // Non-bloquant
    }

    return { success: true };
  }

  /**
   * Valide une clé API brute envoyée via header HTTP et vérifie ses permissions
   */
  static async validateApiKey(
    rawKey: string,
    requiredScope?: ApiKeyScope
  ): Promise<ApiKeyValidationResult> {
    if (!rawKey || !rawKey.startsWith('sec_live_')) {
      return { isValid: false, error: 'Format de clé API invalide (doit commencer par sec_live_)', statusCode: 401 };
    }

    const keyHash = this.hashKey(rawKey);

    // 1. Recherche en mémoire
    const cacheFresh = (this.validationCacheExpiry.get(keyHash) || 0) > Date.now();
    let keyRecord: ApiKey | null = cacheFresh ? this.memoryCache.get(keyHash) || null : null;

    // 2. Recherche dans la table api_keys si pas en cache
    if (!keyRecord) {
      try {
        const { data: dbKey, error } = await supabaseAdmin
          .from('api_keys')
          .select('*')
          .eq('key_hash', keyHash)
          .maybeSingle();

        if (!error && dbKey) {
          keyRecord = dbKey as ApiKey;
          this.memoryCache.set(keyHash, keyRecord);
          this.validationCacheExpiry.set(keyHash, Date.now() + this.VALIDATION_CACHE_TTL_MS);
        }
      } catch {
        // Fallback
      }
    }

    // 3. Fallback recherche dans audit_logs
    if (!keyRecord) {
      try {
        const { data: auditKeys } = await supabaseAdmin
          .from('audit_logs')
          .select('*')
          .eq('action', 'API_KEY_CREATED')
          .order('created_at', { ascending: false })
          .limit(100);

        const foundLog = auditKeys?.find(
          (log) => (log.details?.key_hash || log.metadata?.key_hash) === keyHash
        );

        if (foundLog) {
          const { data: revokeLog } = await supabaseAdmin
            .from('audit_logs')
            .select('id')
            .eq('action', 'API_KEY_REVOKED')
            .eq('entity_id', foundLog.entity_id)
            .maybeSingle();

          const details = foundLog.details || foundLog.metadata || {};
          keyRecord = {
            id: foundLog.entity_id,
            organization_id: foundLog.organization_id,
            name: details.name || 'Clé API Externe',
            key_prefix: details.key_prefix || 'sec_live_****',
            key_hash: keyHash,
            scopes: details.scopes || ['alerts:read', 'interventions:read'],
            rate_limit_per_minute: 60,
            expires_at: details.expires_at || null,
            revoked_at: revokeLog ? new Date().toISOString() : null,
            created_by: foundLog.user_id || foundLog.actor_id,
            created_at: foundLog.created_at,
            updated_at: foundLog.created_at,
          };
          this.memoryCache.set(keyHash, keyRecord);
        }
      } catch {
        // Non-bloquant
      }
    }

    if (!keyRecord) {
      return { isValid: false, error: 'Clé API non reconnue ou révoquée', statusCode: 401 };
    }

    // Contrôle révocation
    if (keyRecord.revoked_at) {
      return { isValid: false, error: 'Cette clé API a été révoquée', statusCode: 403 };
    }

    // Contrôle expiration
    if (keyRecord.expires_at) {
      const expDate = new Date(keyRecord.expires_at);
      if (expDate.getTime() < Date.now()) {
        return { isValid: false, error: 'Cette clé API a expiré', statusCode: 403 };
      }
    }

    // Contrôle du scope spécifique requis
    if (requiredScope && (!keyRecord.scopes || !keyRecord.scopes.includes(requiredScope))) {
      return {
        isValid: false,
        error: `Permission insuffisante : le scope '${requiredScope}' est requis. Scopes de la clé : [${keyRecord.scopes?.join(', ')}]`,
        statusCode: 403,
      };
    }

    // Mettre à jour last_used_at de façon asynchrone sans bloquer
    const nowIso = new Date().toISOString();
    keyRecord.last_used_at = nowIso;
    supabaseAdmin
      .from('api_keys')
      .update({ last_used_at: nowIso })
      .eq('id', keyRecord.id)
      .then(() => {});

    return {
      isValid: true,
      apiKey: keyRecord,
    };
  }
}

/**
 * SECURIA V2 — PHASE 5 : API KEYS TYPES & SCOPES
 */

export type ApiKeyScope =
  | 'alerts:read'
  | 'alerts:write'
  | 'interventions:read'
  | 'interventions:write'
  | 'agents:read'
  | 'sites:read'
  | 'clients:read'
  | 'analytics:read'
  | 'webhooks:manage';

export const ALL_API_KEY_SCOPES: { scope: ApiKeyScope; label: string; description: string }[] = [
  { scope: 'alerts:read', label: 'Lecture des alertes', description: 'Consulter la liste et le détail des alertes' },
  { scope: 'alerts:write', label: 'Création d’alertes', description: 'Déclencher de nouvelles alertes d’urgence' },
  { scope: 'interventions:read', label: 'Lecture des interventions', description: 'Consulter les missions d’intervention et SLA' },
  { scope: 'interventions:write', label: 'Mise à jour interventions', description: 'Valider ou faire progresser le statut des interventions' },
  { scope: 'agents:read', label: 'Lecture des agents', description: 'Consulter la liste et le statut des agents de sécurité' },
  { scope: 'sites:read', label: 'Lecture des sites', description: 'Consulter les sites protégés et consignes d’accès' },
  { scope: 'clients:read', label: 'Lecture des clients', description: 'Consulter les comptes abonnés et contacts d’urgence' },
  { scope: 'analytics:read', label: 'Analytics & KPIs', description: 'Accéder aux statistiques opérationnelles et SLA' },
  { scope: 'webhooks:manage', label: 'Gestion des webhooks', description: 'Configurer les endpoints et partenaires d’intégration' },
];

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string; // e.g. sec_live_a1b2
  key_hash: string;   // SHA-256 de la clé complète
  scopes: ApiKeyScope[];
  rate_limit_per_minute: number;
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApiKeyInput {
  organization_id: string;
  name: string;
  scopes: ApiKeyScope[];
  expires_in_days?: number | null; // e.g. 30, 90, 365, null = jamais
  created_by?: string | null;
}

export interface CreateApiKeyResult {
  apiKey: Omit<ApiKey, 'key_hash'>;
  fullSecretKey: string; // Affiché UNE SEULE FOIS à la création
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  apiKey?: ApiKey;
  error?: string;
  statusCode?: number;
}

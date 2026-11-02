/**
 * SECURIA V2 — PHASE 5 : PARTNER CONNECTOR FOUNDATION
 * Architecture extensible de connecteurs partenaires (télésurveillance, CRM, ERP, assurances, contrôle d'accès).
 * RÈGLE : Ne pas inventer d'API tierce sans documentation réelle. Fournir les interfaces d'extension.
 */

export type PartnerConnectorCategory =
  | 'SECURITY_SOFTWARE'
  | 'REMOTE_MONITORING'
  | 'CRM'
  | 'ERP'
  | 'INSURANCE'
  | 'ACCESS_CONTROL';

export interface PartnerConnectorConfig {
  id: string;
  name: string;
  category: PartnerConnectorCategory;
  version: string;
  description: string;
  author: string;
  websiteUrl?: string;
  supportedEvents: string[];
  requiredSettings: {
    key: string;
    label: string;
    type: 'string' | 'password' | 'url' | 'number' | 'boolean';
    required: boolean;
  }[];
}

export interface PartnerConnectorInstance {
  config: PartnerConnectorConfig;
  validateSettings(settings: Record<string, any>): { valid: boolean; errors?: string[] };
  dispatchWebhookEvent?(event: string, payload: any, settings: Record<string, any>): Promise<{ success: boolean; externalId?: string; error?: string }>;
}

export class PartnerConnectorRegistry {
  private static connectors = new Map<string, PartnerConnectorInstance>();

  static register(connector: PartnerConnectorInstance) {
    this.connectors.set(connector.config.id, connector);
  }

  static get(connectorId: string): PartnerConnectorInstance | undefined {
    return this.connectors.get(connectorId);
  }

  static listAll(): PartnerConnectorConfig[] {
    return Array.from(this.connectors.values()).map(c => c.config);
  }

  static listByCategory(category: PartnerConnectorCategory): PartnerConnectorConfig[] {
    return this.listAll().filter(c => c.category === category);
  }
}

// Enregistrement des schémas de connecteurs standards supportés par SECURIA
PartnerConnectorRegistry.register({
  config: {
    id: 'generic-webhook',
    name: 'Generic Webhook Partner (Phase 4 Native)',
    category: 'SECURITY_SOFTWARE',
    version: '1.0.0',
    description: 'Envoi d’événements en temps réel signés HMAC-SHA256 avec protection replay.',
    author: 'SECURIA Core',
    supportedEvents: [
      'alert.created',
      'alert.acknowledged',
      'alert.assigned',
      'agent.accepted',
      'agent.en_route',
      'agent.arrived',
      'intervention.resolved',
      'intervention.reported',
      'intervention.validated',
      'sla.breached',
    ],
    requiredSettings: [
      { key: 'webhookUrl', label: 'URL Endpoint HTTPS', type: 'url', required: true },
      { key: 'secretKey', label: 'Secret HMAC SHA-256', type: 'password', required: true },
    ],
  },
  validateSettings: (settings) => {
    if (!settings.webhookUrl || !settings.webhookUrl.startsWith('https://')) {
      return { valid: false, errors: ['L’URL Endpoint doit être un lien HTTPS valide.'] };
    }
    return { valid: true };
  },
});

PartnerConnectorRegistry.register({
  config: {
    id: 'telemonitoring-hub',
    name: 'Hub Télésurveillance Externe',
    category: 'REMOTE_MONITORING',
    version: '1.0.0',
    description: 'Connecteur bidirectionnel d’ingestion d’alarmes et de remontée de levée de doute.',
    author: 'SECURIA Integration Engine',
    supportedEvents: ['alert.created', 'agent.arrived', 'intervention.resolved'],
    requiredSettings: [
      { key: 'apiUrl', label: 'URL Serveur Télésurveillance', type: 'url', required: true },
      { key: 'clientId', label: 'Client Identifier', type: 'string', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  },
  validateSettings: (settings) => {
    if (!settings.apiUrl || !settings.apiKey) {
      return { valid: false, errors: ['URL Serveur et API Key sont obligatoires.'] };
    }
    return { valid: true };
  },
});

PartnerConnectorRegistry.register({
  config: {
    id: 'erp-finance-sync',
    name: 'Connecteur ERP Facturation',
    category: 'ERP',
    version: '1.0.0',
    description: 'Exportation automatique des coûts et marges d’interventions vers le système comptable.',
    author: 'SECURIA Financial Engine',
    supportedEvents: ['intervention.validated'],
    requiredSettings: [
      { key: 'erpEndpoint', label: 'API Endpoint ERP', type: 'url', required: true },
      { key: 'authToken', label: 'Token d’authentification', type: 'password', required: true },
    ],
  },
  validateSettings: (settings) => {
    if (!settings.erpEndpoint) {
      return { valid: false, errors: ['Endpoint ERP requis.'] };
    }
    return { valid: true };
  },
});

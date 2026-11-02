import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'HOREB SECURE Security Business OS — Public API v1',
      version: '1.0.0',
      description: 'API publique haute sécurité pour l’accès aux alertes, interventions, agents, sites, clients et analytics.',
      contact: {
        name: 'HOREB SECURE Security Operations',
        email: 'support@horebsecure.ci',
      },
    },
    servers: [
      {
        url: 'https://horeb-secure.netlify.app',
        description: 'Serveur de Production',
      },
    ],
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-SECURIA-API-KEY',
          description: 'Clé API Securia préfixée sec_live_ ou sec_test_ avec hash SHA-256 stocké côté serveur.',
        },
      },
      schemas: {
        Alert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            alert_number: { type: 'string' },
            type: { type: 'string' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Intervention: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            intervention_number: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string' },
            badge_number: { type: 'string' },
            duty_status: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/v1/alerts': {
        get: {
          summary: 'Lister les alertes',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Succès' },
            '401': { description: 'Non authentifié ou clé API manquante' },
            '403': { description: 'Scope alerts:read non accordé' },
          },
        },
      },
      '/api/v1/interventions': {
        get: {
          summary: 'Lister les interventions',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Succès' },
            '403': { description: 'Scope interventions:read non accordé' },
          },
        },
      },
      '/api/v1/agents': {
        get: {
          summary: 'Lister les agents de sécurité',
          responses: {
            '200': { description: 'Succès' },
            '403': { description: 'Scope agents:read non accordé' },
          },
        },
      },
      '/api/v1/sites': {
        get: {
          summary: 'Lister les sites protégés',
          responses: {
            '200': { description: 'Succès' },
            '403': { description: 'Scope sites:read non accordé' },
          },
        },
      },
      '/api/v1/clients': {
        get: {
          summary: 'Lister les clients',
          responses: {
            '200': { description: 'Succès' },
            '403': { description: 'Scope clients:read non accordé' },
          },
        },
      },
      '/api/v1/analytics': {
        get: {
          summary: 'Obtenir les indicateurs de performance et KPIs',
          parameters: [
            { name: 'range', in: 'query', schema: { type: 'string', enum: ['today', '7d', '30d', '90d'] } },
          ],
          responses: {
            '200': { description: 'Succès' },
            '403': { description: 'Scope analytics:read non accordé' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec);
}

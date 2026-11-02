/**
 * SECURIA V2 — PHASE 5 : API KEY & V1 AUTHENTICATION GUARD
 * Vérifie l'authentification soit par clé API (X-SECURIA-API-KEY), soit par session JWT
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService } from './api-key-service';
import { ApiKeyScope } from './types';
import { authenticateApiRequest } from '@/lib/security/api-guard';

export interface V1AuthContext {
  organizationId: string;
  authMethod: 'API_KEY' | 'SESSION';
  apiKeyId?: string;
  userId?: string;
  scopes?: ApiKeyScope[];
}

export async function authenticateV1Request(
  req: NextRequest,
  requiredScope?: ApiKeyScope
): Promise<{ auth: V1AuthContext | null; response?: NextResponse }> {
  // 1. Vérification Header X-SECURIA-API-KEY ou Bearer sec_live_...
  const apiKeyHeader = req.headers.get('x-securia-api-key') || req.headers.get('x-api-key');
  const authHeader = req.headers.get('authorization');
  let rawApiKey = apiKeyHeader;

  if (!rawApiKey && authHeader?.startsWith('Bearer sec_live_')) {
    rawApiKey = authHeader.replace('Bearer ', '').trim();
  }

  if (rawApiKey) {
    const valResult = await ApiKeyService.validateApiKey(rawApiKey, requiredScope);
    if (!valResult.isValid || !valResult.apiKey) {
      return {
        auth: null,
        response: NextResponse.json(
          { success: false, error: valResult.error || 'Authentification API invalide' },
          { status: valResult.statusCode || 401 }
        ),
      };
    }

    // Vérification de l'habilitation SaaS (Phase 6 : PUBLIC_API entitlement)
    const { EntitlementService } = await import('@/lib/billing/entitlement-service');
    const hasApiAccess = await EntitlementService.hasFeature(valResult.apiKey.organization_id, 'PUBLIC_API');
    if (!hasApiAccess) {
      return {
        auth: null,
        response: NextResponse.json(
          {
            success: false,
            code: 'FEATURE_NOT_INCLUDED',
            error: 'L’accès à l’API publique n’est pas inclus dans votre plan d’abonnement actuel. Veuillez mettre à niveau vers l’offre Professionnel ou Business.',
          },
          { status: 403 }
        ),
      };
    }

    return {
      auth: {
        organizationId: valResult.apiKey.organization_id,
        authMethod: 'API_KEY',
        apiKeyId: valResult.apiKey.id,
        scopes: valResult.apiKey.scopes,
      },
    };
  }

  // 2. Si pas de clé API, vérifier la session Supabase authentifiée (accès via console/UI)
  const { user, errorResponse } = await authenticateApiRequest(req, {
    allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
    allowTestFallback: false,
  });

  if (errorResponse || !user) {
    return {
      auth: null,
      response:
        errorResponse ||
        NextResponse.json(
          {
            success: false,
            error: 'Authentification requise. Fournissez un header X-SECURIA-API-KEY ou une session valide.',
          },
          { status: 401 }
        ),
    };
  }

  if (!user.organizationId) {
    return {
      auth: null,
      response: NextResponse.json(
        {
          success: false,
          error: 'Accès refusé. Aucun rattachement d\'organisation trouvé pour cet utilisateur.',
        },
        { status: 403 }
      ),
    };
  }

  return {
    auth: {
      organizationId: user.organizationId,
      authMethod: 'SESSION',
      userId: user.id,
    },
  };
}

/**
 * GET  /api/video/systems - Liste les NVR, DVR, VMS et passerelles de l'organisation
 * POST /api/video/systems - Enregistre un nouveau système vidéo (avec protection SSRF)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, isValidUuid } from '@/lib/security/api-guard';
import { VideoRepository, validateVideoEndpointUrl, sanitizeSystemForClient } from '@/lib/video';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const systems = await VideoRepository.getVideoSystemsByOrg(orgId);

    const safeSystems = systems.map(sanitizeSystemForClient);

    return NextResponse.json({
      success: true,
      count: safeSystems.length,
      systems: safeSystems,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des systèmes vidéo');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
    }

    const body = await req.json();
    const { protected_site_id, name, type, protocol, host_address, port, notes, capabilities } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Le nom du système vidéo est requis.' }, { status: 400 });
    }

    // Validation SSRF si une adresse externe est spécifiée
    if (host_address && typeof host_address === 'string' && host_address.startsWith('http')) {
      const ssrfCheck = validateVideoEndpointUrl(host_address, {
        allowLocalGateway: type === 'GATEWAY',
      });
      if (!ssrfCheck.valid) {
        return NextResponse.json({ error: ssrfCheck.error }, { status: 400 });
      }
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

    const system = await VideoRepository.createVideoSystem(
      {
        organization_id: orgId,
        protected_site_id: protected_site_id && isValidUuid(protected_site_id) ? protected_site_id : null,
        name: sanitizeString(name, 120),
        type: type || 'NVR',
        protocol: protocol || 'ONVIF',
        host_address: host_address ? sanitizeString(host_address, 255) : null,
        port: typeof port === 'number' ? port : null,
        status: 'ONLINE',
        capabilities: Array.isArray(capabilities) ? capabilities : ['AI_DETECTION', 'MULTI_CHANNEL'],
        notes: notes ? sanitizeString(notes, 500) : null,
        is_active: true,
      },
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Système vidéo enregistré avec succès.',
        system: sanitizeSystemForClient(system),
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la création du système vidéo');
  }
}

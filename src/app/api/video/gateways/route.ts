/**
 * GET  /api/video/gateways - Liste les passerelles Edge de l'organisation
 * POST /api/video/gateways - Crée une nouvelle passerelle et génère un code d'appairage
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, isValidUuid, checkRateLimit } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('site_id');

    const gateways = await VideoRepository.getVideoGatewaysByOrg(
      orgId,
      siteId && isValidUuid(siteId) ? siteId : undefined
    );

    return NextResponse.json({
      success: true,
      count: gateways.length,
      gateways,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des passerelles Edge');
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rate = await checkRateLimit(`video_gw_create_${ip}`, 20, 60000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter.' },
        { status: 429 }
      );
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const orgId = user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
    const body = await req.json();

    const name = sanitizeString(body.name);
    const siteId = body.protected_site_id;
    const gatewayCode = body.gateway_code ? sanitizeString(body.gateway_code) : undefined;
    const notes = body.notes ? sanitizeString(body.notes) : undefined;

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Le nom de la passerelle est requis.' }, { status: 400 });
    }

    if (!siteId || !isValidUuid(siteId)) {
      return NextResponse.json({ error: 'Un identifiant de site protégé valide est obligatoire.' }, { status: 400 });
    }

    const gateway = await VideoRepository.createVideoGateway(
      {
        organization_id: orgId,
        protected_site_id: siteId,
        name,
        gateway_code: gatewayCode,
        notes,
      },
      user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Passerelle Edge initialisée avec code d’appairage temporaire.',
      gateway,
      pairing_instructions: {
        code: gateway.pairing_code,
        expires_at: gateway.pairing_expires_at,
        command_example: `securia-gateway pair --code ${gateway.pairing_code}`,
      },
    }, { status: 201 });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la création de la passerelle');
  }
}

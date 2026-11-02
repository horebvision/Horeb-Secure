/**
 * POST /api/video/gateways/sync-cameras - Synchronisation des caméras découvertes localement (ONVIF)
 * Transmis par l'Edge Gateway après découverte locale sur le LAN
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse, isValidUuid } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function POST(req: NextRequest) {
  try {
    const gatewayId = req.headers.get('x-gateway-id');
    const gatewayToken = req.headers.get('x-gateway-token') || req.headers.get('authorization')?.replace('Bearer ', '');

    if (!gatewayId || !gatewayToken) {
      return NextResponse.json({ error: 'Authentification passerelle requise.' }, { status: 401 });
    }

    const body = await req.json();
    const orgId = body.organization_id;
    const siteId = body.protected_site_id;
    const cameras = body.cameras;

    if (!orgId || !siteId || !Array.isArray(cameras)) {
      return NextResponse.json(
        { error: 'Données de synchronisation invalides (organization_id, protected_site_id et cameras[] requis).' },
        { status: 400 }
      );
    }

    const synced = await VideoRepository.syncGatewayDiscoveredCameras(
      gatewayId,
      orgId,
      siteId,
      cameras,
      `gateway:${gatewayId}`
    );

    return NextResponse.json({
      success: true,
      message: `${synced.length} caméra(s) synchronisée(s) avec succès dans le registre Cloud.`,
      count: synced.length,
      cameras: synced.map((c) => ({
        id: c.id,
        name: c.name,
        internal_id: c.internal_id,
        status: c.status,
        protocol: c.protocol,
      })),
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la synchronisation des caméras');
  }
}

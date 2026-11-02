/**
 * POST /api/video/gateways/sync-cameras - Synchronisation des caméras découvertes localement (ONVIF)
 * Transmis par l'Edge Gateway après découverte locale sur le LAN
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse, isValidUuid } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const gatewayId = req.headers.get('x-gateway-id');
    const gatewayToken = req.headers.get('x-gateway-token') || req.headers.get('authorization')?.replace('Bearer ', '');

    const gateway = await VideoRepository.authenticateGateway(gatewayId, gatewayToken || null);
    if (!gateway) {
      return NextResponse.json({ error: 'Authentification passerelle invalide ou révoquée.' }, { status: 401 });
    }

    const body = await req.json();
    // Organisation imposée par la passerelle authentifiée
    const orgId = gateway.organization_id;
    const siteId = body.protected_site_id;
    const cameras = body.cameras;

    if (!orgId || !siteId || !Array.isArray(cameras)) {
      return NextResponse.json(
        { error: 'Données de synchronisation invalides (organization_id, protected_site_id et cameras[] requis).' },
        { status: 400 }
      );
    }

    const { data: ownedSite } = await supabaseAdmin
      .from('protected_sites')
      .select('id')
      .eq('id', siteId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!ownedSite) {
      return NextResponse.json({ error: 'Site protégé inconnu pour cette passerelle.' }, { status: 404 });
    }

    const synced = await VideoRepository.syncGatewayDiscoveredCameras(
      gateway.id,
      orgId,
      siteId,
      cameras,
      `gateway:${gateway.id}`
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

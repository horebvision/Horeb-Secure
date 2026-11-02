/**
 * GET  /api/video/cameras - Liste les caméras de l'organisation avec filtres optionnels
 * POST /api/video/cameras - Crée et enregistre une nouvelle caméra rattachée à un site
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, sanitizeString, isValidUuid, checkRateLimit, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository, sanitizeCameraForClient } from '@/lib/video';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'AGENT', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('site_id');
    const status = searchParams.get('status') as any;

    const cameras = await VideoRepository.getCamerasByOrg(orgId, {
      siteId: siteId && isValidUuid(siteId) ? siteId : undefined,
      status: status || undefined,
    });

    // Masquage absolu des informations de flux interne pour le client
    const safeCameras = cameras.map(sanitizeCameraForClient);

    return NextResponse.json({
      success: true,
      count: safeCameras.length,
      cameras: safeCameras,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des caméras');
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rate = await checkRateLimit(`video_cam_create_${ip}`, 30, 60000);
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
      return errorResponse || NextResponse.json({ error: 'Non authentifié ou droits insuffisants' }, { status: 401 });
    }

    const body = await req.json();
    const {
      protected_site_id,
      video_system_id,
      name,
      internal_id,
      manufacturer,
      model,
      camera_type,
      protocol,
      stream_internal_url,
      is_primary,
      capabilities,
      latitude,
      longitude,
      location_description,
      installation_notes,
    } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Le nom de la caméra est obligatoire.' }, { status: 400 });
    }

    if (!protected_site_id || !isValidUuid(protected_site_id)) {
      return NextResponse.json({ error: 'L’identifiant du site protégé (UUID) est obligatoire.' }, { status: 400 });
    }

    if (!internal_id) {
      return NextResponse.json({ error: 'L’identifiant interne (e.g. CAM-01) est obligatoire.' }, { status: 400 });
    }

    const orgId = getTenantOrgId(user);

    const newCamera = await VideoRepository.createCamera(
      {
        organization_id: orgId,
        protected_site_id,
        video_system_id: video_system_id && isValidUuid(video_system_id) ? video_system_id : null,
        name: sanitizeString(name, 120),
        internal_id: sanitizeString(internal_id, 50),
        manufacturer: manufacturer ? sanitizeString(manufacturer, 80) : null,
        model: model ? sanitizeString(model, 80) : null,
        camera_type: camera_type || 'FIXED',
        protocol: protocol || 'ONVIF',
        stream_internal_url: stream_internal_url || null,
        status: 'ONLINE', // Initialisé ONLINE après enregistrement
        is_primary: !!is_primary,
        capabilities: Array.isArray(capabilities) ? capabilities : ['MOTION'],
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        location_description: location_description ? sanitizeString(location_description, 200) : null,
        installation_notes: installation_notes ? sanitizeString(installation_notes, 500) : null,
        last_seen_at: new Date().toISOString(),
      },
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Caméra enregistrée au registre avec succès.',
        camera: sanitizeCameraForClient(newCamera),
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la création de la caméra');
  }
}

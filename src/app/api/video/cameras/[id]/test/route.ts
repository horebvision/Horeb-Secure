/**
 * POST /api/video/cameras/[id]/test - Teste la connexion et l'état opérationnel d'une caméra via son adaptateur
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, isValidUuid, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository, VideoAdapterRegistry } from '@/lib/video';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant caméra invalide' }, { status: 400 });
    }

    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const camera = await VideoRepository.getCameraById(id, orgId);

    if (!camera) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès refusé' }, { status: 404 });
    }

    // Récupération de l'adaptateur selon le protocole
    const adapter = VideoAdapterRegistry.get(camera.protocol);
    const health = await adapter.checkCameraHealth(camera);

    // Mise à jour de l'état et de la date de vérification
    await VideoRepository.updateCamera(
      id,
      orgId,
      {
        status: health.status,
        last_seen_at: health.lastSeen,
        last_health_check_at: new Date().toISOString(),
      },
      user.id
    );

    // Audit de l'opération
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'CAMERA_CONNECTION_TEST',
        entity_type: 'video_cameras',
        entity_id: id,
        user_id: user.id,
        details: {
          status: health.status,
          latency_ms: health.latencyMs,
          protocol: camera.protocol,
          adapter_id: adapter.id,
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      camera_id: id,
      name: camera.name,
      status: health.status,
      latency_ms: health.latencyMs,
      hardware_tested_live: adapter.isHardwareTested,
      adapter_name: adapter.name,
      checked_at: new Date().toISOString(),
      message: health.status === 'ONLINE' ? 'Caméra opérationnelle et en ligne.' : 'Caméra non joignable.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du test de connectivité caméra');
  }
}

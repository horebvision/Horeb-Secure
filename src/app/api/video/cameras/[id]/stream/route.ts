/**
 * GET /api/video/cameras/[id]/stream - Délivre un jeton éphémère sécurisé pour visualisation SOC
 * Garanties Section 7 & 10 :
 * - Jeton court (5 min max)
 * - Aucune URL RTSP privée ni mot de passe caméra transmis
 * - État "NOT_CONFIGURED" clair si aucun serveur de flux réel n'est configuré (zéro fake vidéo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, isValidUuid, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository, generateEphemeralStreamToken } from '@/lib/video';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
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
      return errorResponse || NextResponse.json({ error: 'Droits insuffisants pour accéder au flux vidéo' }, { status: 403 });
    }

    const orgId = getTenantOrgId(user);
    const camera = await VideoRepository.getCameraById(id, orgId);

    if (!camera) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès refusé' }, { status: 404 });
    }

    // Si la caméra n'a pas de passerelle ni de stream configuré, renvoyer explicitement NOT_CONFIGURED
    const isConfigured = !!camera.stream_internal_url || camera.protocol === 'TEST_SIMULATOR';

    if (!isConfigured) {
      return NextResponse.json({
        success: true,
        view_status: 'NOT_CONFIGURED',
        camera_id: camera.id,
        camera_name: camera.name,
        message: 'Flux vidéo non configuré. Aucune passerelle média active sur ce canal.',
      });
    }

    // Génération du jeton signé éphémère (5 min)
    const ephemeralToken = generateEphemeralStreamToken(camera, user.id, orgId);

    // Audit d'accès vidéo (sans secrets)
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'VIDEO_ACCESS_GRANTED',
        entity_type: 'video_cameras',
        entity_id: camera.id,
        user_id: user.id,
        details: {
          camera_name: camera.name,
          site_id: camera.protected_site_id,
          expires_at: ephemeralToken.expires_at,
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      view_status: 'LIVE',
      camera_id: camera.id,
      camera_name: camera.name,
      site_id: camera.protected_site_id,
      token: ephemeralToken.token,
      expires_at: ephemeralToken.expires_at,
      stream_url: ephemeralToken.stream_relay_url,
      protocol: camera.protocol,
      message: 'Autorisation de visualisation temporaire accordée.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la génération de l’accès vidéo');
  }
}

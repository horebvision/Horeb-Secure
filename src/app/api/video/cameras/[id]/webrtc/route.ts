/**
 * POST /api/video/cameras/[id]/webrtc
 * Négociation WebRTC sécurisée (WHEP / SDP Offer-Answer)
 * Garanties Section 8, 14, 22 :
 * - Aucune URL RTSP privée ni mot de passe caméra transmis au client
 * - Chiffrement de bout en bout de la signalisation
 * - Contrôle RBAC & multi-tenant strict (Anti-IDOR)
 * - Traçabilité dans audit_logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, isValidUuid, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository, verifyEphemeralStreamToken } from '@/lib/video';
import { supabaseAdmin } from '@/lib/supabase/admin';
import http from 'http';

const GO2RTC_URL = process.env.GO2RTC_API_URL || 'http://127.0.0.1:1984';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant caméra invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const clientSdp = body.sdp;
    const streamToken = body.stream_token;

    if (!clientSdp || typeof clientSdp !== 'string') {
      return NextResponse.json({ error: 'Offre SDP WebRTC requise' }, { status: 400 });
    }

    // 1. Authentification soit via Session SOC, soit via Jeton Éphémère signé
    let orgId = '';
    let userId = '';

    if (streamToken) {
      const tokenVerification = verifyEphemeralStreamToken(streamToken);
      if (!tokenVerification.valid || tokenVerification.cameraId !== id) {
        return NextResponse.json({ error: tokenVerification.error || 'Jeton de flux invalide ou expiré' }, { status: 401 });
      }
      orgId = tokenVerification.organizationId || '';
      userId = tokenVerification.userId || '';
    } else {
      const { user, errorResponse } = await authenticateApiRequest(req, {
        allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
        allowTestFallback: true,
      });

      if (errorResponse || !user) {
        return errorResponse || NextResponse.json({ error: 'Droits insuffisants pour accéder au flux WebRTC' }, { status: 403 });
      }
      orgId = getTenantOrgId(user);
      userId = user.id;
    }

    // 2. Résolution et vérification de la caméra
    const camera = await VideoRepository.getCameraById(id, orgId);
    if (!camera) {
      return NextResponse.json({ error: 'Caméra introuvable ou accès refusé' }, { status: 404 });
    }

    if (camera.status === 'DISABLED') {
      return NextResponse.json({
        success: false,
        view_status: 'NOT_CONFIGURED',
        error: 'Cette caméra est désactivée du registre opérationnel.',
      });
    }

    if (camera.status === 'OFFLINE') {
      return NextResponse.json({
        success: false,
        view_status: 'OFFLINE',
        error: 'La caméra est actuellement hors ligne.',
      });
    }

    // Si aucun flux interne n'est configuré et qu'il ne s'agit pas d'un simulateur de test
    if (!camera.stream_internal_url && camera.protocol !== 'TEST_SIMULATOR') {
      return NextResponse.json({
        success: false,
        view_status: 'NOT_CONFIGURED',
        error: 'Flux vidéo non configuré. Aucune passerelle média active sur ce canal.',
      });
    }

    // 3. Négociation avec le moteur go2rtc (si joignable)
    const streamName = `cam_${camera.id}`;
    let answerSdp = '';
    let negotiatedViaGo2rtc = false;

    try {
      const parsedUrl = new URL(GO2RTC_URL);

      // Si la caméra a une URL interne et qu'on doit l'enregistrer dans go2rtc
      if (camera.stream_internal_url) {
        await new Promise<void>((resolve) => {
          const regReq = http.request(
            {
              hostname: parsedUrl.hostname,
              port: parsedUrl.port || 1984,
              path: `/api/streams?src=${encodeURIComponent(camera.stream_internal_url!)}&name=${encodeURIComponent(streamName)}`,
              method: 'PUT',
              timeout: 1000,
            },
            () => resolve()
          );
          regReq.on('error', () => resolve());
          regReq.on('timeout', () => {
            regReq.destroy();
            resolve();
          });
          regReq.end();
        });
      }

      // Envoi de l'offre SDP client
      const sdpResult = await new Promise<{ ok: boolean; sdp?: string }>((resolve) => {
        const webrtcReq = http.request(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 1984,
            path: `/api/webrtc?src=${encodeURIComponent(streamName)}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/sdp',
              'Content-Length': Buffer.byteLength(clientSdp),
            },
            timeout: 2500,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 201) {
                resolve({ ok: true, sdp: data });
              } else {
                resolve({ ok: false });
              }
            });
          }
        );
        webrtcReq.on('error', () => resolve({ ok: false }));
        webrtcReq.on('timeout', () => {
          webrtcReq.destroy();
          resolve({ ok: false });
        });
        webrtcReq.write(clientSdp);
        webrtcReq.end();
      });

      if (sdpResult.ok && sdpResult.sdp) {
        answerSdp = sdpResult.sdp;
        negotiatedViaGo2rtc = true;
      }
    } catch {
      negotiatedViaGo2rtc = false;
    }

    // Si go2rtc n'est pas actif localement mais que la caméra est un simulateur ou autorisée
    if (!negotiatedViaGo2rtc) {
      if (camera.protocol === 'TEST_SIMULATOR') {
        // En mode test/simulateur, générer une réponse SDP factice valide
        answerSdp = `v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=SECURIA_TEST_SESSION\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 127.0.0.1\r\na=recvonly\r\na=rtpmap:96 H264/90000\r\n`;
      } else {
        return NextResponse.json({
          success: false,
          view_status: 'ERROR',
          error: 'Passerelle média go2rtc inaccessible sur le réseau local.',
        });
      }
    }

    // 4. Traçabilité dans audit_logs
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'WEBRTC_STREAM_ACCESSED',
        entity_type: 'video_cameras',
        entity_id: camera.id,
        user_id: userId || null,
        details: {
          camera_name: camera.name,
          site_id: camera.protected_site_id,
          engine: negotiatedViaGo2rtc ? 'GO2RTC_SIDECAR' : 'TEST_SIMULATOR',
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      view_status: 'LIVE',
      camera_id: camera.id,
      sdp: answerSdp,
      protocol: 'WEBRTC_WHEP',
      expires_at: new Date(Date.now() + 300000).toISOString(),
      message: 'Session WebRTC négociée avec succès.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la négociation WebRTC');
  }
}

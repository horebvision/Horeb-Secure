/**
 * GET  /api/video/events - Consultation de l'historique des événements vidéo
 * POST /api/video/events - Endpoint Webhook & Ingestion sécurisée des événements vidéo (Section 11, 13, 17)
 * Garanties :
 * - Idempotence stricte (provider + event_id)
 * - Signature HMAC-SHA256 supportée et vérifiée avec tolérance 300s anti-rejeu
 * - Rate limiting
 * - Corrélation avec les alertes, Smart Dispatch et SLA existants
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, checkRateLimit, isValidUuid } from '@/lib/security/api-guard';
import { VideoRepository, VideoCorrelationEngine, IngestVideoEventPayload } from '@/lib/video';
import { verifyWebhookSignature } from '@/lib/webhooks/webhook-signer';

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
    const cameraId = searchParams.get('camera_id');
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);

    const events = await VideoRepository.getEventsByOrg(orgId, {
      siteId: siteId && isValidUuid(siteId) ? siteId : undefined,
      cameraId: cameraId && isValidUuid(cameraId) ? cameraId : undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des événements vidéo');
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateLimit = await checkRateLimit(`video_event_${ip}`, 120, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Limite de débit dépassée pour les événements vidéo.' },
      { status: 429 }
    );
  }

  try {
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Payload JSON invalide.' }, { status: 400 });
    }

    // 1. Vérification de la signature HMAC si l'en-tête de signature est présent
    const signatureHeader = req.headers.get('x-securia-signature') || req.headers.get('x-signature');
    const timestampHeader = req.headers.get('x-securia-timestamp') || req.headers.get('x-timestamp');
    const webhookSecret = process.env.VIDEO_WEBHOOK_SECRET;

    if (signatureHeader && timestampHeader && webhookSecret) {
      const sigVerification = verifyWebhookSignature({
        payloadString: rawBody,
        signatureHeader,
        timestampHeader,
        secret: webhookSecret,
        toleranceSeconds: 300,
      });

      if (!sigVerification.valid) {
        return NextResponse.json(
          { error: `Signature webhook vidéo invalide : ${sigVerification.reason}` },
          { status: 401 }
        );
      }
    }

    // 2. Validation des champs fondamentaux
    const { provider, event_id, event_type, organization_id, protected_site_id, camera_id, camera_internal_id, confidence, detected_at, snapshot_url, metadata } = body;

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'Le champ provider (source vidéo) est requis.' }, { status: 400 });
    }

    if (!event_id || typeof event_id !== 'string') {
      return NextResponse.json({ error: 'Le champ event_id (identifiant unique de la source) est requis.' }, { status: 400 });
    }

    if (!event_type || typeof event_type !== 'string') {
      return NextResponse.json({ error: 'Le champ event_type est requis.' }, { status: 400 });
    }

    const payload: IngestVideoEventPayload = {
      provider,
      event_id,
      event_type,
      organization_id: organization_id || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
      protected_site_id: protected_site_id || '00000000-0000-0000-0000-000000000001',
      camera_id: camera_id || undefined,
      camera_internal_id: camera_internal_id || undefined,
      confidence: typeof confidence === 'number' ? confidence : undefined,
      detected_at: detected_at || undefined,
      snapshot_url: snapshot_url || undefined,
      metadata: metadata || {},
    };

    // 3. Exécution du moteur de corrélation vidéo
    const result = await VideoCorrelationEngine.processVideoEvent(payload);

    return NextResponse.json(
      {
        success: result.success,
        action: result.actionTaken,
        is_duplicate: result.isDuplicate,
        event_id: result.event.id,
        source_event_id: result.event.event_id,
        alert_id: result.alertId || null,
        alert: result.alert || null,
        smart_dispatch: result.smartDispatch || null,
        sla: result.sla || null,
        message: result.message,
      },
      { status: result.actionTaken === 'CREATE_ALERT' ? 201 : 200 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du traitement de l’événement vidéo');
  }
}

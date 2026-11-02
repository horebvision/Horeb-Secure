/**
 * POST /api/video/gateways/events - Ingestion sécurisée des événements vidéo depuis l'Edge Gateway
 * Prend en charge l'ingestion unitaire ou par lot (Batch Sync) en cas de reprise après coupure réseau
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse, checkRateLimit } from '@/lib/security/api-guard';
import { VideoCorrelationEngine, VideoRepository } from '@/lib/video';
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
    const rawEvents = Array.isArray(body) ? body : (Array.isArray(body.events) ? body.events : [body]);

    if (rawEvents.length === 0) {
      return NextResponse.json({ error: 'Aucun événement à traiter.' }, { status: 400 });
    }

    const results = [];
    let alertsCreated = 0;
    let duplicates = 0;

    for (const raw of rawEvents) {
      const payload = {
        provider: raw.provider || 'EDGE_GATEWAY',
        event_id: raw.event_id,
        // L'organisation est TOUJOURS celle de la passerelle authentifiée (jamais celle annoncée)
        organization_id: gateway.organization_id,
        protected_site_id: raw.protected_site_id,
        camera_id: raw.camera_id,
        camera_internal_id: raw.camera_internal_id,
        event_type: raw.event_type,
        confidence: raw.confidence,
        detected_at: raw.detected_at || raw.timestamp,
        snapshot_url: raw.snapshot_url,
        metadata: {
          ...raw.metadata,
          gateway_id: gatewayId,
          forwarded_via: 'SECURIA_EDGE_GATEWAY',
          offline_buffered: !!raw.offline_buffered,
        },
      };

      if (!payload.event_id || !payload.event_type || !payload.protected_site_id) continue;

      // Le site doit appartenir à l'organisation de la passerelle
      const { data: ownedSite } = await supabaseAdmin
        .from('protected_sites')
        .select('id')
        .eq('id', payload.protected_site_id)
        .eq('organization_id', gateway.organization_id)
        .maybeSingle();
      if (!ownedSite) continue;

      const correlationResult = await VideoCorrelationEngine.processVideoEvent(payload);
      if (correlationResult.actionTaken === 'CREATE_ALERT') alertsCreated++;
      if (correlationResult.isDuplicate) duplicates++;

      results.push({
        event_id: payload.event_id,
        status: correlationResult.event.status,
        action: correlationResult.actionTaken,
        is_duplicate: correlationResult.isDuplicate,
        alert_id: correlationResult.alertId,
      });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      alerts_created: alertsCreated,
      duplicates,
      results,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de l’ingestion des événements vidéo Edge');
  }
}

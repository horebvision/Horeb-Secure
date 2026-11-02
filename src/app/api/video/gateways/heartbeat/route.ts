/**
 * POST /api/video/gateways/heartbeat - Ingestion des battements de cœur et métriques
 * Transmis toutes les 30 à 60s par le daemon Edge Gateway
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeErrorResponse, sanitizeString } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function POST(req: NextRequest) {
  try {
    const gatewayId = req.headers.get('x-gateway-id');
    const gatewayToken = req.headers.get('x-gateway-token') || req.headers.get('authorization')?.replace('Bearer ', '');

    const gateway = await VideoRepository.authenticateGateway(gatewayId, gatewayToken || null);
    if (!gateway || !gatewayId) {
      return NextResponse.json({ error: 'Authentification passerelle invalide ou révoquée.' }, { status: 401 });
    }

    const body = await req.json();

    const recorded = await VideoRepository.recordGatewayHeartbeat(gatewayId, {
      gateway_id: gatewayId,
      version: sanitizeString(body.version) || '0.1.0',
      status: 'ONLINE',
      cpu_pct: typeof body.cpu_pct === 'number' ? body.cpu_pct : undefined,
      mem_used_mb: typeof body.mem_used_mb === 'number' ? body.mem_used_mb : undefined,
      mem_total_mb: typeof body.mem_total_mb === 'number' ? body.mem_total_mb : undefined,
      cameras_status: body.cameras_status || {},
      uptime_seconds: typeof body.uptime_seconds === 'number' ? body.uptime_seconds : undefined,
      ip_address_local: body.ip_address_local ? sanitizeString(body.ip_address_local) : undefined,
      timestamp: body.timestamp || new Date().toISOString(),
      queue_length: typeof body.queue_length === 'number' ? body.queue_length : 0,
    });

    if (!recorded) {
      return NextResponse.json({ error: 'Passerelle inconnue ou révoquée.' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      acknowledged_at: new Date().toISOString(),
      next_heartbeat_seconds: 30,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de l’enregistrement du heartbeat');
  }
}

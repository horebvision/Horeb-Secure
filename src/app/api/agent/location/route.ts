import { NextRequest, NextResponse } from 'next/server';
import { broadcastOnce, orgChannelName } from '@/lib/realtime/broadcast';
import { authenticateApiRequest, getScopedDatabaseClient, safeErrorResponse } from '@/lib/security/api-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * POST /api/agent/location
 * Enregistrement haute précision de la position GPS en temps réel de l'agent.
 * Supporte : latitude, longitude, accuracy, heading, speed, altitude, duty_status.
 * Met à jour security_agents et notifie en temps réel.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Accès refusé. Habilitation agent requise.' }, { status: 403 })
      );
    }

    const body = await req.json();
    const lat = Number(body.latitude);
    const lon = Number(body.longitude);
    const accuracy = body.accuracy !== undefined ? Number(body.accuracy) : null;
    const heading = body.heading !== undefined ? Number(body.heading) : null;
    const speed = body.speed !== undefined ? Number(body.speed) : null;
    const dutyStatus = body.duty_status;

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) {
      return NextResponse.json(
        { error: 'Coordonnées GPS invalides. Latitude [-90..90] et Longitude [-180..180] requises.' },
        { status: 400 }
      );
    }

    let targetAgentId = body.agent_id;
    const db = await getScopedDatabaseClient(req);

    // Si c'est l'agent connecté, cibler son propre compte
    if (user.role === 'AGENT') {
      let { data: agentRec } = await db
        .from('security_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!agentRec) {
        const badge = `AGT-${user.id.substring(0, 6).toUpperCase()}`;
        const { data: newAgent } = await db
          .from('security_agents')
          .insert({
            user_id: user.id,
            organization_id: user.organizationId || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
            security_center_id: user.securityCenterId || '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
            badge_number: badge,
            duty_status: dutyStatus || 'AVAILABLE',
            patrol_vehicle: 'Patrouille Alpha Securia',
            current_latitude: lat,
            current_longitude: lon,
            last_location_update: new Date().toISOString(),
            is_active: true,
          })
          .select('id')
          .single();
        agentRec = newAgent;
      }

      if (agentRec) {
        targetAgentId = agentRec.id;
      }
    }

    if (!targetAgentId) {
      return NextResponse.json(
        { error: 'Compte agent de sécurité introuvable pour cet utilisateur.' },
        { status: 404 }
      );
    }

    const updatePayload: any = {
      current_latitude: lat,
      current_longitude: lon,
      last_location_update: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (dutyStatus && ['AVAILABLE', 'BUSY', 'OFF_DUTY', 'DISPATCHED'].includes(dutyStatus)) {
      updatePayload.duty_status = dutyStatus;
    }

    const { data: updatedAgent, error: updateErr } = await db
      .from('security_agents')
      .update(updatePayload)
      .eq('id', targetAgentId)
      .select('id, user_id, badge_number, duty_status, current_latitude, current_longitude, last_location_update')
      .maybeSingle();

    if (updateErr) {
      return safeErrorResponse(updateErr, 'Erreur lors de la mise à jour de la localisation GPS');
    }

    // Diffusion temps réel immédiate sur le canal de tracking (latence sub-seconde)
    try {
      if (user.organizationId) {
        await broadcastOnce(orgChannelName('realtime_tracking', user.organizationId), 'agent_location', {
          agent_id: targetAgentId,
          badge_number: updatedAgent?.badge_number,
          organization_id: user.organizationId,
          latitude: lat,
          longitude: lon,
          accuracy,
          heading,
          speed,
          duty_status: updatedAgent?.duty_status,
          timestamp: updatePayload.last_location_update,
        });
      }
    } catch (realtimeErr) {
      console.warn('[Agent Location API] Note diffusion Realtime:', realtimeErr);
    }

    return NextResponse.json({
      success: true,
      agent_id: targetAgentId,
      latitude: lat,
      longitude: lon,
      accuracy,
      duty_status: updatedAgent?.duty_status,
      timestamp: updatePayload.last_location_update,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’actualisation de la localisation');
  }
}

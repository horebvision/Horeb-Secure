import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/agents
 * API Publique v1 — Liste des agents de sécurité de l'organisation
 * Header requis : X-SECURIA-API-KEY ou session autorisée
 * Scope requis : agents:read
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'agents:read');
    if (response || !auth) return response!;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
    const status = searchParams.get('status');

    let q = supabaseAdmin
      .from('security_agents')
      .select('id, user_id, badge_number, patrol_vehicle, duty_status, current_latitude, current_longitude, last_location_update, organization_id, user:users(id, full_name, phone, email, organization_id)')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      q = q.eq('duty_status', status);
    }

    const { data: agents, error } = await q;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const mappedAgents = (agents || []).map((agent: any) => ({
      id: agent.id,
      user_id: agent.user_id,
      full_name: agent.user?.full_name || 'Agent',
      badge_number: agent.badge_number || 'N/D',
      patrol_vehicle: agent.patrol_vehicle || 'N/D',
      duty_status: agent.duty_status,
      current_location: agent.current_latitude && agent.current_longitude ? {
        latitude: agent.current_latitude,
        longitude: agent.current_longitude,
        last_update: agent.last_location_update,
      } : null,
    }));

    return NextResponse.json({
      success: true,
      count: mappedAgents.length,
      agents: mappedAgents,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

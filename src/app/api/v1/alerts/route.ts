import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/alerts
 * API Publique v1 — Liste des alertes de l'organisation
 * Header requis : X-SECURIA-API-KEY ou session autorisée
 * Scope requis : alerts:read
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'alerts:read');
    if (response || !auth) return response!;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
    const status = searchParams.get('status');

    let q = supabaseAdmin
      .from('alerts')
      .select('id, alert_number, type, priority, status, created_at, acknowledged_at, assigned_at, en_route_at, arrived_at, resolved_at, site_id, user_id, assigned_agent_id')
      .eq('organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) q = q.eq('status', status);

    const { data: alerts, error } = await q;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: alerts?.length || 0,
      alerts: alerts || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

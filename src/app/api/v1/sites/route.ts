import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/sites
 * API Publique v1 — Liste des sites protégés de l'organisation
 * Header requis : X-SECURIA-API-KEY ou session autorisée
 * Scope requis : sites:read
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'sites:read');
    if (response || !auth) return response!;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const { data: sites, error } = await supabaseAdmin
      .from('protected_sites')
      .select('id, name, address, city, latitude, longitude, access_instructions, organization_id, owner_id')
      .eq('organization_id', auth.organizationId)
      .order('name', { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: sites?.length || 0,
      sites: sites || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

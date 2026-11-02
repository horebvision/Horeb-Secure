import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/clients
 * API Publique v1 — Liste des clients (comptes utilisateurs) de l'organisation
 * Header requis : X-SECURIA-API-KEY ou session autorisée
 * Scope requis : clients:read
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'clients:read');
    if (response || !auth) return response!;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const { data: clients, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email, phone, is_active, created_at, organization_id')
      .eq('organization_id', auth.organizationId)
      .eq('role', 'USER')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: clients?.length || 0,
      clients: clients || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

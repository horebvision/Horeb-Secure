import { NextRequest, NextResponse } from 'next/server';
import { authenticateV1Request } from '@/lib/api-keys/api-key-guard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/interventions
 * API Publique v1 — Liste des interventions et rapports
 * Scope requis : interventions:read
 * 
 * Isolation multi-tenant stricte :
 * - Jointure interne SQL PostgREST sur alerts(organization_id)
 * - Aucune transmission de listes d'IDs dans l'URL (immunisé contre HTTP 414 URI Too Long)
 * - Pagination serveur avec .range(offset, offset + limit - 1)
 * - Double validation de sécurité en mémoire (défense en profondeur)
 */
export async function GET(req: NextRequest) {
  try {
    const { auth, response } = await authenticateV1Request(req, 'interventions:read');
    if (response || !auth) return response!;

    if (!auth.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Organisation non définie dans le contexte d\'authentification' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const status = searchParams.get('status');

    // Requête isolée par jointure interne autoritaire en base de données
    let q = supabaseAdmin
      .from('interventions')
      .select(`
        id,
        status,
        report,
        assigned_at,
        accepted_at,
        en_route_at,
        arrived_at,
        resolved_at,
        created_at,
        updated_at,
        agent_id,
        security_center_id,
        alert_id,
        alert:alerts!fk_interventions_alert!inner (
          id,
          alert_number,
          type,
          priority,
          status,
          created_at,
          organization_id
        )
      `)
      .eq('alert.organization_id', auth.organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      q = q.eq('status', status);
    }

    const { data: scopedList, error } = await q;

    if (error) {
      console.error('[API /api/v1/interventions] Erreur requête SQL:', error);
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la récupération des interventions' },
        { status: 500 }
      );
    }

    // Défense en profondeur : vérification stricte en mémoire que 100% des interventions
    // appartiennent à l'organisation authentifiée
    const verifiedInterventions = (scopedList || []).filter(
      (item: any) => item.alert && item.alert.organization_id === auth.organizationId
    );

    return NextResponse.json({
      success: true,
      count: verifiedInterventions.length,
      offset,
      limit,
      interventions: verifiedInterventions,
    });
  } catch (err: any) {
    console.error('[API /api/v1/interventions] Exception non interceptée:', err);
    return NextResponse.json(
      { success: false, error: 'Une erreur interne est survenue' },
      { status: 500 }
    );
  }
}

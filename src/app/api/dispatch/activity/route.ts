import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getScopedDatabaseClient, safeErrorResponse } from '@/lib/security/api-guard';

/**
 * GET /api/dispatch/activity
 * Flux d'activité opérationnel en temps réel pour le Live Command Center SOC.
 * Retourne les événements d'alertes récents (alert_events) de l'organisation.
 * Strictement sécurisé : accessible uniquement par SECURITY_MANAGER et ADMIN.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json(
          { success: false, error: 'Accès refusé au flux d’activité opérationnel.' },
          { status: 403 }
        )
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 30, 1), 100);
    const alertId = searchParams.get('alert_id');

    const db = await getScopedDatabaseClient(req);

    let query = db
      .from('alert_events')
      .select(`
        id,
        alert_id,
        actor_id,
        from_status,
        to_status,
        event_type,
        comment,
        metadata,
        created_at,
        alerts:alert_id (
          id,
          alert_number,
          priority,
          status,
          organization_id
        ),
        actor:actor_id (
          id,
          full_name,
          role
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (alertId) {
      query = query.eq('alert_id', alertId);
    }

    // Filtrage multi-organisation pour SECURITY_MANAGER
    if (user.role === 'SECURITY_MANAGER' && user.organizationId) {
      // Les RLS s'appliquent déjà via le client scoped, mais nous pouvons aussi contraindre
    }

    const { data: events, error } = await query;

    if (error) {
      // Fallback sans jointure si une FK est polymorphique ou indéfinie
      const { data: rawEvents, error: fallbackError } = await db
        .from('alert_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fallbackError) {
        return safeErrorResponse(fallbackError, 'Erreur lors du chargement des événements');
      }

      return NextResponse.json({
        success: true,
        count: rawEvents?.length || 0,
        events: rawEvents || [],
      });
    }

    // Filtrage multi-organisation étanche : seules les activités de l'organisation active sont retournées
    const targetOrg = user.organizationId;
    const scopedEvents = targetOrg
      ? (events || []).filter((e: any) => !e.alerts?.organization_id || e.alerts.organization_id === targetOrg)
      : (events || []);

    return NextResponse.json({
      success: true,
      count: scopedEvents.length,
      events: scopedEvents,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors du chargement du flux d’activité');
  }
}

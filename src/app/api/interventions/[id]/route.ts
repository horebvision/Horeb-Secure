import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * GET /api/interventions/[id]
 * Récupère le dossier d'une intervention avec contrôle strict des accès (anti-IDOR) :
 * - Un USER ne peut consulter QUE l'intervention liée à sa propre alerte
 * - Un AGENT ne peut consulter QUE l'intervention qui lui est affectée
 * - Les RÉGULATEURS et ADMINS supervisent l'organisation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'Identifiant d’intervention invalide (format UUID)' }, { status: 400 });
    }

    const { data: result, error: rpcError } = await (supabaseAdmin as any).rpc('get_intervention_detail', {
      p_intervention_id: id,
      p_user_id: user.id,
      p_role: user.role,
    });

    let intervention = null;
    let events: any[] = [];

    if (!rpcError && result && result.success && result.intervention) {
      intervention = result.intervention;
      events = result.events || [];
    } else {
      // Requête relationnelle complète avec support lookup par intervention ID ou alert ID
      const { data: dbIntervention } = await supabaseAdmin
        .from('interventions')
        .select(`
          *,
          alerts (
            id,
            alert_number,
            type,
            priority,
            status,
            created_at,
            user_id,
            organization_id,
            security_center_id,
            location_address,
            latitude,
            longitude,
            client_notes,
            protected_sites (
              id,
              name,
              address,
              city,
              postal_code,
              latitude,
              longitude,
              access_instructions
            ),
            users:user_id (
              id,
              full_name,
              phone,
              email
            )
          ),
          security_agents (
            id,
            badge_number,
            user_id,
            patrol_vehicle,
            duty_status,
            users:user_id (
              id,
              full_name,
              phone
            )
          )
        `)
        .or(`id.eq.${id},alert_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!dbIntervention) {
        return NextResponse.json({ success: false, error: 'Intervention introuvable' }, { status: 404 });
      }

      intervention = dbIntervention;

      // Récupération des événements d'alerte horodatés
      const targetAlertId = intervention.alerts?.id || intervention.alert_id;
      if (targetAlertId) {
        const { data: dbEvents } = await supabaseAdmin
          .from('alert_events')
          .select('id, event_type, actor_id, from_status, to_status, comment, description, created_at')
          .eq('alert_id', targetAlertId)
          .order('created_at', { ascending: true });
        events = dbEvents || [];
      }
    }

    // Contrôle d'accès strict multi-tenant et RBAC
    const alertOrgId = intervention?.alerts?.organization_id || intervention?.organization_id;
    if (alertOrgId && !user.isPlatformAdmin && user.organizationId && alertOrgId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès interdit. Cette intervention appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    if (user.role === 'USER') {
      const ownerId = intervention?.alerts?.user_id;
      if (ownerId && ownerId !== user.id) {
        return NextResponse.json(
          { success: false, error: 'Accès non autorisé à cette intervention.' },
          { status: 403 }
        );
      }
    } else if (user.role === 'AGENT') {
      // Un agent de terrain ne peut consulter QUE l'intervention qui lui est affectée
      const assignedUserId = intervention?.security_agents?.user_id;
      let isAssigned = assignedUserId === user.id;

      if (!isAssigned) {
        const { data: myAgent } = await supabaseAdmin
          .from('security_agents')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (
          myAgent &&
          (myAgent.id === intervention.agent_id ||
            myAgent.id === intervention.alerts?.assigned_agent_id ||
            user.id === intervention.alerts?.assigned_agent_id)
        ) {
          isAssigned = true;
        }
      }

      if (!isAssigned) {
        return NextResponse.json(
          { success: false, error: 'Accès interdit. Vous n’êtes pas le patrouilleur affecté à cette mission.' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      intervention,
      events,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation du dossier d’intervention');
  }
}

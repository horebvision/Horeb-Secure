import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/modules/notifications/notification.service';
import {
  authenticateApiRequest,
  isValidUuid,
  sanitizeString,
  safeErrorResponse,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/alerts/assign
 * Prise en charge et affectation opérationnelle d'une alerte à un agent patrouilleur et un centre de sécurité.
 * Habilitations : Rôles SECURITY_MANAGER et ADMIN uniquement.
 * Garanties :
 * 1. Isolation multi-tenant stricte (incident, agent et centre doivent appartenir au même tenant).
 * 2. Contrôle de disponibilité réelle (agent actif, non OFF_DUTY, sans intervention active en cours).
 * 3. Contrôle de centre actif (centre rattaché opérationnel et actif).
 * 4. Prévention atomique des conflits de concurrence (optimistic test-and-set sans dirty writes).
 * 5. Traçabilité complète (alert_events, audit_logs et notifications push/in-app).
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls les RÉGULATEURS SOC et ADMINS peuvent affecter un agent
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json(
          { success: false, error: 'Accès refusé. Habilitation superviseur SOC requise.' },
          { status: 403 }
        )
      );
    }

    const body = await req.json();
    const { alert_id, agent_id, security_center_id, notes, source, score, distance_km } = body;

    if (!alert_id || !isValidUuid(alert_id) || !agent_id || !isValidUuid(agent_id)) {
      return NextResponse.json(
        { success: false, error: 'alert_id et agent_id valides (format UUID) sont requis.' },
        { status: 400 }
      );
    }

    if (security_center_id && !isValidUuid(security_center_id)) {
      return NextResponse.json(
        { success: false, error: 'security_center_id doit être un UUID valide.' },
        { status: 400 }
      );
    }

    const sanitizedNotes = notes ? sanitizeString(notes, 1000) : null;
    const resolvedDispatcherId = user.id;

    // 2. VÉRIFICATION D'EXISTENCE DE L'ALERTE ET CONTRÔLE MULTI-TENANT
    const { data: currentAlert, error: alertFetchErr } = await supabaseAdmin
      .from('alerts')
      .select(`
        id,
        organization_id,
        status,
        assigned_agent_id,
        intervention_id,
        alert_number,
        type,
        priority,
        location_address,
        user_id,
        security_center_id
      `)
      .eq('id', alert_id)
      .maybeSingle();

    if (alertFetchErr || !currentAlert) {
      return NextResponse.json(
        { success: false, error: 'Dossier d’alerte introuvable.' },
        { status: 404 }
      );
    }

    // Protection Anti-IDOR : Le superviseur doit appartenir à la même organisation que l'alerte (sauf Super Admin)
    if (
      user.role !== 'ADMIN' &&
      user.organizationId &&
      currentAlert.organization_id &&
      user.organizationId !== currentAlert.organization_id
    ) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé : Cette alerte appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    // Vérification de statut assignable
    const assignableStatuses = ['CREATED', 'SENT', 'RECEIVED', 'ACKNOWLEDGED'];
    if (!assignableStatuses.includes(currentAlert.status) || currentAlert.assigned_agent_id) {
      return NextResponse.json(
        {
          success: false,
          error: `Conflit d’affectation : Cette alerte a déjà été prise en charge (statut actuel : ${currentAlert.status}).`,
          alreadyAssigned: true,
          currentStatus: currentAlert.status,
          assignedAgentId: currentAlert.assigned_agent_id,
        },
        { status: 409 }
      );
    }

    // 3. VÉRIFICATION STRICTE DE L'AGENT ET DE SON ORGANISATION
    const { data: agRecord, error: agErr } = await supabaseAdmin
      .from('security_agents')
      .select(`
        id,
        user_id,
        organization_id,
        security_center_id,
        badge_number,
        duty_status,
        is_active,
        user:users!user_id(id, full_name, phone, email, is_active)
      `)
      .or(`id.eq.${agent_id},user_id.eq.${agent_id}`)
      .maybeSingle();

    if (agErr || !agRecord) {
      return NextResponse.json(
        { success: false, error: 'Agent de sécurité introuvable.' },
        { status: 404 }
      );
    }

    // RÈGLE ABSOLUE : L'agent doit appartenir à la même organisation que l'incident
    if (
      currentAlert.organization_id &&
      agRecord.organization_id &&
      currentAlert.organization_id !== agRecord.organization_id
    ) {
      return NextResponse.json(
        { success: false, error: 'Violation d’isolation multi-tenant : L’agent sélectionné appartient à une organisation différente de celle de l’incident.' },
        { status: 403 }
      );
    }

    // Vérifier que le compte de l'agent et son profil utilisateur sont actifs
    const agUser: any = Array.isArray(agRecord.user) ? agRecord.user[0] : agRecord.user;
    if (!agRecord.is_active || (agUser && agUser.is_active === false)) {
      return NextResponse.json(
        { success: false, error: 'Impossible d’assigner cet agent : Son compte opérationnel est actuellement désactivé.' },
        { status: 400 }
      );
    }

    // Vérifier que l'agent n'est pas hors service
    if (agRecord.duty_status === 'OFF_DUTY') {
      return NextResponse.json(
        { success: false, error: 'Impossible d’assigner cet agent : Il est actuellement hors service (OFF_DUTY).' },
        { status: 400 }
      );
    }

    const targetAgentId = agRecord.id;

    // VÉRIFICATION D'ABSENCE D'INTERVENTION ACTIVE EN COURS POUR CET AGENT
    const { data: ongoingIntervention } = await supabaseAdmin
      .from('interventions')
      .select('id, status, alert_id')
      .eq('agent_id', targetAgentId)
      .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'])
      .maybeSingle();

    if (ongoingIntervention) {
      return NextResponse.json(
        {
          success: false,
          error: `Impossible d'affecter l'agent ${agRecord.badge_number} (${agUser?.full_name}) : il est déjà engagé sur une mission active (intervention ${ongoingIntervention.id.substring(0, 8)}, statut ${ongoingIntervention.status}).`,
          agentBusy: true,
        },
        { status: 409 }
      );
    }

    // 4. RÉSOLUTION ET VÉRIFICATION DU CENTRE DE SÉCURITÉ
    const resolvedCenterId = security_center_id || currentAlert.security_center_id || agRecord.security_center_id;
    let validatedCenter: any = null;

    if (resolvedCenterId) {
      const { data: centerRecord } = await supabaseAdmin
        .from('security_centers')
        .select('id, name, code, organization_id, is_active')
        .eq('id', resolvedCenterId)
        .maybeSingle();

      if (!centerRecord) {
        return NextResponse.json(
          { success: false, error: 'Le centre de sécurité rattaché est introuvable.' },
          { status: 400 }
        );
      }

      if (!centerRecord.is_active) {
        return NextResponse.json(
          {
            success: false,
            error: `Impossible d'affecter l'alerte à ce centre : le centre "${centerRecord.name}" (${centerRecord.code}) est actuellement inactif.`,
          },
          { status: 400 }
        );
      }

      if (currentAlert.organization_id && centerRecord.organization_id !== currentAlert.organization_id) {
        return NextResponse.json(
          {
            success: false,
            error: 'Incohérence multi-tenant : Le centre de sécurité rattaché n’appartient pas à la même organisation que l’alerte.',
          },
          { status: 400 }
        );
      }

      validatedCenter = centerRecord;
    }

    const now = new Date().toISOString();
    const interventionId = crypto.randomUUID();
    const assignSource = source === 'SMART_DISPATCH' ? 'SMART_DISPATCH' : 'MANUAL_DISPATCH';

    // 5. ATOMIC OPTIMISTIC TEST-AND-SET : VERROUILLAGE CONCURRENT DE L'ALERTE
    // Garantit qu'un seul régulateur concurrent peut assigner cette alerte
    const { data: lockedAlert, error: alertLockErr } = await supabaseAdmin
      .from('alerts')
      .update({
        status: 'ASSIGNED',
        assigned_agent_id: targetAgentId,
        intervention_id: interventionId,
        security_center_id: resolvedCenterId || null,
        updated_at: now,
      })
      .eq('id', alert_id)
      .in('status', assignableStatuses)
      .is('assigned_agent_id', null)
      .select('id, alert_number, status, assigned_agent_id')
      .maybeSingle();

    if (alertLockErr || !lockedAlert) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conflit de concurrence : Cette alerte vient d’être prise en charge par un autre régulateur.',
          alreadyAssigned: true,
        },
        { status: 409 }
      );
    }

    // 6. ATOMIC OPTIMISTIC TEST-AND-SET : VERROUILLAGE CONCURRENT DE L'AGENT
    // Garantit que l'agent est immédiatement marqué DISPATCHED et ne peut être double-assigné
    const { data: lockedAgent, error: agentLockErr } = await supabaseAdmin
      .from('security_agents')
      .update({
        duty_status: 'DISPATCHED',
        updated_at: now,
      })
      .eq('id', targetAgentId)
      .eq('duty_status', 'AVAILABLE')
      .select('id, badge_number, duty_status')
      .maybeSingle();

    if (agentLockErr || !lockedAgent) {
      // Rollback immédiat du verrou sur l'alerte
      await supabaseAdmin
        .from('alerts')
        .update({
          status: currentAlert.status,
          assigned_agent_id: null,
          intervention_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert_id);

      return NextResponse.json(
        {
          success: false,
          error: `Conflit de concurrence : L'agent ${agRecord.badge_number} vient d'être mobilisé ou n'est plus disponible (statut : ${agRecord.duty_status}).`,
          agentBusy: true,
        },
        { status: 409 }
      );
    }

    // 7. CRÉATION DE L'ENREGISTREMENT D'INTERVENTION
    const { error: intErr } = await supabaseAdmin
      .from('interventions')
      .insert({
        id: interventionId,
        alert_id,
        security_center_id: resolvedCenterId || null,
        agent_id: targetAgentId,
        status: 'PENDING',
        assigned_at: now,
        created_at: now,
        updated_at: now,
      });

    if (intErr) {
      // Rollback alerte et agent
      await supabaseAdmin
        .from('alerts')
        .update({
          status: currentAlert.status,
          assigned_agent_id: null,
          intervention_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert_id);

      await supabaseAdmin
        .from('security_agents')
        .update({
          duty_status: 'AVAILABLE',
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetAgentId);

      return safeErrorResponse(intErr, 'Erreur lors de la création de la mission d’intervention');
    }

    // 8. TRAÇABILITÉ : ÉVÉNEMENT D'ALERTE
    try {
      await supabaseAdmin.from('alert_events').insert({
        id: crypto.randomUUID(),
        alert_id,
        event_type: 'AGENT_ASSIGNED',
        actor_id: resolvedDispatcherId,
        from_status: currentAlert.status,
        to_status: 'ASSIGNED',
        comment: `Agent ${agUser?.full_name || agRecord.badge_number} (${agRecord.badge_number}) affecté via ${assignSource}.${
          validatedCenter ? ` Centre SOC : ${validatedCenter.name} (${validatedCenter.code}).` : ''
        }`,
        metadata: {
          agent_id: targetAgentId,
          badge_number: agRecord.badge_number,
          security_center_id: resolvedCenterId || null,
          security_center_name: validatedCenter?.name || null,
          source: assignSource,
          score: score || null,
          distance_km: distance_km || null,
          notes: sanitizedNotes,
        },
        created_at: now,
      });
    } catch {}

    // 9. TRAÇABILITÉ : AUDIT LOG DE GOUVERNANCE
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: resolvedDispatcherId,
        action: assignSource === 'SMART_DISPATCH' ? 'SMART_DISPATCH_ASSIGNED' : 'MANUAL_DISPATCH_ASSIGNED',
        entity_type: 'ALERT',
        entity_id: alert_id,
        details: {
          alert_number: currentAlert.alert_number,
          agent_id: targetAgentId,
          badge_number: agRecord.badge_number,
          security_center_id: resolvedCenterId || null,
          source: assignSource,
          score: score || null,
          distance_km: distance_km || null,
          notes: sanitizedNotes,
          assigned_by: resolvedDispatcherId,
        },
        created_at: now,
      });
    } catch {}

    // 10. NOTIFICATIONS MULTI-CANAUX
    try {
      await NotificationService.send({
        user_id: agRecord.user_id,
        agent_id: agRecord.id,
        alert_id: alert_id,
        role: 'AGENT',
        title: `🎯 Mission assignée : ${currentAlert.alert_number}`,
        message: `Urgence ${currentAlert.type} (${currentAlert.priority}) à ${currentAlert.location_address || 'Position d’urgence'}. Départ immédiat requis.`,
        type: 'AGENT_ASSIGNED',
        priority: 'CRITICAL',
        link: '/agent',
        channels: ['IN_APP', 'PUSH', 'SMS'],
      });

      if (currentAlert.user_id) {
        await NotificationService.send({
          user_id: currentAlert.user_id,
          alert_id: alert_id,
          role: 'USER',
          title: '👮 Agent de sécurité affecté',
          message: `L'agent de patrouille (${agRecord.badge_number}) a été affecté à votre alerte ${currentAlert.alert_number}. Préparation de l'intervention.`,
          type: 'INTERVENTION_ACKNOWLEDGED',
          priority: 'HIGH',
          link: `/alert/${alert_id}`,
          channels: ['IN_APP', 'PUSH'],
        });
      }
    } catch {
      // Notification non bloquante
    }

    return NextResponse.json({
      success: true,
      message: `Agent ${agRecord.badge_number} (${agUser?.full_name}) affecté avec succès à l'alerte ${currentAlert.alert_number}.`,
      alert_id,
      assigned_agent_id: targetAgentId,
      intervention_id: interventionId,
      security_center_id: resolvedCenterId || null,
      status: 'ASSIGNED',
      source: assignSource,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’affectation de l’agent');
  }
}

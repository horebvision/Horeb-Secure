import { supabaseAdmin } from '@/lib/supabase/admin';

export type SecuriaInterventionStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'COMPLETED'
  | 'ABORTED';

export type SecuriaAlertStatus =
  | 'CREATED'
  | 'SENT'
  | 'RECEIVED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'FALSE_ALARM'
  | 'ESCALATED';

export type SecuriaAgentDutyStatus = 'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED';

export type AgentLifecycleAction = 'ACCEPT' | 'DEPART' | 'ARRIVE' | 'COMPLETE' | 'ABORT';

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
  isIdempotent?: boolean;
  nextInterventionStatus?: SecuriaInterventionStatus;
  nextAlertStatus?: SecuriaAlertStatus;
}

export class InterventionLifecycleService {
  /**
   * Récupère les autres interventions actives d'un agent de sécurité
   * Statuts actifs : PENDING, ACCEPTED, EN_ROUTE, ON_SITE
   */
  static async getActiveInterventionsForAgent(
    agentId: string,
    excludeInterventionId?: string | null
  ): Promise<any[]> {
    if (!agentId) return [];

    let query = supabaseAdmin
      .from('interventions')
      .select('id, alert_id, status, assigned_at, accepted_at, en_route_at, arrived_at')
      .eq('agent_id', agentId)
      .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

    if (excludeInterventionId) {
      query = query.neq('id', excludeInterventionId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[InterventionLifecycleService] Erreur comptage interventions actives agent:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Calcule le statut opérationnel légitime d'un agent à la fin d'une mission.
   * RÈGLE CRITIQUE : Ne jamais libérer un agent qui possède encore une autre intervention active.
   */
  static async resolveAgentDutyStatusAfterMissionEnd(
    agentId: string,
    endedInterventionId?: string | null
  ): Promise<SecuriaAgentDutyStatus> {
    const activeMissions = await this.getActiveInterventionsForAgent(agentId, endedInterventionId);

    if (activeMissions.length > 0) {
      // L'agent a encore au moins une autre mission en cours
      const hasEnRoute = activeMissions.some((m) => m.status === 'EN_ROUTE');
      if (hasEnRoute) {
        return 'DISPATCHED';
      }
      return 'BUSY';
    }

    // Aucune autre mission active : vérifier si l'agent est actif et en service
    const { data: agentRec } = await supabaseAdmin
      .from('security_agents')
      .select('id, duty_status, is_active')
      .eq('id', agentId)
      .maybeSingle();

    if (agentRec && agentRec.duty_status === 'OFF_DUTY') {
      return 'OFF_DUTY';
    }

    if (agentRec && agentRec.is_active === false) {
      return 'OFF_DUTY';
    }

    return 'AVAILABLE';
  }

  /**
   * Valide strictement la transition d'état déclenchée par un patrouilleur.
   * Empêche les transitions répétées ou désordonnées.
   */
  static validateAgentTransition(
    currentInterventionStatus: SecuriaInterventionStatus,
    currentAlertStatus: SecuriaAlertStatus,
    action: AgentLifecycleAction
  ): TransitionValidationResult {
    // Si l'intervention est dans un statut terminal immuable
    if (currentInterventionStatus === 'COMPLETED') {
      return {
        valid: false,
        reason: 'Cette intervention est déjà clôturée et certifiée (COMPLETED). Aucune modification permise.',
      };
    }
    if (currentInterventionStatus === 'ABORTED') {
      return {
        valid: false,
        reason: 'Cette intervention a été interrompue / abandonnée (ABORTED) et ne peut plus être reprise.',
      };
    }

    // Si l'alerte parente est déjà résolue ou annulée
    if (['RESOLVED', 'CANCELLED'].includes(currentAlertStatus)) {
      return {
        valid: false,
        reason: `Le dossier d'alerte associé est déjà ${currentAlertStatus}.`,
      };
    }

    switch (action) {
      case 'ACCEPT': {
        if (currentInterventionStatus === 'ACCEPTED') {
          return {
            valid: true,
            isIdempotent: true,
            nextInterventionStatus: 'ACCEPTED',
            nextAlertStatus: currentAlertStatus,
          };
        }
        if (currentInterventionStatus !== 'PENDING') {
          return {
            valid: false,
            reason: `Transition invalide : Impossible d'accepter une intervention déjà au statut ${currentInterventionStatus}. Statut attendu : PENDING.`,
          };
        }
        return {
          valid: true,
          nextInterventionStatus: 'ACCEPTED',
          nextAlertStatus: 'ASSIGNED',
        };
      }

      case 'DEPART': {
        if (currentInterventionStatus === 'EN_ROUTE') {
          return {
            valid: true,
            isIdempotent: true,
            nextInterventionStatus: 'EN_ROUTE',
            nextAlertStatus: 'EN_ROUTE',
          };
        }
        if (currentInterventionStatus !== 'ACCEPTED') {
          return {
            valid: false,
            reason: `Transition invalide : L'ordre de mission doit être accepté (ACCEPTED) avant de signaler le départ en route (statut actuel : ${currentInterventionStatus}).`,
          };
        }
        return {
          valid: true,
          nextInterventionStatus: 'EN_ROUTE',
          nextAlertStatus: 'EN_ROUTE',
        };
      }

      case 'ARRIVE': {
        if (currentInterventionStatus === 'ON_SITE') {
          return {
            valid: true,
            isIdempotent: true,
            nextInterventionStatus: 'ON_SITE',
            nextAlertStatus: 'ARRIVED',
          };
        }
        if (currentInterventionStatus !== 'EN_ROUTE') {
          return {
            valid: false,
            reason: `Transition invalide : La patrouille doit être signalée en route (EN_ROUTE) avant de pouvoir confirmer l'arrivée sur site (statut actuel : ${currentInterventionStatus}).`,
          };
        }
        return {
          valid: true,
          nextInterventionStatus: 'ON_SITE',
          nextAlertStatus: 'ARRIVED',
        };
      }

      case 'COMPLETE': {
        if (currentInterventionStatus !== 'ON_SITE') {
          return {
            valid: false,
            reason: `Transition invalide : La mission ne peut être clôturée que si l'agent est arrivé sur les lieux (ON_SITE). Statut actuel : ${currentInterventionStatus}.`,
          };
        }
        return {
          valid: true,
          nextInterventionStatus: 'COMPLETED',
          nextAlertStatus: 'RESOLVED',
        };
      }

      case 'ABORT': {
        // L'abandon est autorisé à tout moment avant la complétion (PENDING, ACCEPTED, EN_ROUTE, ON_SITE)
        return {
          valid: true,
          nextInterventionStatus: 'ABORTED',
          nextAlertStatus: 'ESCALATED',
        };
      }

      default:
        return {
          valid: false,
          reason: `Action inconnue : ${action}`,
        };
    }
  }

  /**
   * Valide la transition opérationnelle déclenchée par un régulateur SOC.
   */
  static validateSocAlertTransition(
    currentAlertStatus: SecuriaAlertStatus,
    targetStatus: SecuriaAlertStatus,
    hasAssignedAgent: boolean,
    hasActiveIntervention: boolean
  ): TransitionValidationResult {
    if (currentAlertStatus === targetStatus) {
      return { valid: true, isIdempotent: true };
    }

    // Dossiers terminaux immuables
    if (currentAlertStatus === 'RESOLVED') {
      return {
        valid: false,
        reason: 'Le dossier d’alerte est clôturé avec rapport certifié (RESOLVED) et ne peut pas être rouvert directement.',
      };
    }
    if (currentAlertStatus === 'CANCELLED') {
      return {
        valid: false,
        reason: 'Cette alerte a été annulée (CANCELLED). Les dossiers annulés ne peuvent plus subir de transitions.',
      };
    }

    switch (targetStatus) {
      case 'ACKNOWLEDGED': {
        if (!['CREATED', 'SENT', 'RECEIVED'].includes(currentAlertStatus)) {
          return {
            valid: false,
            reason: `Impossible de repasser en prise en charge (ACKNOWLEDGED) depuis le statut avancé ${currentAlertStatus}.`,
          };
        }
        return { valid: true };
      }

      case 'EN_ROUTE': {
        if (!hasAssignedAgent) {
          return {
            valid: false,
            reason: 'Impossible de passer en route : aucun patrouilleur n’a été affecté à cette alerte.',
          };
        }
        if (!['ASSIGNED', 'ACKNOWLEDGED'].includes(currentAlertStatus)) {
          return {
            valid: false,
            reason: `Transition impossible vers EN_ROUTE depuis le statut ${currentAlertStatus}.`,
          };
        }
        return { valid: true };
      }

      case 'ARRIVED': {
        if (!hasAssignedAgent) {
          return {
            valid: false,
            reason: 'Impossible de marquer sur site : aucun agent n’est affecté à cette intervention.',
          };
        }
        if (!['EN_ROUTE', 'ASSIGNED'].includes(currentAlertStatus)) {
          return {
            valid: false,
            reason: `Transition vers ARRIVED permise uniquement depuis EN_ROUTE ou ASSIGNED (actuel : ${currentAlertStatus}).`,
          };
        }
        return { valid: true };
      }

      case 'RESOLVED': {
        return { valid: true };
      }

      case 'FALSE_ALARM':
      case 'CANCELLED':
      case 'ESCALATED': {
        return { valid: true };
      }

      default:
        return {
          valid: false,
          reason: `Statut cible non reconnu : ${targetStatus}`,
        };
    }
  }

  /**
   * Exécute de manière transactionnelle et atomique une transition de cycle de vie.
   * Délègue à la procédure stockée PostgreSQL certifiée public.transition_intervention_lifecycle.
   * RÈGLE ABSOLUE : Aucun repli non atomique en cas d'échec SQL.
   */
  static async executeAgentTransition(params: {
    alertId: string;
    agentId: string;
    action: AgentLifecycleAction;
    actorUserId: string;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }) {
    const { alertId, agentId, action, actorUserId, notes, latitude, longitude } = params;

    // Appel autoritaire de la RPC atomique PostgreSQL
    const { data, error } = await (supabaseAdmin as any).rpc('transition_intervention_lifecycle', {
      p_alert_id: alertId,
      p_agent_id: agentId,
      p_action: action,
      p_actor_user_id: actorUserId,
      p_notes: notes || null,
      p_latitude: latitude || null,
      p_longitude: longitude || null,
    });

    if (error) {
      console.error('[InterventionLifecycleService] Erreur RPC transition_intervention_lifecycle:', error);
      const err: any = new Error(error.message || 'Erreur lors de la transition d’intervention');
      // Conversion stricte des codes d'erreur PostgreSQL en statuts HTTP appropriés
      if (error.code === 'P4009') {
        err.status = 409; // Conflit de machine à état ou immuabilité terminale
      } else if (error.code === 'P4003') {
        err.status = 403; // Droits insuffisants, usurpation d'identité ou violation multi-tenant
      } else if (error.code === 'P4001') {
        err.status = 401; // Session non authentifiée ou compte inactif
      } else if (error.code === 'P4004') {
        err.status = 404; // Entité introuvable
      } else if (error.code === 'P4000') {
        err.status = 400; // Paramètre ou compte-rendu obligatoire manquant
      } else {
        err.status = 500;
      }
      // RÈGLE CRITIQUE : NE JAMAIS BASCULER VERS DES MUTATIONS REST SÉQUENTIELLES
      throw err;
    }

    const rpcResult = data as any;

    // Si la transition a détecté une idempotence
    if (rpcResult?.idempotent) {
      return {
        success: true,
        idempotent: true,
        action,
        alertStatus: rpcResult.alert_status,
        agentDutyStatus: rpcResult.agent_duty_status,
        message: rpcResult.message || `Action ${action} déjà enregistrée`,
        rpcResult,
      };
    }

    // Récupération de l'enregistrement d'intervention consolidé
    let updatedInt: any = null;
    if (rpcResult?.intervention_id) {
      const { data: refreshedInt } = await supabaseAdmin
        .from('interventions')
        .select('*')
        .eq('id', rpcResult.intervention_id)
        .maybeSingle();
      updatedInt = refreshedInt;
    }

    return {
      success: true,
      action: rpcResult?.action || action,
      idempotent: false,
      intervention: updatedInt || {
        id: rpcResult?.intervention_id,
        alert_id: rpcResult?.alert_id,
        status: rpcResult?.intervention_status,
        agent_id: rpcResult?.agent_id,
        updated_at: rpcResult?.updated_at,
      },
      alertStatus: rpcResult?.alert_status,
      agentDutyStatus: rpcResult?.agent_duty_status,
      actorType: rpcResult?.actor_type,
      actorUserId: rpcResult?.actor_user_id,
      message: rpcResult?.message || `Action ${action} enregistrée avec succès`,
      rpcResult,
    };
  }

  /**
   * Exécute de manière coordonnée une mise à jour du cycle de vie depuis la console SOC.
   */
  static async executeSocTransition(params: {
    alertId: string;
    targetStatus: SecuriaAlertStatus;
    actorUserId: string;
    actorRole: string;
    actorName?: string;
    comment?: string | null;
    report?: string | null;
  }) {
    const { alertId, targetStatus, actorUserId, actorRole, actorName, comment, report } = params;
    const nowIso = new Date().toISOString();

    // 1. Récupération de l'alerte
    const { data: alert, error: fetchErr } = await supabaseAdmin
      .from('alerts')
      .select('id, alert_number, status, organization_id, security_center_id, assigned_agent_id')
      .eq('id', alertId)
      .maybeSingle();

    if (fetchErr || !alert) {
      throw new Error('Dossier d’alerte introuvable');
    }

    // 2. Recherche d'interventions actives associées
    const { data: activeInterventions } = await supabaseAdmin
      .from('interventions')
      .select('id, status, agent_id, security_center_id')
      .eq('alert_id', alert.id)
      .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

    const hasActiveInt = (activeInterventions?.length || 0) > 0;
    const assignedAgentId = alert.assigned_agent_id || activeInterventions?.[0]?.agent_id;

    // 3. Validation de la transition
    const validation = this.validateSocAlertTransition(
      alert.status as SecuriaAlertStatus,
      targetStatus,
      Boolean(assignedAgentId),
      hasActiveInt
    );

    if (!validation.valid) {
      const err: any = new Error(validation.reason || 'Transition non autorisée');
      err.status = 400;
      throw err;
    }

    if (validation.isIdempotent) {
      return {
        idempotent: true,
        alert,
        message: `L’alerte est déjà dans le statut ${targetStatus}`,
      };
    }

    // 4. Mise à jour de l'alerte
    const updatePayload: Record<string, any> = {
      status: targetStatus,
      updated_at: nowIso,
    };

    if (targetStatus === 'ACKNOWLEDGED') updatePayload.acknowledged_at = nowIso;
    else if (targetStatus === 'EN_ROUTE') updatePayload.en_route_at = nowIso;
    else if (targetStatus === 'ARRIVED') updatePayload.arrived_at = nowIso;
    else if (['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(targetStatus)) {
      updatePayload.resolved_at = nowIso;
      if (report) updatePayload.resolution_report = report;
    }

    const { data: updatedAlert, error: alertUpdateErr } = await supabaseAdmin
      .from('alerts')
      .update(updatePayload)
      .eq('id', alert.id)
      .eq('status', alert.status) // Verrouillage optimiste
      .select()
      .maybeSingle();

    if (alertUpdateErr || !updatedAlert) {
      const conflictErr: any = new Error(
        'Conflit de concurrence : le dossier d’alerte a été modifié par une autre action simultanée.'
      );
      conflictErr.status = 409;
      throw conflictErr;
    }

    // 5. Synchronisation coordonnée des interventions et des statuts agents
    if (targetStatus === 'RESOLVED') {
      await supabaseAdmin
        .from('interventions')
        .update({
          status: 'COMPLETED',
          resolved_at: nowIso,
          report: report || comment || 'Intervention clôturée avec succès par la régulation SOC.',
          updated_at: nowIso,
        })
        .eq('alert_id', alert.id)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (assignedAgentId) {
        const nextDuty = await this.resolveAgentDutyStatusAfterMissionEnd(assignedAgentId);
        await supabaseAdmin
          .from('security_agents')
          .update({ duty_status: nextDuty, updated_at: nowIso })
          .eq('id', assignedAgentId);
      }
    } else if (targetStatus === 'CANCELLED' || targetStatus === 'FALSE_ALARM') {
      await supabaseAdmin
        .from('interventions')
        .update({
          status: 'ABORTED',
          report: comment || `Intervention arrêtée (${targetStatus}).`,
          updated_at: nowIso,
        })
        .eq('alert_id', alert.id)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (assignedAgentId) {
        const nextDuty = await this.resolveAgentDutyStatusAfterMissionEnd(assignedAgentId);
        await supabaseAdmin
          .from('security_agents')
          .update({ duty_status: nextDuty, updated_at: nowIso })
          .eq('id', assignedAgentId);
      }
    } else if (targetStatus === 'EN_ROUTE') {
      await supabaseAdmin
        .from('interventions')
        .update({
          status: 'EN_ROUTE',
          en_route_at: nowIso,
          updated_at: nowIso,
        })
        .eq('alert_id', alert.id)
        .in('status', ['PENDING', 'ACCEPTED']);

      if (assignedAgentId) {
        await supabaseAdmin
          .from('security_agents')
          .update({ duty_status: 'DISPATCHED', updated_at: nowIso })
          .eq('id', assignedAgentId);
      }
    } else if (targetStatus === 'ARRIVED') {
      await supabaseAdmin
        .from('interventions')
        .update({
          status: 'ON_SITE',
          arrived_at: nowIso,
          updated_at: nowIso,
        })
        .eq('alert_id', alert.id)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE']);

      if (assignedAgentId) {
        await supabaseAdmin
          .from('security_agents')
          .update({ duty_status: 'BUSY', updated_at: nowIso })
          .eq('id', assignedAgentId);
      }
    }

    // 6. Événements et audit
    let eventType = 'STATUS_CHANGED';
    if (targetStatus === 'CANCELLED') eventType = 'ALERT_CANCELLED';
    else if (targetStatus === 'FALSE_ALARM') eventType = 'ALERT_FALSE_ALARM';
    else if (targetStatus === 'RESOLVED') eventType = 'INTERVENTION_COMPLETED';
    else if (targetStatus === 'ACKNOWLEDGED') eventType = 'ALERT_ACKNOWLEDGED';
    else if (targetStatus === 'EN_ROUTE') eventType = 'PATROL_EN_ROUTE';
    else if (targetStatus === 'ARRIVED') eventType = 'PATROL_ARRIVED';
    else if (targetStatus === 'ESCALATED') eventType = 'ALERT_ESCALATED';

    const actorLabel = actorName || actorRole;
    const defaultComment = `Statut mis à jour : ${alert.status} -> ${targetStatus} par ${actorLabel}`;

    await supabaseAdmin.from('alert_events').insert({
      id: crypto.randomUUID(),
      alert_id: alert.id,
      actor_id: actorUserId,
      from_status: alert.status,
      to_status: targetStatus,
      event_type: eventType,
      comment: comment || defaultComment,
      metadata: {
        targetStatus,
        report: report || null,
        assigned_agent_id: assignedAgentId,
      },
      created_at: nowIso,
    });

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: actorUserId,
      action: `SOC_${targetStatus}_ALERT`,
      entity_type: 'ALERT',
      entity_id: alert.id,
      details: {
        alert_number: alert.alert_number,
        from_status: alert.status,
        to_status: targetStatus,
        comment,
      },
      created_at: nowIso,
    });

    return {
      success: true,
      alert: updatedAlert,
      message: `Alerte mise à jour avec succès vers ${targetStatus}`,
    };
  }
}

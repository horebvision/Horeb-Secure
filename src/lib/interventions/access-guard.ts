/**
 * SECURIA V2 — INTERVENTION ACCESS GUARD & RESOLVER
 * Contrôle strict d'accès (RBAC + Anti-IDOR + Cloisonnement Multi-Organisations)
 * pour toutes les opérations sur les dossiers de preuve et rapports d'intervention.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProofOfIntervention } from './proof-builder';
import { ProofOfIntervention } from './types';

export interface InterventionAccessResult {
  allowed: boolean;
  status: number;
  error?: string;
  intervention?: any;
  alert?: any;
  agent?: any;
  client?: any;
  site?: any;
  events?: any[];
  proof?: ProofOfIntervention;
}

export function checkInterventionAccess(
  user: { id: string; role: string; organization_id?: string | null; isPlatformAdmin?: boolean } | null,
  resource: { user_id?: string | null; organization_id?: string | null; site_owner_id?: string | null; assigned_agent_user_id?: string | null }
): { allowed: boolean; status: number; error?: string } {
  if (!user) {
    return { allowed: false, status: 401, error: 'Non authentifié' };
  }

  // Seul le Super Admin plateforme a une supervision transverse
  if (user.isPlatformAdmin) {
    return { allowed: true, status: 200 };
  }

  if (user.role === 'USER') {
    const isOwner = resource.user_id === user.id || resource.site_owner_id === user.id;
    return isOwner
      ? { allowed: true, status: 200 }
      : { allowed: false, status: 403, error: 'Accès refusé : intervention appartenant à un autre client' };
  }

  // Admin d'entreprise et superviseur : strictement limités à leur organisation (fail-closed)
  if (user.role === 'ADMIN' || user.role === 'SECURITY_MANAGER') {
    if (!user.organization_id || !resource.organization_id || user.organization_id !== resource.organization_id) {
      return { allowed: false, status: 403, error: 'Accès refusé : intervention d’une autre organisation' };
    }
    return { allowed: true, status: 200 };
  }

  if (user.role === 'AGENT') {
    if (!resource.assigned_agent_user_id || resource.assigned_agent_user_id !== user.id) {
      return { allowed: false, status: 403, error: 'Accès refusé : patrouilleur non affecté à cette mission' };
    }
    return { allowed: true, status: 200 };
  }

  return { allowed: false, status: 403, error: 'Rôle non reconnu' };
}

export async function resolveInterventionWithAccess(
  interventionId: string,
  user: {
    id: string;
    role: string;
    organizationId?: string | null;
    isPlatformAdmin?: boolean;
  }
): Promise<InterventionAccessResult> {
  // 1. Récupération de l'intervention et de l'alerte associée
  let { data: intervention, error: intError } = await supabaseAdmin
    .from('interventions')
    .select(`
      *,
      alerts:alert_id (
        *,
        users:user_id (id, full_name, email, phone, organization_id),
        protected_sites:site_id (id, name, address, city, latitude, longitude, access_instructions, organization_id, owner_id),
        security_agents:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(id, full_name, phone))
      )
    `)
    .eq('id', interventionId)
    .maybeSingle();

  // Si non trouvé par ID d'intervention, tenter par ID d'alerte
  if (!intervention) {
    const { data: altInt } = await supabaseAdmin
      .from('interventions')
      .select(`
        *,
        alerts:alert_id (
          *,
          users:user_id (id, full_name, email, phone, organization_id),
          protected_sites:site_id (id, name, address, city, latitude, longitude, access_instructions, organization_id, owner_id),
          security_agents:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(id, full_name, phone))
        )
      `)
      .eq('alert_id', interventionId)
      .maybeSingle();

    if (altInt) {
      intervention = altInt;
    }
  }

  // Si toujours pas d'intervention explicite, chercher directement l'alerte
  let alert = intervention?.alerts;
  if (!alert) {
    const { data: rawAlert } = await supabaseAdmin
      .from('alerts')
      .select(`
        *,
        users:user_id (id, full_name, email, phone, organization_id),
        protected_sites:site_id (id, name, address, city, latitude, longitude, access_instructions, organization_id, owner_id),
        security_agents:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(id, full_name, phone))
      `)
      .eq('id', interventionId)
      .maybeSingle();

    if (rawAlert) {
      alert = rawAlert;
    }
  }

  if (!alert && !intervention) {
    return {
      allowed: false,
      status: 404,
      error: 'Dossier d’intervention introuvable.',
    };
  }

  // 2. CONTRÔLE STRICT D'HABILITATION (ANTI-IDOR)
  const alertUserId = alert?.user_id;
  const siteOwnerId = alert?.protected_sites?.owner_id;
  const alertOrgId = alert?.organization_id || alert?.users?.organization_id;
  const assignedAgentUserId = alert?.security_agents?.user_id;
  const assignedAgentId = alert?.assigned_agent_id || intervention?.agent_id;

  if (user.role === 'USER') {
    // Le client ne peut accéder qu'à son propre incident ou son propre site
    const isOwner = alertUserId === user.id || siteOwnerId === user.id;
    if (!isOwner) {
      return {
        allowed: false,
        status: 403,
        error: 'Accès refusé : Vous ne pouvez consulter que vos propres interventions.',
      };
    }
  } else if (user.role === 'AGENT') {
    // Un patrouilleur ne peut accéder qu'à l'intervention qui lui est affectée
    let isAgentAssigned = assignedAgentUserId === user.id;
    if (!isAgentAssigned) {
      const { data: agentRec } = await supabaseAdmin
        .from('security_agents')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (agentRec && (agentRec.id === assignedAgentId || agentRec.id === intervention?.agent_id)) {
        isAgentAssigned = true;
      }
    }

    if (!isAgentAssigned) {
      return {
        allowed: false,
        status: 403,
        error: 'Accès refusé : Vous n’êtes pas le patrouilleur affecté à cette mission.',
      };
    }
  } else if (user.isPlatformAdmin) {
    // Seul le Super Admin plateforme a une supervision transverse
  } else if (user.role === 'SECURITY_MANAGER' || user.role === 'ADMIN') {
    // Superviseur SOC et admin d'entreprise : uniquement les dossiers de leur organisation (fail-closed)
    if (!user.organizationId || !alertOrgId || user.organizationId !== alertOrgId) {
      return {
        allowed: false,
        status: 403,
        error: 'Accès refusé : Cette intervention appartient à une autre organisation.',
      };
    }
  } else {
    return { allowed: false, status: 403, error: 'Rôle non habilité à consulter cette intervention.' };
  }

  // 3. Récupération des événements de l'alerte
  const targetAlertId = alert?.id || intervention?.alert_id;
  const { data: events } = await supabaseAdmin
    .from('alert_events')
    .select('*')
    .eq('alert_id', targetAlertId)
    .order('created_at', { ascending: true });

  // 4. Construction de l'objet ProofOfIntervention
  const proof = buildProofOfIntervention({
    alert,
    intervention,
    agent: alert?.security_agents,
    client: alert?.users,
    site: alert?.protected_sites,
    events: events || [],
  });

  return {
    allowed: true,
    status: 200,
    intervention,
    alert,
    agent: alert?.security_agents,
    client: alert?.users,
    site: alert?.protected_sites,
    events: events || [],
    proof,
  };
}

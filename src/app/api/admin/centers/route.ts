import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  isValidUuid,
  sanitizeString,
  safeErrorResponse,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/centers
 * Récupère la liste réelle des centres de sécurité de la plateforme SECURIA.
 * Habilitation : Rôle ADMIN uniquement.
 * Isolation multi-tenant :
 * - Tenant Admin : Uniquement les centres de sa propre organisation.
 * - Platform Admin : Vision consolidée globale avec filtrage par organisation optionnel.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get('search')?.trim().toLowerCase() || '';
    const isActiveFilter = searchParams.get('is_active');
    const orgFilter = searchParams.get('organization_id');

    const db = await getScopedDatabaseClient(req);

    // 1. Requête principale des centres de sécurité
    let query = db
      .from('security_centers')
      .select(`
        id,
        organization_id,
        name,
        code,
        phone,
        email,
        address,
        city,
        postal_code,
        latitude,
        longitude,
        is_active,
        created_at,
        updated_at,
        organization:organizations!organization_id (
          id,
          name,
          code
        )
      `)
      .order('created_at', { ascending: false });

    // Cloisonnement multi-tenant
    const targetOrg = (orgFilter && orgFilter !== 'ALL' && isValidUuid(orgFilter)) ? orgFilter : user.organizationId;
    if (targetOrg && targetOrg !== 'ALL') {
      query = query.eq('organization_id', targetOrg);
    } else if (!user.isPlatformAdmin) {
      return NextResponse.json({
        success: true,
        count: 0,
        centers: [],
        organizations: [],
      });
    }

    if (isActiveFilter === 'true') {
      query = query.eq('is_active', true);
    } else if (isActiveFilter === 'false') {
      query = query.eq('is_active', false);
    }

    const { data: rawCenters, error } = await query;

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération des centres de sécurité');
    }

    let centers = rawCenters || [];

    // Filtrage textuel applicatif (nom, code, ville, adresse, email, téléphone)
    if (searchQuery) {
      centers = centers.filter((c: any) => {
        const name = (c.name || '').toLowerCase();
        const code = (c.code || '').toLowerCase();
        const city = (c.city || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const orgName = (c.organization?.name || '').toLowerCase();

        return (
          name.includes(searchQuery) ||
          code.includes(searchQuery) ||
          city.includes(searchQuery) ||
          address.includes(searchQuery) ||
          email.includes(searchQuery) ||
          phone.includes(searchQuery) ||
          orgName.includes(searchQuery)
        );
      });
    }

    // 2. Récupérer les agents associés à chaque centre
    const centerIds = centers.map((c: any) => c.id).filter(Boolean);
    let agentsByCenterMap: Record<string, any[]> = {};
    let activeInterventionsCountMap: Record<string, number> = {};

    if (centerIds.length > 0) {
      // Agents rattachés
      const { data: centerAgents } = await db
        .from('security_agents')
        .select(`
          id,
          security_center_id,
          badge_number,
          duty_status,
          patrol_vehicle,
          is_active,
          user:users!user_id (
            id,
            full_name,
            phone,
            email
          )
        `)
        .in('security_center_id', centerIds);

      if (centerAgents) {
        for (const ag of centerAgents) {
          if (ag.security_center_id) {
            if (!agentsByCenterMap[ag.security_center_id]) {
              agentsByCenterMap[ag.security_center_id] = [];
            }
            agentsByCenterMap[ag.security_center_id].push(ag);
          }
        }
      }

      // Interventions actives en cours sur ces centres
      const { data: activeInterventions } = await db
        .from('interventions')
        .select('id, security_center_id')
        .in('security_center_id', centerIds)
        .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

      if (activeInterventions) {
        for (const itv of activeInterventions) {
          if (itv.security_center_id) {
            activeInterventionsCountMap[itv.security_center_id] =
              (activeInterventionsCountMap[itv.security_center_id] || 0) + 1;
          }
        }
      }
    }

    // Enrichissement des centres avec leurs agents et interventions actives
    const enrichedCenters = centers.map((c: any) => ({
      ...c,
      organization: c.organization ? {
        ...c.organization,
        commercial_name: c.organization.name,
      } : null,
      agents: agentsByCenterMap[c.id] || [],
      agents_count: (agentsByCenterMap[c.id] || []).length,
      active_interventions_count: activeInterventionsCountMap[c.id] || 0,
    }));

    // 3. Organisations disponibles pour les filtres et sélecteurs
    let orgsQuery = db.from('organizations').select('id, name, code').eq('is_active', true);
    if (!user.isPlatformAdmin && user.organizationId) {
      orgsQuery = orgsQuery.eq('id', user.organizationId);
    }
    const { data: rawOrganizations } = await orgsQuery;
    const organizations = (rawOrganizations || []).map((o: any) => ({
      ...o,
      commercial_name: o.name,
    }));

    return NextResponse.json({
      success: true,
      count: enrichedCenters.length,
      centers: enrichedCenters,
      organizations: organizations || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors du chargement des centres de sécurité');
  }
}

/**
 * POST /api/admin/centers
 * Crée un nouveau centre de sécurité opérationnel.
 * Habilitation : Rôle ADMIN uniquement.
 * Multi-tenant :
 * - Tenant Admin : Organisation fixée obligatoirement à la sienne.
 * - Platform Admin : Peut spécifier l'organisation cible.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const body = await req.json();
    const rawName = sanitizeString(body.name || '');
    const rawCode = sanitizeString(body.code || '').toUpperCase().trim();
    const rawPhone = sanitizeString(body.phone || '');
    const rawEmail = sanitizeString(body.email || '').toLowerCase().trim();
    const rawAddress = sanitizeString(body.address || '');
    const rawCity = sanitizeString(body.city || '');
    const rawPostalCode = sanitizeString(body.postal_code || '');
    const latitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== '' ? Number(body.latitude) : null;
    const longitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== '' ? Number(body.longitude) : null;
    const isActive = body.is_active !== false;

    // Validation des champs obligatoires
    if (!rawName || rawName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Le nom du centre de sécurité est obligatoire (au moins 2 caractères).' },
        { status: 400 }
      );
    }

    if (!rawCode || rawCode.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Le code unique du centre de sécurité est obligatoire (ex: CTR-ABJ-01).' },
        { status: 400 }
      );
    }

    // Détermination de l'organisation cible
    let targetOrgId: string;
    if (user.isPlatformAdmin) {
      const requestedOrgId = sanitizeString(body.organization_id || '');
      if (!requestedOrgId || !isValidUuid(requestedOrgId)) {
        return NextResponse.json(
          { success: false, error: 'Une organisation valide doit être sélectionnée pour ce centre.' },
          { status: 400 }
        );
      }
      targetOrgId = requestedOrgId;
    } else {
      if (!user.organizationId) {
        return NextResponse.json(
          { success: false, error: 'Votre compte administrateur n\'est rattaché à aucune organisation.' },
          { status: 400 }
        );
      }
      targetOrgId = user.organizationId;
    }

    // Vérification de l'unicité du code
    const { data: existingCode } = await supabaseAdmin
      .from('security_centers')
      .select('id')
      .eq('code', rawCode)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json(
        { success: false, error: `Le code de centre "${rawCode}" est déjà utilisé par un autre centre de sécurité.` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newCenterId = crypto.randomUUID();

    const insertPayload: Record<string, any> = {
      id: newCenterId,
      organization_id: targetOrgId,
      name: rawName,
      code: rawCode,
      phone: rawPhone || null,
      email: rawEmail || null,
      address: rawAddress || null,
      city: rawCity || null,
      postal_code: rawPostalCode || null,
      latitude: latitude !== null && !isNaN(latitude) ? latitude : null,
      longitude: longitude !== null && !isNaN(longitude) ? longitude : null,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    };

    const { data: createdCenter, error: insertErr } = await supabaseAdmin
      .from('security_centers')
      .insert(insertPayload)
      .select(`
        id,
        organization_id,
        name,
        code,
        phone,
        email,
        address,
        city,
        postal_code,
        latitude,
        longitude,
        is_active,
        created_at,
        updated_at,
        organization:organizations!organization_id (
          id,
          name,
          code
        )
      `)
      .single();

    if (insertErr) {
      return safeErrorResponse(insertErr, 'Erreur lors de la création du centre de sécurité');
    }

    // Journalisation d'audit
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_CREATE_SECURITY_CENTER',
        entity_type: 'SECURITY_CENTER',
        entity_id: newCenterId,
        details: {
          name: rawName,
          code: rawCode,
          organization_id: targetOrgId,
          is_active: isActive,
          created_by: user.id,
        },
        created_at: now,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Centre de sécurité "${rawName}" (${rawCode}) créé avec succès.`,
      center: createdCenter,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la création du centre de sécurité');
  }
}

/**
 * PATCH /api/admin/centers
 * Met à jour un centre de sécurité existant.
 * Habilitation : Rôle ADMIN uniquement.
 * Sécurité :
 * - Tenant Admin : ne peut modifier que ses propres centres.
 * - Platform Admin : peut modifier tous les centres et réaffecter l'organisation si aucun agent n'est en conflit.
 * - Garde-fou de désactivation : impossible de désactiver si une intervention est en cours.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const body = await req.json();
    const centerId = sanitizeString(body.id || '');

    if (!centerId || !isValidUuid(centerId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant du centre de sécurité manquant ou invalide.' },
        { status: 400 }
      );
    }

    // Récupérer le centre actuel
    const { data: existingCenter, error: fetchErr } = await supabaseAdmin
      .from('security_centers')
      .select('id, organization_id, name, code, is_active')
      .eq('id', centerId)
      .maybeSingle();

    if (fetchErr || !existingCenter) {
      return NextResponse.json(
        { success: false, error: 'Centre de sécurité introuvable.' },
        { status: 404 }
      );
    }

    // Cloisonnement multi-tenant
    if (!user.isPlatformAdmin && existingCenter.organization_id !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès non autorisé : ce centre appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      updated_at: now,
    };

    // Modification du nom
    if (body.name !== undefined) {
      const cleanName = sanitizeString(body.name).trim();
      if (!cleanName || cleanName.length < 2) {
        return NextResponse.json(
          { success: false, error: 'Le nom du centre doit comporter au moins 2 caractères.' },
          { status: 400 }
        );
      }
      updateData.name = cleanName;
    }

    // Modification du code unique
    if (body.code !== undefined) {
      const cleanCode = sanitizeString(body.code).toUpperCase().trim();
      if (!cleanCode || cleanCode.length < 2) {
        return NextResponse.json(
          { success: false, error: 'Le code unique du centre est obligatoire.' },
          { status: 400 }
        );
      }
      if (cleanCode !== existingCenter.code) {
        const { data: duplicateCode } = await supabaseAdmin
          .from('security_centers')
          .select('id')
          .eq('code', cleanCode)
          .neq('id', centerId)
          .maybeSingle();

        if (duplicateCode) {
          return NextResponse.json(
            { success: false, error: `Le code "${cleanCode}" est déjà attribué à un autre centre de sécurité.` },
            { status: 400 }
          );
        }
        updateData.code = cleanCode;
      }
    }

    // Contact et localisation
    if (body.phone !== undefined) updateData.phone = sanitizeString(body.phone).trim() || null;
    if (body.email !== undefined) updateData.email = sanitizeString(body.email).toLowerCase().trim() || null;
    if (body.address !== undefined) updateData.address = sanitizeString(body.address).trim() || null;
    if (body.city !== undefined) updateData.city = sanitizeString(body.city).trim() || null;
    if (body.postal_code !== undefined) updateData.postal_code = sanitizeString(body.postal_code).trim() || null;

    if (body.latitude !== undefined) {
      const lat = body.latitude !== null && body.latitude !== '' ? Number(body.latitude) : null;
      updateData.latitude = lat !== null && !isNaN(lat) ? lat : null;
    }
    if (body.longitude !== undefined) {
      const lng = body.longitude !== null && body.longitude !== '' ? Number(body.longitude) : null;
      updateData.longitude = lng !== null && !isNaN(lng) ? lng : null;
    }

    // Gestion du statut opérationnel actif / inactif
    if (body.is_active !== undefined) {
      const targetIsActive = Boolean(body.is_active);

      // GARDE-FOU MÉTIER : interdire la désactivation si des interventions sont en cours
      if (targetIsActive === false && existingCenter.is_active === true) {
        const { data: activeMissions } = await supabaseAdmin
          .from('interventions')
          .select('id, status')
          .eq('security_center_id', centerId)
          .in('status', ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE']);

        if (activeMissions && activeMissions.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Impossible de désactiver ce centre de sécurité : ${activeMissions.length} intervention(s) sont actuellement en cours d'exécution. Veuillez clôturer ou réaffecter ces interventions avant toute désactivation.`,
            },
            { status: 400 }
          );
        }
      }

      updateData.is_active = targetIsActive;
    }

    // Modification de l'organisation (réservé exclusivement au Super Admin)
    if (body.organization_id !== undefined && user.isPlatformAdmin) {
      const newOrgId = sanitizeString(body.organization_id).trim();
      if (newOrgId && isValidUuid(newOrgId) && newOrgId !== existingCenter.organization_id) {
        // Vérifier si des agents sont rattachés à ce centre dans l'ancienne organisation
        const { data: attachedAgents } = await supabaseAdmin
          .from('security_agents')
          .select('id')
          .eq('security_center_id', centerId);

        if (attachedAgents && attachedAgents.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Impossible de changer l'organisation de ce centre : ${attachedAgents.length} agent(s) y sont rattachés. Pour maintenir la cohérence multi-tenant, réaffectez ces agents d'abord.`,
            },
            { status: 400 }
          );
        }
        updateData.organization_id = newOrgId;
      }
    }

    // Application de la mise à jour
    const { data: updatedCenter, error: updateErr } = await supabaseAdmin
      .from('security_centers')
      .update(updateData)
      .eq('id', centerId)
      .select(`
        id,
        organization_id,
        name,
        code,
        phone,
        email,
        address,
        city,
        postal_code,
        latitude,
        longitude,
        is_active,
        created_at,
        updated_at,
        organization:organizations!organization_id (
          id,
          name,
          code
        )
      `)
      .single();

    if (updateErr) {
      return safeErrorResponse(updateErr, 'Erreur lors de la mise à jour du centre de sécurité');
    }

    // Audit logs
    try {
      let auditAction = 'ADMIN_UPDATE_SECURITY_CENTER';
      if (body.is_active !== undefined) {
        auditAction = body.is_active ? 'ADMIN_ACTIVATE_SECURITY_CENTER' : 'ADMIN_DEACTIVATE_SECURITY_CENTER';
      }

      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: auditAction,
        entity_type: 'SECURITY_CENTER',
        entity_id: centerId,
        details: {
          changes: updateData,
          previous: {
            name: existingCenter.name,
            code: existingCenter.code,
            is_active: existingCenter.is_active,
          },
          updated_by: user.id,
        },
        created_at: now,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Centre de sécurité "${updatedCenter.name}" mis à jour avec succès.`,
      center: updatedCenter,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour du centre de sécurité');
  }
}

/**
 * DELETE /api/admin/centers
 * Suppression sécurisée d'un centre de sécurité.
 * Habilitation : Rôle ADMIN uniquement.
 * Garde-fous intégrité :
 * - Refus absolu si des agents, interventions, alertes ou sites protégés y sont rattachés.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Réservé aux administrateurs.' }, { status: 403 })
      );
    }

    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get('id');

    if (!centerId || !isValidUuid(centerId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant du centre de sécurité manquant ou invalide.' },
        { status: 400 }
      );
    }

    // Vérifier l'existence et l'organisation du centre
    const { data: existingCenter } = await supabaseAdmin
      .from('security_centers')
      .select('id, organization_id, name, code')
      .eq('id', centerId)
      .maybeSingle();

    if (!existingCenter) {
      return NextResponse.json(
        { success: false, error: 'Centre de sécurité introuvable.' },
        { status: 404 }
      );
    }

    if (!user.isPlatformAdmin && existingCenter.organization_id !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: 'Accès non autorisé : ce centre appartient à une autre organisation.' },
        { status: 403 }
      );
    }

    // Vérifier les dépendances : agents
    const { count: agentsCount } = await supabaseAdmin
      .from('security_agents')
      .select('id', { count: 'exact', head: true })
      .eq('security_center_id', centerId);

    // Vérifier les dépendances : interventions
    const { count: interventionsCount } = await supabaseAdmin
      .from('interventions')
      .select('id', { count: 'exact', head: true })
      .eq('security_center_id', centerId);

    // Vérifier les dépendances : alertes
    const { count: alertsCount } = await supabaseAdmin
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('security_center_id', centerId);

    // Vérifier les dépendances : sites protégés
    const { count: sitesCount } = await supabaseAdmin
      .from('protected_sites')
      .select('id', { count: 'exact', head: true })
      .eq('security_center_id', centerId);

    const totalDependencies = (agentsCount || 0) + (interventionsCount || 0) + (alertsCount || 0) + (sitesCount || 0);

    if (totalDependencies > 0) {
      const details = [];
      if (agentsCount) details.push(`${agentsCount} agent(s)`);
      if (interventionsCount) details.push(`${interventionsCount} intervention(s)`);
      if (alertsCount) details.push(`${alertsCount} alerte(s)`);
      if (sitesCount) details.push(`${sitesCount} site(s) protégé(s)`);

      return NextResponse.json(
        {
          success: false,
          error: `Impossible de supprimer le centre "${existingCenter.name}" (${existingCenter.code}) car des données y sont rattachées : ${details.join(', ')}. Vous pouvez le désactiver pour stopper son utilisation tout en conservant l'historique légal et d'audit.`,
        },
        { status: 400 }
      );
    }

    // Suppression définitive propre
    const { error: deleteErr } = await supabaseAdmin
      .from('security_centers')
      .delete()
      .eq('id', centerId);

    if (deleteErr) {
      return safeErrorResponse(deleteErr, 'Erreur lors de la suppression du centre de sécurité');
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_DELETE_SECURITY_CENTER',
        entity_type: 'SECURITY_CENTER',
        entity_id: centerId,
        details: {
          name: existingCenter.name,
          code: existingCenter.code,
          organization_id: existingCenter.organization_id,
          deleted_by: user.id,
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Le centre de sécurité "${existingCenter.name}" (${existingCenter.code}) a été supprimé avec succès.`,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la suppression du centre de sécurité');
  }
}

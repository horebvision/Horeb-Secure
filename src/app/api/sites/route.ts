import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  sanitizeString,
  validateGeoCoordinates,
  safeErrorResponse,
  isValidUuid,
} from '@/lib/security/api-guard';

const DEFAULT_ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
const DEFAULT_CENTER_ID = '202a6970-8afb-44cf-9455-aa16e2c7cbd1';
const ALLOWED_SITE_TYPES = ['RESIDENCE', 'COMMERCE', 'ENTREPRISE', 'AUTRE'] as const;

/**
 * GET /api/sites
 * Récupération sécurisée des sites protégés avec filtrage multi-tenant et recherche.
 * Cloisonnement strict :
 * - USER : uniquement ses propres sites (owner_id = user.id)
 * - SECURITY_MANAGER / AGENT / SECRETARY : sites de son organisation
 * - ADMIN : sites de son organisation (ou filtré par organization_id si Platform Admin)
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN', 'SECRETARY'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const filterOrgId = searchParams.get('organization_id');
    const search = searchParams.get('search')?.trim();
    const siteType = searchParams.get('site_type')?.trim();

    let query = supabaseAdmin
      .from('protected_sites')
      .select(`
        *,
        owner:users!owner_id (
          id,
          full_name,
          phone,
          email
        ),
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .order('created_at', { ascending: false });

    // 1. Isolation stricte par rôle et organisation
    if (user.role === 'USER') {
      if (user.clientId) {
        query = query.or(`client_id.eq.${user.clientId},owner_id.eq.${user.id}`);
      } else {
        query = query.eq('owner_id', user.id);
      }
    } else if (user.role === 'SECURITY_MANAGER' || user.role === 'AGENT' || user.role === 'SECRETARY') {
      const orgId = user.organizationId;
      if (!orgId) {
        return NextResponse.json({ success: true, count: 0, sites: [] });
      }
      query = query.eq('organization_id', orgId);
    } else if (user.role === 'ADMIN') {
      const targetOrg = (user.isPlatformAdmin && filterOrgId && isValidUuid(filterOrgId)) ? filterOrgId : user.organizationId;
      if (targetOrg && targetOrg !== 'ALL') {
        query = query.eq('organization_id', targetOrg);
      } else if (!user.isPlatformAdmin) {
        return NextResponse.json({ success: true, count: 0, sites: [] });
      }
    }

    // 2. Filtres optionnels (type de site et recherche texte)
    if (siteType && ALLOWED_SITE_TYPES.includes(siteType as any)) {
      query = query.eq('site_type', siteType);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const { data: sites, error } = await query;

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération des sites protégés');
    }

    // 3. Normalisation des coordonnées en nombres
    const normalizedSites = (sites || []).map((s: any) => ({
      ...s,
      latitude: s.latitude != null ? Number(s.latitude) : null,
      longitude: s.longitude != null ? Number(s.longitude) : null,
      organizations: s.organizations ? {
        ...s.organizations,
        commercial_name: s.organizations.name,
      } : null,
    }));

    // 4. Récupération des organisations accessibles pour les sélecteurs
    let orgsQuery = supabaseAdmin.from('organizations').select('id, name, code');
    if (!user.isPlatformAdmin && user.organizationId) {
      orgsQuery = orgsQuery.eq('id', user.organizationId);
    }
    const { data: rawOrgs } = await orgsQuery.order('name', { ascending: true });
    const orgs = (rawOrgs || []).map((o: any) => ({
      ...o,
      commercial_name: o.name,
    }));

    return NextResponse.json({
      success: true,
      count: normalizedSites.length,
      sites: normalizedSites,
      organizations: orgs || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la récupération des sites');
  }
}

/**
 * POST /api/sites
 * Création sécurisée d'un site protégé avec coordonnées GPS vérifiées et rattachement d'organisation.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      site_type = 'RESIDENCE',
      address,
      city = 'Abidjan',
      postal_code = 'BP 01',
      latitude,
      longitude,
      access_instructions = '',
      is_default = false,
      owner_id,
      organization_id,
    } = body;

    // 1. Validation des champs textuels obligatoires
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Le nom du site est obligatoire' },
        { status: 400 }
      );
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return NextResponse.json(
        { success: false, error: "L'adresse complète est obligatoire" },
        { status: 400 }
      );
    }

    // 2. Validation et traitement des coordonnées GPS
    let finalLat = 5.3484; // Coordonnées par défaut secteur Abidjan
    let finalLon = -4.0305;

    if (latitude != null && longitude != null && String(latitude).trim() !== '' && String(longitude).trim() !== '') {
      const numLat = Number(latitude);
      const numLon = Number(longitude);

      if (!isNaN(numLat) && !isNaN(numLon)) {
        const geoValidation = validateGeoCoordinates(numLat, numLon);
        if (geoValidation.valid && geoValidation.lat != null && geoValidation.lon != null) {
          finalLat = geoValidation.lat;
          finalLon = geoValidation.lon;
        } else {
          return NextResponse.json(
            { success: false, error: geoValidation.error || 'Coordonnées GPS hors limites valides' },
            { status: 400 }
          );
        }
      }
    }

    // 3. Validation du type de site
    const sanitizedSiteType = ALLOWED_SITE_TYPES.includes(site_type as any) ? site_type : 'RESIDENCE';
    const sanitizedName = sanitizeString(name, 100);
    const sanitizedAddress = sanitizeString(address, 200);
    const sanitizedCity = sanitizeString(city, 100);
    const sanitizedPostal = sanitizeString(postal_code, 20);
    const sanitizedInstructions = sanitizeString(access_instructions, 500);

    // 4. Détermination sécurisée de l'organisation et du propriétaire
    let orgId = user.organizationId || DEFAULT_ORG_ID;
    if (user.isPlatformAdmin && organization_id && isValidUuid(organization_id)) {
      orgId = organization_id;
    } else if (user.role === 'ADMIN' && user.organizationId) {
      orgId = user.organizationId;
    }

    let targetOwnerId = user.id;
    if (['SECURITY_MANAGER', 'ADMIN'].includes(user.role) && owner_id && isValidUuid(owner_id)) {
      targetOwnerId = owner_id;
    }

    // Contrôle strict des quotas SaaS de l'organisation
    if (orgId) {
      try {
        const { QuotaService } = await import('@/lib/billing/quota-service');
        await QuotaService.assertCanConsume(orgId, 'maxSites');
      } catch (quotaErr: any) {
        if (quotaErr.code === 'QUOTA_EXCEEDED') {
          return NextResponse.json(
            {
              success: false,
              code: 'QUOTA_EXCEEDED',
              error: quotaErr.message,
              limit: quotaErr.limit,
              current: quotaErr.current,
              plan: quotaErr.plan,
            },
            { status: 403 }
          );
        }
        console.warn('[Sites Create] Note vérification quota:', quotaErr?.message);
      }
    }

    const targetCenterId = user.securityCenterId || DEFAULT_CENTER_ID;
    const newSiteId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 5. Enregistrement direct en base de données
    const { data: insertedSite, error: insertError } = await supabaseAdmin
      .from('protected_sites')
      .insert({
        id: newSiteId,
        owner_id: targetOwnerId,
        organization_id: orgId,
        security_center_id: targetCenterId,
        name: sanitizedName,
        site_type: sanitizedSiteType,
        address: sanitizedAddress,
        city: sanitizedCity,
        postal_code: sanitizedPostal,
        latitude: finalLat,
        longitude: finalLon,
        access_instructions: sanitizedInstructions,
        is_default: !!is_default,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select(`
        *,
        owner:users!owner_id (
          id,
          full_name,
          phone,
          email
        ),
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .single();

    if (insertError) {
      return safeErrorResponse(insertError, 'Erreur lors de la création du site protégé en base');
    }

    // 6. Audit log de création
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_CREATE_PROTECTED_SITE',
        entity_type: 'SITE',
        entity_id: newSiteId,
        details: {
          name: sanitizedName,
          organization_id: orgId,
          site_type: sanitizedSiteType,
          latitude: finalLat,
          longitude: finalLon,
          created_by: user.id,
        },
        created_at: nowIso,
      });
    } catch {}

    const normalizedSite = {
      ...insertedSite,
      latitude: Number(insertedSite.latitude),
      longitude: Number(insertedSite.longitude),
    };

    return NextResponse.json(
      {
        success: true,
        message: 'Site protégé enregistré avec succès',
        site: normalizedSite,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la création du site');
  }
}

/**
 * PATCH /api/sites
 * Modification d'un site protégé existant avec vérification multi-tenant et validation GPS.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      id,
      name,
      site_type,
      address,
      city,
      postal_code,
      latitude,
      longitude,
      access_instructions,
      is_default,
      owner_id,
      organization_id,
    } = body;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'ID de site valide (UUID) obligatoire' }, { status: 400 });
    }

    const { data: existingSite } = await supabaseAdmin
      .from('protected_sites')
      .select('id, owner_id, organization_id')
      .eq('id', id)
      .maybeSingle();

    if (!existingSite) {
      return NextResponse.json({ success: false, error: 'Site protégé introuvable' }, { status: 404 });
    }

    // Contrôle d'accès multi-tenant
    const canEdit =
      user.isPlatformAdmin ||
      (user.role === 'ADMIN' && existingSite.organization_id === user.organizationId) ||
      (user.role === 'USER' && existingSite.owner_id === user.id) ||
      (user.role === 'SECURITY_MANAGER' && existingSite.organization_id === user.organizationId);

    if (!canEdit) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé. Non autorisé à modifier ce site protégé.' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: nowIso };

    if (name !== undefined) updates.name = sanitizeString(name, 100);
    if (site_type && ALLOWED_SITE_TYPES.includes(site_type)) updates.site_type = site_type;
    if (address !== undefined) updates.address = sanitizeString(address, 200);
    if (city !== undefined) updates.city = sanitizeString(city, 100);
    if (postal_code !== undefined) updates.postal_code = sanitizeString(postal_code, 20);
    if (access_instructions !== undefined) updates.access_instructions = sanitizeString(access_instructions, 500);
    if (is_default !== undefined) updates.is_default = !!is_default;

    if (owner_id && isValidUuid(owner_id) && ['SECURITY_MANAGER', 'ADMIN'].includes(user.role)) {
      updates.owner_id = owner_id;
    }

    if (organization_id && isValidUuid(organization_id) && user.isPlatformAdmin) {
      updates.organization_id = organization_id;
    }

    if (latitude != null && longitude != null && String(latitude).trim() !== '' && String(longitude).trim() !== '') {
      const numLat = Number(latitude);
      const numLon = Number(longitude);
      if (!isNaN(numLat) && !isNaN(numLon)) {
        const geoValidation = validateGeoCoordinates(numLat, numLon);
        if (geoValidation.valid && geoValidation.lat != null && geoValidation.lon != null) {
          updates.latitude = geoValidation.lat;
          updates.longitude = geoValidation.lon;
        }
      }
    }

    const { data: updatedSite, error: updateError } = await supabaseAdmin
      .from('protected_sites')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        owner:users!owner_id (
          id,
          full_name,
          phone,
          email
        ),
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .single();

    if (updateError) {
      return safeErrorResponse(updateError, 'Erreur lors de la mise à jour du site');
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_UPDATE_PROTECTED_SITE',
        entity_type: 'SITE',
        entity_id: id,
        details: {
          updates,
          updated_by: user.id,
        },
        created_at: nowIso,
      });
    } catch {}

    const normalizedSite = {
      ...updatedSite,
      latitude: Number(updatedSite.latitude),
      longitude: Number(updatedSite.longitude),
    };

    return NextResponse.json({
      success: true,
      message: 'Site protégé mis à jour avec succès',
      site: normalizedSite,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour du site');
  }
}

/**
 * DELETE /api/sites
 * Suppression d'un site protégé avec vérification stricte des droits multi-tenant.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('id');

    if (!siteId || !isValidUuid(siteId)) {
      return NextResponse.json({ success: false, error: 'ID de site valide (UUID) obligatoire' }, { status: 400 });
    }

    const { data: existingSite } = await supabaseAdmin
      .from('protected_sites')
      .select('id, name, owner_id, organization_id')
      .eq('id', siteId)
      .maybeSingle();

    if (!existingSite) {
      return NextResponse.json({ success: false, error: 'Site protégé introuvable' }, { status: 404 });
    }

    const canDelete =
      user.isPlatformAdmin ||
      (user.role === 'ADMIN' && existingSite.organization_id === user.organizationId) ||
      (user.role === 'USER' && existingSite.owner_id === user.id) ||
      (user.role === 'SECURITY_MANAGER' && existingSite.organization_id === user.organizationId);

    if (!canDelete) {
      return NextResponse.json(
        { success: false, error: 'Accès refusé. Non autorisé à supprimer ce site protégé.' },
        { status: 403 }
      );
    }

    // Dissocier les alertes associées plutôt que d'échouer sur contrainte de clé étrangère
    await supabaseAdmin
      .from('alerts')
      .update({ site_id: null })
      .eq('site_id', siteId);

    const { error: delError } = await supabaseAdmin.from('protected_sites').delete().eq('id', siteId);

    if (delError) {
      return safeErrorResponse(delError, 'Erreur lors de la suppression du site');
    }

    // Audit log
    try {
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'ADMIN_DELETE_PROTECTED_SITE',
        entity_type: 'SITE',
        entity_id: siteId,
        details: {
          site_name: existingSite.name,
          organization_id: existingSite.organization_id,
          deleted_by: user.id,
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Site protégé supprimé avec succès',
      deleted_id: siteId,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la suppression du site');
  }
}

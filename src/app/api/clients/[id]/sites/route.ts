import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { clientService } from '@/lib/clients/client-service';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/sites
 * Liste les sites protégés rattachés à un client spécifique.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant client invalide' }, { status: 400 });
    }

    // Vérifier l'appartenance du client à l'organisation
    const client = await clientService.getClientById(id, user.organizationId);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Client introuvable' }, { status: 404 });
    }

    const sites = await clientService.listClientSites(id, user.organizationId);

    return NextResponse.json({
      success: true,
      count: sites.length,
      clientId: id,
      sites,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des sites du client');
  }
}

/**
 * POST /api/clients/[id]/sites
 * Assigne un site existant ou en crée un nouveau directement rattaché à ce client.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return errorResponse || NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ success: false, error: 'Identifiant client invalide' }, { status: 400 });
    }

    const client = await clientService.getClientById(id, user.organizationId);
    if (!client) {
      return NextResponse.json({ success: false, error: 'Client introuvable' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    // Cas A : Rattachement d'un site existant (site_id fourni)
    if (body.site_id) {
      await clientService.assignSiteToClient(id, body.site_id, user.organizationId, user.id);
      return NextResponse.json({
        success: true,
        message: 'Site rattaché avec succès au client.',
      });
    }

    // Cas B : Création d'un nouveau site rattaché au client
    if (!body.name || !body.address) {
      return NextResponse.json(
        { success: false, error: 'Le nom et l’adresse du site sont obligatoires.' },
        { status: 400 }
      );
    }

    const siteId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sitePayload = {
      id: siteId,
      organization_id: user.organizationId,
      client_id: id,
      owner_id: user.id,
      name: body.name.trim(),
      site_type: (body.site_type || 'COMMERCIAL') as any,
      address: body.address.trim(),
      city: body.city || client.city || 'Abidjan',
      postal_code: body.postal_code || 'BP 01',
      latitude: body.latitude ? Number(body.latitude) : null,
      longitude: body.longitude ? Number(body.longitude) : null,
      access_instructions: body.access_instructions || null,
      is_default: body.is_default ?? false,
      created_at: now,
      updated_at: now,
    };

    if (isRealServiceRoleKey()) {
      const { data, error } = await supabaseAdmin.from('protected_sites').insert(sitePayload).select().single();
      if (error) {
        return safeErrorResponse(error, 'Erreur lors de la création du site');
      }
      return NextResponse.json({
        success: true,
        message: 'Nouveau site créé et rattaché au client.',
        site: data,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Nouveau site créé et rattaché au client.',
      site: sitePayload,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors du rattachement du site');
  }
}

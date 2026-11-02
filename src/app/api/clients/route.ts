import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { clientService } from '@/lib/clients/client-service';
import type { ClientStatus, CreateClientInput } from '@/lib/clients/types';

/**
 * GET /api/clients
 * Liste les clients (entreprises, particuliers, banques, etc.) appartenant à l'organisation de l'utilisateur.
 * Accessible aux rôles ADMIN et SECURITY_MANAGER.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Organisation non définie ou accès refusé' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as ClientStatus) || undefined;
    const search = searchParams.get('search') || undefined;

    const clients = await clientService.listClients(user.organizationId, {
      status,
      search,
    });

    return NextResponse.json({
      success: true,
      count: clients.length,
      organizationId: user.organizationId,
      clients,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des clients');
  }
}

/**
 * POST /api/clients
 * Crée un nouveau client sous contrat pour la société de sécurité (Section 9 & 10).
 * Accessible aux rôles ADMIN et SECURITY_MANAGER.
 * RÈGLE ABSOLUE : organization_id provient STRICTEMENT de la session authentifiée.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      client_type,
      primary_contact_name,
      email,
      phone,
      whatsapp,
      address,
      city,
      country,
      notes,
      initial_site,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Le nom ou la raison sociale du client est obligatoire.' },
        { status: 400 }
      );
    }

    const input: CreateClientInput = {
      name: name.trim(),
      client_type,
      primary_contact_name,
      email,
      phone,
      whatsapp,
      address,
      city,
      country,
      notes,
      initial_site,
    };

    // Création via le service avec vérification de quota
    const result = await clientService.createClient(user.organizationId, input, user.id);

    return NextResponse.json({
      success: true,
      message: 'Client créé avec succès.',
      client: result.client,
      site: result.site,
    });
  } catch (err: any) {
    if (err.code === 'QUOTA_EXCEEDED') {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          code: 'QUOTA_EXCEEDED',
        },
        { status: 402 }
      );
    }
    return safeErrorResponse(err, err.message || 'Erreur lors de la création du client');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';
import type { CreateVisitInput, VisitStatus } from '@/lib/secretariat/types';

/**
 * GET /api/secretariat/visits
 * Liste paginée des visites de l'organisation courante.
 * Accessible aux rôles SECRETARY, SECURITY_MANAGER et ADMIN.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Organisation non définie ou accès refusé' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as VisitStatus) || undefined;
    const search = searchParams.get('search') || undefined;
    const siteId = searchParams.get('siteId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await secretariatService.listVisits(user.organizationId, {
      status,
      search,
      siteId,
      startDate,
      endDate,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      visits: result.visits,
      total: result.total,
      page: result.page,
      limit: result.limit,
      organizationId: user.organizationId,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des visites');
  }
}

/**
 * POST /api/secretariat/visits
 * Enregistrement d'une nouvelle visite à l'accueil interne.
 * Horodatage serveur exact d'arrivée et isolation multi-tenant garantie.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const input: CreateVisitInput = body;

    if (!input.people || !Array.isArray(input.people) || input.people.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Au moins un visiteur doit être renseigné.' },
        { status: 400 }
      );
    }

    // Validation des données des visiteurs
    for (let i = 0; i < input.people.length; i++) {
      const p = input.people[i];
      if (!p.full_name || !p.full_name.trim()) {
        return NextResponse.json(
          { success: false, error: `Le nom et prénom du visiteur #${i + 1} sont obligatoires.` },
          { status: 400 }
        );
      }
    }

    const visit = await secretariatService.createVisit(user.organizationId, input, user.id);

    return NextResponse.json({
      success: true,
      message: `Visite ${visit.visit_reference} enregistrée avec succès.`,
      visit,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de l’enregistrement de la visite');
  }
}

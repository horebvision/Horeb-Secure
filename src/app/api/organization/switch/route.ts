import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authenticateApiRequest, isValidUuid, safeErrorResponse } from '@/lib/security/api-guard';
import { membershipService } from '@/lib/organizations/membership-service';
import { organizationService } from '@/lib/organizations/organization-service';

/**
 * POST /api/organization/switch
 * Commute l'espace de travail actif vers une autre organisation autorisée.
 * Règle de sécurité :
 * - Vérifie que l'utilisateur possède un membership ACTIF dans l'organisation cible,
 *   OU qu'il est Platform Admin.
 * - Ne fait JAMAIS confiance à un identifiant non vérifié.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetOrgId = body.organizationId || body.organization_id;

    if (!targetOrgId || !isValidUuid(targetOrgId)) {
      return NextResponse.json({ success: false, error: 'Identifiant d\'organisation invalide' }, { status: 400 });
    }

    // 1. Vérifier les droits : Platform Admin OU Membership Actif
    let isAuthorized = user.isPlatformAdmin;

    if (!isAuthorized) {
      const userMemberships = await membershipService.getUserMemberships(user.id);
      const targetMembership = userMemberships.find(
        (m) => m.organization_id === targetOrgId && m.status === 'ACTIVE'
      );
      if (targetMembership) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        {
          success: false,
          error: 'Accès refusé. Vous n\'êtes pas membre actif de cette entreprise.',
          code: 'UNAUTHORIZED_ORGANIZATION_SWITCH',
        },
        { status: 403 }
      );
    }

    // 2. Récupérer les informations de l'organisation
    const targetOrg = await organizationService.getOrganizationById(targetOrgId);
    if (!targetOrg) {
      return NextResponse.json({ success: false, error: 'Organisation introuvable' }, { status: 404 });
    }

    if (targetOrg.status === 'SUSPENDED' && !user.isPlatformAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cette organisation est actuellement suspendue. Veuillez contacter le support HOREB SECURE.',
          code: 'ORGANIZATION_SUSPENDED',
        },
        { status: 403 }
      );
    }

    // 3. Synchronisation immédiate en base de données de l'organisation active
    try {
      await (supabaseAdmin as any)
        .from('users')
        .update({
          organization_id: targetOrg.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
    } catch (dbSyncErr) {
      console.warn('[switch route] Note mise à jour DB users:', dbSyncErr);
    }

    // 4. Réponse avec configuration du cookie securia_org_id
    const response = NextResponse.json({
      success: true,
      message: `Basculement vers ${targetOrg.name} effectué avec succès`,
      organization: {
        id: targetOrg.id,
        name: targetOrg.name,
        commercialName: targetOrg.commercialName,
        plan: targetOrg.plan,
        status: targetOrg.status,
      },
    });

    // Cookie valide 30 jours, accessible aux requêtes Next.js
    response.cookies.set('securia_org_id', targetOrg.id, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du basculement d\'organisation');
  }
}

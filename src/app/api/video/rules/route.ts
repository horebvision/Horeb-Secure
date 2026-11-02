/**
 * GET  /api/video/rules - Liste des règles vidéo d'un site
 * POST /api/video/rules - Configuration d'une règle (event_type -> action, priorité, cooldown)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse, isValidUuid, getTenantOrgId } from '@/lib/security/api-guard';
import { VideoRepository } from '@/lib/video';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get('site_id');
    if (!siteId || !isValidUuid(siteId)) {
      return NextResponse.json({ error: 'Identifiant de site (UUID) requis.' }, { status: 400 });
    }

    const orgId = getTenantOrgId(user);
    const rules = await VideoRepository.getRulesForSite(siteId, orgId);

    return NextResponse.json({
      success: true,
      site_id: siteId,
      rules,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des règles');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
    }

    const body = await req.json();
    const { protected_site_id, camera_id, event_type, action, target_alert_type, target_priority, cooldown_seconds } = body;

    if (!protected_site_id || !isValidUuid(protected_site_id)) {
      return NextResponse.json({ error: 'Identifiant de site (UUID) requis.' }, { status: 400 });
    }

    if (!event_type || typeof event_type !== 'string') {
      return NextResponse.json({ error: 'Le type d’événement est requis.' }, { status: 400 });
    }

    const orgId = getTenantOrgId(user);

    const rule = await VideoRepository.createRule(
      {
        organization_id: orgId,
        protected_site_id,
        camera_id: camera_id && isValidUuid(camera_id) ? camera_id : null,
        event_type,
        action: action || 'CREATE_ALERT',
        target_alert_type: target_alert_type || 'INTRUSION',
        target_priority: target_priority || 'HIGH',
        cooldown_seconds: typeof cooldown_seconds === 'number' ? cooldown_seconds : 180,
        is_active: true,
      },
      user.id
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Règle vidéo configurée avec succès.',
        rule,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la création de la règle');
  }
}

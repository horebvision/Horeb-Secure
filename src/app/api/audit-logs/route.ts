import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  sanitizeString,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

export async function GET(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls les superviseurs et admins peuvent auditer les logs
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé aux journaux d’audit.' }, { status: 403 })
      );
    }

    const { searchParams } = new URL(req.url);
    const entityId = searchParams.get('entity_id');
    const entityType = searchParams.get('entity_type');
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);

    // Isolation multi-tenant : seul le Super Admin plateforme voit tous les journaux.
    // Les autres ne voient que ceux de leur organisation (colonne organization_id alimentée par trigger).
    if (!user.isPlatformAdmin && !user.organizationId) {
      return NextResponse.json({ success: true, count: 0, logs: [] });
    }

    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      // Les entrées de stockage technique (jetons d'invitation, fiches clients) ne sont jamais exposées
      .not('entity_type', 'in', '(client_invitation,client,client_site)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!user.isPlatformAdmin) {
      query = query.eq('organization_id', user.organizationId);
    }
    if (entityId) {
      query = query.eq('entity_id', sanitizeString(entityId, 100));
    }
    if (entityType) {
      query = query.eq('entity_type', sanitizeString(entityType, 50));
    }

    const { data: dbLogs, error: dbErr } = await query;
    if (dbErr) {
      return safeErrorResponse(dbErr, 'Erreur lors de la récupération des journaux d’audit');
    }
    const logs: any[] = dbLogs || [];

    return NextResponse.json({
      success: true,
      count: logs?.length || 0,
      logs: logs || [],
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des journaux d’audit');
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });
    // Écriture anonyme interdite : un journal d'audit doit être attribuable
    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { action, entity_type, entity_id, details } = body;

    if (!action || !entity_type) {
      return NextResponse.json(
        { success: false, error: 'action et entity_type sont requis' },
        { status: 400 }
      );
    }

    const sanitizedAction = sanitizeString(action, 100);
    const sanitizedEntityType = sanitizeString(entity_type, 100);
    const sanitizedEntityId = entity_id && isValidUuid(entity_id) ? entity_id : null;

    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        organization_id: user.organizationId || null,
        action: sanitizedAction,
        entity_type: sanitizedEntityType,
        entity_id: sanitizedEntityId || 'n/a',
        details: details && typeof details === 'object' ? details : {},
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de l’enregistrement de l’événement d’audit');
    }

    return NextResponse.json({ success: true, log: data });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’écriture du journal d’audit');
  }
}

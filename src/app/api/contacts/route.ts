import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  sanitizeString,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';

import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/contacts
 * Récupère les contacts d'urgence réels :
 * - Si `alert_id` est spécifié (accès par le régulateur SOC, patrouilleur ou déclarant) :
 *   Contrôle strict d'autorisation anti-IDOR : vérifie que l'alerte existe et appartient
 *   à l'organisation du régulateur (ou est assignée à l'agent). Extrait ensuite de façon
 *   autoritaire le user_id du déclarant depuis la base (aucun user_id client n'est toléré).
 * - Sans `alert_id` : récupère les contacts personnels de l'utilisateur authentifié.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const alertId = searchParams.get('alert_id');

    let targetUserId = user.id;

    // Si demande pour le compte d'une alerte en cours (ex: régulateur SOC en régulation)
    if (alertId) {
      if (!isValidUuid(alertId)) {
        return NextResponse.json(
          { success: false, error: 'Identifiant d’alerte (UUID) invalide' },
          { status: 400 }
        );
      }

      // Récupérer l'alerte pour valider l'existence et l'organisation
      const { data: targetAlert, error: alertErr } = await supabaseAdmin
        .from('alerts')
        .select('id, user_id, organization_id, assigned_agent_id')
        .eq('id', alertId)
        .maybeSingle();

      if (alertErr || !targetAlert) {
        return NextResponse.json(
          { success: false, error: 'Dossier d’alerte introuvable' },
          { status: 404 }
        );
      }

      // Habilitation stricte : vérification des droits d'accès au dossier d'alerte
      const isPlatformAdmin = user.isPlatformAdmin === true;
      const isDeclarant = user.id === targetAlert.user_id;
      const isSameOrg = Boolean(
        user.organizationId &&
        targetAlert.organization_id &&
        user.organizationId === targetAlert.organization_id
      );
      const isAssignedAgent = user.role === 'AGENT' && (
        targetAlert.assigned_agent_id === user.id || isSameOrg
      );

      const hasAccess =
        isPlatformAdmin ||
        isDeclarant ||
        ((user.role === 'ADMIN' || user.role === 'SECURITY_MANAGER') && isSameOrg) ||
        isAssignedAgent;

      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'Accès non autorisé aux contacts d’urgence de cette alerte' },
          { status: 403 }
        );
      }

      // Le user_id est extrait autoritairement de la ligne d'alerte certifiée en base
      targetUserId = targetAlert.user_id;
    }

    const db = alertId ? supabaseAdmin : await getScopedDatabaseClient(req);
    const { data: contacts, error } = await db
      .from('emergency_contacts')
      .select('id, user_id, name, relation, phone, priority_order, is_active, created_at')
      .eq('user_id', targetUserId)
      .eq('is_active', true)
      .order('priority_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération des contacts d’urgence');
    }

    return NextResponse.json({
      success: true,
      count: contacts?.length || 0,
      contacts: contacts || [],
      alert_id: alertId || undefined,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation des contacts');
  }
}

/**
 * POST /api/contacts
 * Ajoute un contact d'urgence en base PostgreSQL pour l'utilisateur connecté.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const { name, relation, phone, priority_order = 1 } = body;

    const sanitizedName = sanitizeString(name || '', 100);
    const sanitizedRelation = sanitizeString(relation || 'Proche', 60);
    const sanitizedPhone = sanitizeString(phone || '', 30);
    const priority = Math.max(1, Math.min(10, Number(priority_order) || 1));

    if (!sanitizedName || sanitizedName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Le nom du contact doit comporter au moins 2 caractères' },
        { status: 400 }
      );
    }

    if (!sanitizedPhone || sanitizedPhone.length < 4) {
      return NextResponse.json(
        { success: false, error: 'Un numéro de téléphone valide est obligatoire' },
        { status: 400 }
      );
    }

    const db = await getScopedDatabaseClient(req);
    const { data: newContact, error } = await db
      .from('emergency_contacts')
      .insert({
        user_id: user.id,
        name: sanitizedName,
        relation: sanitizedRelation,
        phone: sanitizedPhone,
        priority_order: priority,
        is_active: true,
      })
      .select('id, user_id, name, relation, phone, priority_order, is_active, created_at')
      .single();

    if (error) {
      return safeErrorResponse(error, 'Impossible d’enregistrer le contact d’urgence');
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Contact d’urgence enregistré avec succès',
        contact: newContact,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’ajout du contact');
  }
}

/**
 * DELETE /api/contacts
 * Supprime un contact d'urgence appartenant strictement à l'utilisateur connecté.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('id');

    if (!targetId || !isValidUuid(targetId)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant de contact valide (UUID) requis' },
        { status: 400 }
      );
    }

    const db = await getScopedDatabaseClient(req);
    const { error } = await db
      .from('emergency_contacts')
      .delete()
      .eq('id', targetId)
      .eq('user_id', user.id);

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la suppression du contact');
    }

    return NextResponse.json({
      success: true,
      message: 'Contact d’urgence supprimé avec succès',
      id: targetId,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la suppression du contact');
  }
}

/**
 * PATCH /api/contacts
 * Modifie les coordonnées ou la priorité d'un contact d'urgence existant.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Non authentifié' }, { status: 401 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const { id, name, relation, phone, priority_order, is_active } = body;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { success: false, error: 'Identifiant de contact valide (UUID) requis' },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};

    if (name !== undefined) {
      const sanitizedName = sanitizeString(name, 100);
      if (!sanitizedName || sanitizedName.length < 2) {
        return NextResponse.json(
          { success: false, error: 'Le nom doit comporter au moins 2 caractères' },
          { status: 400 }
        );
      }
      updates.name = sanitizedName;
    }

    if (relation !== undefined) {
      updates.relation = sanitizeString(relation, 60);
    }

    if (phone !== undefined) {
      const sanitizedPhone = sanitizeString(phone, 30);
      if (!sanitizedPhone || sanitizedPhone.length < 4) {
        return NextResponse.json(
          { success: false, error: 'Numéro de téléphone invalide' },
          { status: 400 }
        );
      }
      updates.phone = sanitizedPhone;
    }

    if (priority_order !== undefined) {
      updates.priority_order = Math.max(1, Math.min(10, Number(priority_order) || 1));
    }

    if (is_active !== undefined) {
      updates.is_active = Boolean(is_active);
    }

    const db = await getScopedDatabaseClient(req);
    const { data: updated, error } = await db
      .from('emergency_contacts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, user_id, name, relation, phone, priority_order, is_active, created_at')
      .single();

    if (error) {
      return safeErrorResponse(error, 'Impossible de modifier le contact d’urgence');
    }

    return NextResponse.json({
      success: true,
      message: 'Contact d’urgence mis à jour avec succès',
      contact: updated,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour du contact');
  }
}

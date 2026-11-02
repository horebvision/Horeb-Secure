import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  sanitizeString,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * GET /api/user/profile
 * Récupère le profil de l'utilisateur actuellement authentifié depuis public.users.
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

    const db = await getScopedDatabaseClient(req);
    let { data: dbUser, error } = await db
      .from('users')
      .select('id, email, full_name, phone, role, organization_id, security_center_id, created_at, updated_at, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (error && isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      const adminRes = await supabaseAdmin
        .from('users')
        .select('id, email, full_name, phone, role, organization_id, security_center_id, created_at, updated_at, is_active')
        .eq('id', user.id)
        .maybeSingle();
      if (!adminRes.error && adminRes.data) {
        dbUser = adminRes.data;
        error = null;
      }
    }

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération du profil');
    }

    if (dbUser && dbUser.is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Compte utilisateur inactif ou désactivé' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: dbUser || {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        phone: '',
        role: user.role,
        organization_id: user.organizationId,
        security_center_id: user.securityCenterId,
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la récupération du profil');
  }
}

/**
 * PATCH /api/user/profile
 * Met à jour le profil (nom complet et téléphone) du résident authentifié.
 * Sécurité anti-IDOR : l'utilisateur ne peut modifier que sa propre ligne (user.id issu du JWT/session).
 * Tout champ non modifiable (role, organization_id, is_active, etc.) est ignoré.
 */
export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { full_name, phone } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (full_name !== undefined) {
      const sanitizedName = sanitizeString(full_name, 100);
      if (!sanitizedName || sanitizedName.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'Le nom complet doit comporter au moins 2 caractères' },
          { status: 400 }
        );
      }
      updates.full_name = sanitizedName.trim();
    }

    if (phone !== undefined) {
      const sanitizedPhone = sanitizeString(phone, 30);
      if (!sanitizedPhone || sanitizedPhone.trim().length < 4) {
        return NextResponse.json(
          { success: false, error: 'Le numéro de téléphone est invalide (minimum 4 caractères)' },
          { status: 400 }
        );
      }
      const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{3,20}$/;
      if (!phoneRegex.test(sanitizedPhone.trim())) {
        return NextResponse.json(
          { success: false, error: 'Format du numéro de téléphone invalide (ex: +225 07 47 33 84 77)' },
          { status: 400 }
        );
      }
      updates.phone = sanitizedPhone.trim();
    }

    if (!updates.full_name && !updates.phone) {
      return NextResponse.json(
        { success: false, error: 'Aucun champ valide à mettre à jour' },
        { status: 400 }
      );
    }

    // 1. Mise à jour dans public.users sous contrôle d'identité strict
    const db = await getScopedDatabaseClient(req);
    let updatedUser: any = null;
    let updateError: any = null;

    const { data, error } = await db
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select('id, email, full_name, phone, role, organization_id, security_center_id, updated_at')
      .maybeSingle();

    if (error) {
      if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
        const adminRes = await supabaseAdmin
          .from('users')
          .update(updates)
          .eq('id', user.id)
          .select('id, email, full_name, phone, role, organization_id, security_center_id, updated_at')
          .maybeSingle();

        if (adminRes.error) {
          updateError = adminRes.error;
        } else {
          updatedUser = adminRes.data;
        }
      } else {
        updateError = error;
      }
    } else {
      updatedUser = data;
    }

    if (updateError) {
      return safeErrorResponse(updateError, 'Erreur lors de la mise à jour du profil');
    }

    // 2. Synchronisation des métadonnées Supabase Auth (si service_role disponible)
    try {
      if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            full_name: updates.full_name || user.fullName,
            phone: updates.phone,
          },
        });
      }
    } catch (metaErr) {
      console.warn('[API /api/user/profile] Sync metadata note:', metaErr);
    }

    // 3. Traçabilité dans audit_logs
    try {
      if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
        await supabaseAdmin.from('audit_logs').insert({
          user_id: user.id,
          action: 'USER_PROFILE_UPDATED',
          entity_type: 'user',
          entity_id: user.id,
          details: {
            updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
            previous_name: user.fullName,
          },
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1',
          user_agent: req.headers.get('user-agent') || 'Securia Client Web',
        });
      }
    } catch (auditErr) {
      console.warn('[API /api/user/profile] Audit log note:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      profile: updatedUser || { ...user, ...updates },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la mise à jour du profil');
  }
}

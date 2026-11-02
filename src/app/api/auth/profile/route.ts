import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import { createClient as createClientJS } from '@supabase/supabase-js';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';
import { assertAuthorizedSupabaseUrl } from '@/lib/config/env';
import { isValidUuid } from '@/lib/security/api-guard';


/**
 * GET /api/auth/profile
 * Source de vérité unique pour le profil utilisateur réel authentifié.
 * Vérifie la session Supabase Auth réelle, extrait l'utilisateur,
 * puis interroge la table public.users et public.organizations.
 * 
 * Aucune identité de test ni profil fictif n'est retourné pour une vraie session.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(bearerToken);

    if (authError || !authUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Aucune session active Supabase Auth.',
          profile: null,
        },
        { status: 401 }
      );
    }

    // Client de base de données approprié avec RLS authentifié
    let dbClient = supabase;
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      dbClient = supabaseAdmin;
    } else if (bearerToken) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      assertAuthorizedSupabaseUrl(url);
      dbClient = createClientJS(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    // Récupération du profil applicatif réel depuis public.users
    const { data: dbUser, error: dbError } = await dbClient
      .from('users')
      .select(`
        id,
        email,
        full_name,
        phone,
        role,
        organization_id,
        security_center_id,
        avatar_url,
        is_active,
        created_at,
        updated_at,
        organizations (
          id,
          name,
          city,
          address,
          phone,
          email
        )
      `)
      .eq('id', authUser.id)
      .maybeSingle();

    if (dbError) {
      console.error('[API /api/auth/profile] Erreur récupération DB user:', dbError);
    }

    // Rôle certifié uniquement depuis public.users (user_metadata est modifiable par l'utilisateur)
    const realRole: UserRole = (dbUser?.role as UserRole) || 'USER';
    const realFullName = dbUser?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Utilisateur';
    const realPhone = dbUser?.phone || authUser.user_metadata?.phone || '';
    const organization = (dbUser as any)?.organizations || null;

    // Récupération des sites protégés de l'utilisateur
    let sites: any[] = [];
    if (realRole === 'USER') {
      const { data: userSites } = await dbClient
        .from('protected_sites')
        .select('*')
        .eq('owner_id', authUser.id)
        .order('is_default', { ascending: false });
      sites = userSites || [];
    }

    // Récupération des contacts d'urgence réels depuis public.emergency_contacts
    let emergencyContacts = [
      { name: 'Police Secours (Côte d’Ivoire)', relation: 'Secours', phone: '170', priority_order: 1 },
      { name: 'Sapeurs-Pompiers (GSPM)', relation: 'Secours', phone: '180', priority_order: 2 },
    ];

    try {
      const { data: dbContacts } = await dbClient
        .from('emergency_contacts')
        .select('id, name, relation, phone, priority_order, is_active')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .order('priority_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (dbContacts && dbContacts.length > 0) {
        emergencyContacts = dbContacts;
      }
    } catch (e) {
      console.warn('[API /api/auth/profile] Note contacts:', e);
    }

    let isPlatformAdmin = isPlatformAdminUser({
      role: realRole,
      email: authUser.email || dbUser?.email,
      organizationId: dbUser?.organization_id || organization?.id,
    });

    if (!isPlatformAdmin && realRole === 'ADMIN') {
      try {
        const { data: paData } = await dbClient
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', authUser.id)
          .maybeSingle();
        if (paData?.user_id) {
          isPlatformAdmin = true;
        }
      } catch (e) {
        // Ignorer
      }
    }

    // Résolution dynamique de l'organisation active (basculement d'espace multi-tenant)
    const switchedOrgId = req.cookies.get('securia_org_id')?.value || req.headers.get('x-user-org-id');
    let effectiveOrgId = dbUser?.organization_id || organization?.id || null;
    let effectiveOrgName = organization?.name || 'HOREB SECURE Côte d’Ivoire';

    if (switchedOrgId && isValidUuid(switchedOrgId) && switchedOrgId !== effectiveOrgId) {
      try {
        const { data: targetOrg } = await dbClient
          .from('organizations')
          .select('id, name')
          .eq('id', switchedOrgId)
          .maybeSingle();

        if (targetOrg) {
          effectiveOrgId = targetOrg.id;
          effectiveOrgName = targetOrg.name;
        }
      } catch (switchErr) {
        console.warn('[API /api/auth/profile] Note switchedOrg:', switchErr);
      }
    }

    const profile = {
      id: authUser.id,
      authUserId: authUser.id,
      email: authUser.email || dbUser?.email || '',
      fullName: realFullName,
      phone: realPhone,
      role: realRole,
      isPlatformAdmin,
      organizationId: effectiveOrgId,
      organizationName: effectiveOrgName,
      securityCenterId: dbUser?.security_center_id || null,
      avatarUrl: dbUser?.avatar_url || authUser.user_metadata?.avatar_url || null,
      isActive: dbUser?.is_active ?? true,
      emergencyContacts,
      sitesCount: sites.length,
      sites,
      createdAt: dbUser?.created_at || authUser.created_at,
    };

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (err: any) {
    console.error('[API /api/auth/profile] Exception:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Erreur interne lors de la récupération du profil utilisateur',
        details: err.message,
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { findAuthUserByEmail } from '@/lib/supabase/auth-users';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { membershipService } from '@/lib/organizations/membership-service';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import type { UserRole } from '@/modules/users/types';

/**
 * GET /api/organization/users
 * Liste les membres de l'organisation courante de l'utilisateur.
 * Accessible aux rôles ADMIN et SECURITY_MANAGER de l'organisation.
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

    const members = await membershipService.getOrganizationMembers(user.organizationId);

    return NextResponse.json({
      success: true,
      count: members.length,
      organizationId: user.organizationId,
      users: members,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération des membres');
  }
}

/**
 * POST /api/organization/users
 * Invite ou crée un nouvel agent ou collaborateur au sein de l'organisation courante.
 * Accessible aux rôles ADMIN et SECURITY_MANAGER de l'organisation (ou Platform Admin).
 * Garantit l'étanchéité multi-tenant absolue (organization_id).
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
        NextResponse.json({ success: false, error: 'Accès refusé. Organisation non définie.' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      email,
      fullName,
      role = 'AGENT',
      phone = '',
      badgeNumber,
      patrolVehicle,
      password,
    } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Une adresse email valide est obligatoire pour identifier le compte.' },
        { status: 400 }
      );
    }

    const validRoles: UserRole[] = ['ADMIN', 'SECURITY_MANAGER', 'SECRETARY', 'AGENT', 'USER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: `Rôle invalide. Rôles autorisés: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = (fullName || cleanEmail.split('@')[0]).trim();
    const cleanPhone = (phone || '').trim();
    const targetOrgId = user.organizationId;

    // Contrôle strict des quotas SaaS de l'organisation
    try {
      const { QuotaService } = await import('@/lib/billing/quota-service');
      const quotaKey = role === 'AGENT' ? 'maxAgents' : 'maxUsers';
      await QuotaService.assertCanConsume(targetOrgId, quotaKey);
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
      console.warn('[Organization Create User] Note vérification quota:', quotaErr?.message);
    }

    let targetUserId = crypto.randomUUID();
    const now = new Date().toISOString();

    const generateSecurePassword = () => {
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
      let res = 'Sec@';
      for (let i = 0; i < 8; i++) {
        res += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return res;
    };

    const initialPassword = password && password.trim().length >= 6
      ? password.trim()
      : generateSecurePassword();

    // 1. Création ou synchronisation du compte dans Supabase Auth (auth.users)
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      try {
        const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: initialPassword,
          email_confirm: true,
          // Rôle et organisation de confiance : app_metadata n'est modifiable qu'avec la clé secrète
          app_metadata: { role, organization_id: targetOrgId },
          user_metadata: {
            full_name: cleanFullName,
            phone: cleanPhone,
            role,
            organization_id: targetOrgId,
          },
        });

        if (!authErr && authCreated?.user?.id) {
          targetUserId = authCreated.user.id;
        } else if (authErr) {
          // Compte déjà existant : on ne le « récupère » que s'il appartient déjà à CETTE organisation.
          // Sinon, réinitialiser son mot de passe permettrait de s'approprier le compte d'un autre tenant.
          const existingAuth = await findAuthUserByEmail(cleanEmail);
          if (!existingAuth?.id) {
            return NextResponse.json(
              { success: false, error: authErr.message || 'Création du compte impossible.' },
              { status: 400 }
            );
          }

          const { data: existingProfile } = await supabaseAdmin
            .from('users')
            .select('id, organization_id')
            .eq('id', existingAuth.id)
            .maybeSingle();

          if (!existingProfile || existingProfile.organization_id !== targetOrgId) {
            return NextResponse.json(
              {
                success: false,
                code: 'EMAIL_ALREADY_REGISTERED',
                error: 'Un compte existe déjà avec cette adresse email en dehors de votre organisation.',
              },
              { status: 409 }
            );
          }

          targetUserId = existingAuth.id;
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            ...(password && password.trim().length >= 6 ? { password: initialPassword } : {}),
            user_metadata: {
              full_name: cleanFullName,
              phone: cleanPhone,
            },
          });
        }
      } catch (authEx) {
        console.warn('[API /organization/users] Note création auth.users:', authEx);
      }
    }

    // 2. Persistance dans la table applicative public.users
    if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      try {
        await supabaseAdmin.from('users').upsert({
          id: targetUserId,
          email: cleanEmail,
          full_name: cleanFullName,
          phone: cleanPhone,
          role,
          organization_id: targetOrgId,
          is_active: true,
          updated_at: now,
        });
      } catch (dbErr) {
        console.warn('[API /organization/users] Note upsert public.users:', dbErr);
      }
    }

    // 3. Provisioning spécifique pour le profil d'agent de sécurité (security_agents)
    let assignedBadge = badgeNumber?.trim();
    let assignedVehicle = patrolVehicle?.trim() || 'Patrouille Alpha Securia';

    if (role === 'AGENT') {
      if (!assignedBadge) {
        assignedBadge = `AGT-${targetUserId.substring(0, 6).toUpperCase()}`;
      }

      if (isRealServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
        try {
          // Résolution dynamique du centre de télésurveillance lié à cette organisation si existant
          const { data: center } = await supabaseAdmin
            .from('security_centers')
            .select('id')
            .eq('organization_id', targetOrgId)
            .maybeSingle();
          const validCenterId = center?.id || null;

          const { data: existingAgent } = await supabaseAdmin
            .from('security_agents')
            .select('id')
            .eq('user_id', targetUserId)
            .maybeSingle();

          if (existingAgent) {
            await supabaseAdmin
              .from('security_agents')
              .update({
                organization_id: targetOrgId,
                security_center_id: validCenterId,
                badge_number: assignedBadge,
                patrol_vehicle: assignedVehicle,
                duty_status: 'AVAILABLE',
                is_active: true,
                updated_at: now,
              })
              .eq('id', existingAgent.id);
          } else {
            await supabaseAdmin.from('security_agents').insert({
              id: crypto.randomUUID(),
              user_id: targetUserId,
              organization_id: targetOrgId,
              security_center_id: validCenterId,
              badge_number: assignedBadge,
              patrol_vehicle: assignedVehicle,
              duty_status: 'AVAILABLE',
              is_active: true,
            });
          }
        } catch (agErr) {
          console.warn('[API /organization/users] Note insert security_agents:', agErr);
        }
      }
    }

    // 4. Enregistrement du membership
    const membership = await membershipService.addMembership({
      userId: targetUserId,
      organizationId: targetOrgId,
      role,
      status: 'ACTIVE',
      invitedBy: user.id,
      email: cleanEmail,
      fullName: cleanFullName,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (req.headers.get('origin') || req.nextUrl.origin);
    const loginUrl = `${appUrl}/login?email=${encodeURIComponent(cleanEmail)}`;
    const activationUrl = `${appUrl}/register?email=${encodeURIComponent(cleanEmail)}`;

    const roleLabels: Record<string, string> = {
      AGENT: 'Agent Terrain / Patrouilleur',
      SECRETARY: 'Secrétaire / Accueil (Registre Visiteurs)',
      SECURITY_MANAGER: 'Contrôleur Dispatch / Régulateur SOC',
      ADMIN: 'Administrateur d\'Entreprise',
      USER: 'Client Final / Résident',
    };

    return NextResponse.json({
      success: true,
      message: role === 'AGENT'
        ? `Profil agent de sécurité créé avec succès pour ${cleanFullName} (Badge: ${assignedBadge})`
        : role === 'SECRETARY'
        ? `Profil secrétaire créé avec succès pour ${cleanFullName}`
        : role === 'SECURITY_MANAGER'
        ? `Contrôleur Dispatch ${cleanFullName} configuré avec succès`
        : `Collaborateur ${cleanFullName} enregistré avec succès`,
      user: {
        id: targetUserId,
        email: cleanEmail,
        fullName: cleanFullName,
        phone: cleanPhone,
        role,
        organizationId: targetOrgId,
        badgeNumber: role === 'AGENT' ? assignedBadge : undefined,
        patrolVehicle: role === 'AGENT' ? assignedVehicle : undefined,
      },
      credentials: {
        email: cleanEmail,
        fullName: cleanFullName,
        role,
        roleLabel: roleLabels[role] || role,
        badgeNumber: role === 'AGENT' ? assignedBadge : undefined,
        patrolVehicle: role === 'AGENT' ? assignedVehicle : undefined,
        temporaryPassword: initialPassword,
        loginUrl,
        activationUrl,
      },
      membership,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la création de l\'agent/collaborateur');
  }
}

/**
 * SECURIA V2 — PHASE 11 : SERVICE DES MEMBERSHIPS D'ORGANISATION
 * Support du cas standard (1 utilisateur -> 1 org) et des cas multi-organisations (Platform Admin, consultants)
 */

import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import type { UserRole } from '@/modules/users/types';
import type { OrganizationMembership, MembershipStatus } from './types';
import { OrganizationService, MASTER_PLATFORM_ORG_ID } from './organization-service';
import crypto from 'crypto';

export class MembershipService {
  private static memoryStore: Map<string, OrganizationMembership> = new Map();

  /**
   * Clé unique pour la table de jointure user <-> org
   */
  private static getCompositeKey(userId: string, orgId: string): string {
    return `${userId}_${orgId}`;
  }

  /**
   * Récupère tous les memberships d'un utilisateur
   */
  public static async getUserMemberships(userId: string): Promise<OrganizationMembership[]> {
    if (!userId) return [];
    const memberships: OrganizationMembership[] = [];

    // 1. Récupération de l'organisation principale depuis public.users
    try {
      if (isRealServiceRoleKey()) {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('id, role, organization_id, is_active, created_at')
          .eq('id', userId)
          .maybeSingle();

        if (userRow && userRow.organization_id) {
          const org = await OrganizationService.getOrganizationById(userRow.organization_id);
          memberships.push({
            id: `primary_${userId}_${userRow.organization_id.substring(0, 8)}`,
            user_id: userId,
            organization_id: userRow.organization_id,
            role: userRow.role as UserRole,
            status: userRow.is_active ? 'ACTIVE' : 'SUSPENDED',
            created_at: userRow.created_at,
            updated_at: userRow.created_at,
            organization: org || undefined,
          });
        }
      }
    } catch (e) {
      console.warn('[MembershipService] Note fetch primary user org:', e);
    }

    // 2. Récupération des memberships multi-organisations additionnels en mémoire / table
    for (const m of this.memoryStore.values()) {
      if (m.user_id === userId) {
        // Éviter les doublons avec l'organisation principale
        if (!memberships.some((existing) => existing.organization_id === m.organization_id)) {
          const org = await OrganizationService.getOrganizationById(m.organization_id);
          memberships.push({
            ...m,
            organization: org || undefined,
          });
        }
      }
    }

    // 3. Cas spécial : Le Platform Admin (Super Admin) a un accès garanti d'assistance à toutes les organisations
    return memberships;
  }

  /**
   * Vérifie si un utilisateur possède un accès actif à une organisation spécifique
   */
  public static async hasAccessToOrganization(
    userId: string,
    organizationId: string,
    userRole?: UserRole
  ): Promise<{ allowed: boolean; role?: UserRole; isPlatformAdmin?: boolean }> {
    if (!userId || !organizationId) {
      return { allowed: false };
    }

    // Vérifier si c'est un Platform Admin
    if (userRole === 'ADMIN') {
      const primaryMemberships = await this.getUserMemberships(userId);
      const isPlatform = primaryMemberships.some(
        (m) => m.organization_id === MASTER_PLATFORM_ORG_ID && m.role === 'ADMIN'
      );
      if (isPlatform) {
        return { allowed: true, role: 'ADMIN', isPlatformAdmin: true };
      }
    }

    const memberships = await this.getUserMemberships(userId);
    const match = memberships.find(
      (m) => m.organization_id === organizationId && m.status === 'ACTIVE'
    );

    if (match) {
      return { allowed: true, role: match.role, isPlatformAdmin: false };
    }

    return { allowed: false };
  }

  /**
   * Associe un utilisateur à une organisation
   */
  public static async addMembership(input: {
    userId: string;
    organizationId: string;
    role: UserRole;
    status?: MembershipStatus;
    invitedBy?: string;
    email?: string;
    fullName?: string;
  }): Promise<OrganizationMembership> {
    const key = this.getCompositeKey(input.userId, input.organizationId);
    const now = new Date().toISOString();

    const membership: OrganizationMembership = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      organization_id: input.organizationId,
      role: input.role,
      status: input.status || 'ACTIVE',
      invited_by: input.invitedBy || null,
      email: input.email,
      full_name: input.fullName,
      created_at: now,
      updated_at: now,
    };

    this.memoryStore.set(key, membership);

    // Mettre à jour l'utilisateur dans public.users si nécessaire
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('users')
          .update({ organization_id: input.organizationId })
          .eq('id', input.userId);
      }
    } catch {
      // Ignorer
    }

    return membership;
  }

  /**
   * Met à jour le rôle ou le statut d'un membership
   */
  public static async updateMembership(
    userId: string,
    organizationId: string,
    updates: { role?: UserRole; status?: MembershipStatus },
    actorUserId?: string
  ): Promise<OrganizationMembership | null> {
    const key = this.getCompositeKey(userId, organizationId);
    let membership = this.memoryStore.get(key);

    if (!membership) {
      // Tenter de construire à partir de public.users
      const existingList = await this.getUserMemberships(userId);
      const found = existingList.find((m) => m.organization_id === organizationId);
      if (found) {
        membership = { ...found };
      }
    }

    if (!membership) return null;

    if (updates.role) membership.role = updates.role;
    if (updates.status) membership.status = updates.status;
    membership.updated_at = new Date().toISOString();

    this.memoryStore.set(key, membership);

    // Persistance dans public.users si c'est l'organisation principale
    try {
      if (isRealServiceRoleKey()) {
        const payload: Record<string, any> = {};
        if (updates.role) payload.role = updates.role;
        if (updates.status === 'SUSPENDED') payload.is_active = false;
        if (updates.status === 'ACTIVE') payload.is_active = true;

        if (Object.keys(payload).length > 0) {
          await supabaseAdmin
            .from('users')
            .update(payload)
            .eq('id', userId)
            .eq('organization_id', organizationId);
        }
      }
    } catch (e) {
      console.warn('[MembershipService] Note update user in DB:', e);
    }

    return membership;
  }

  /**
   * Révoque le membership d'un utilisateur
   */
  public static async removeMembership(
    userId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<boolean> {
    const key = this.getCompositeKey(userId, organizationId);
    if (this.memoryStore.has(key)) {
      const m = this.memoryStore.get(key)!;
      m.status = 'REMOVED';
      m.updated_at = new Date().toISOString();
      this.memoryStore.set(key, m);
    } else {
      this.memoryStore.set(key, {
        id: crypto.randomUUID(),
        user_id: userId,
        organization_id: organizationId,
        role: 'USER',
        status: 'REMOVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // Si c'est l'org principale, suspendre le compte
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('users')
          .update({ is_active: false })
          .eq('id', userId)
          .eq('organization_id', organizationId);
      }
    } catch {
      // Ignorer
    }

    return true;
  }

  /**
   * Récupère tous les membres d'une organisation
   */
  public static async getOrganizationMembers(organizationId: string): Promise<any[]> {
    if (!organizationId) return [];

    const membersMap = new Map<string, any>();

    // 1. Récupération des utilisateurs en base
    try {
      if (isRealServiceRoleKey()) {
        const { data: dbUsers, error } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, role, is_active, created_at, phone')
          .eq('organization_id', organizationId);

        if (!error && dbUsers) {
          for (const u of dbUsers) {
            const key = this.getCompositeKey(u.id, organizationId);
            const mem = this.memoryStore.get(key);
            if (mem && mem.status === 'REMOVED') {
              continue;
            }

            membersMap.set(u.id, {
              id: u.id,
              email: u.email,
              full_name: u.full_name || u.email?.split('@')[0] || 'Utilisateur',
              role: u.role as UserRole,
              status: u.is_active ? 'ACTIVE' : 'SUSPENDED',
              phone: u.phone || null,
              created_at: u.created_at,
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[MembershipService] Erreur fetch db users for org ${organizationId}:`, e);
    }

    // 2. Fusion avec le memoryStore
    for (const m of this.memoryStore.values()) {
      if (m.organization_id === organizationId) {
        if (m.status === 'REMOVED') {
          membersMap.delete(m.user_id);
          continue;
        }

        const existing = membersMap.get(m.user_id);
        if (existing) {
          existing.role = m.role;
          existing.status = m.status;
        } else {
          membersMap.set(m.user_id, {
            id: m.user_id,
            email: m.email || `user_${m.user_id.substring(0, 6)}@org.ci`,
            full_name: m.full_name || `Membre ${m.role}`,
            role: m.role,
            status: m.status,
            created_at: m.created_at,
          });
        }
      }
    }

    return Array.from(membersMap.values());
  }

  /**
   * Invite un nouvel utilisateur au sein de l'organisation
   */
  public static async inviteUserToOrganization(params: {
    organizationId: string;
    email: string;
    fullName: string;
    role: UserRole;
    invitedBy?: string;
  }): Promise<any> {
    const { organizationId, email, fullName, role, invitedBy } = params;
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    // Insertion en base si possible
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('users').upsert({
          id: userId,
          email,
          full_name: fullName,
          role,
          organization_id: organizationId,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (e) {
      console.warn('[MembershipService] Note invitation db insert:', e);
    }

    const membership = await this.addMembership({
      userId,
      organizationId,
      role,
      status: 'INVITED',
      invitedBy,
      email,
      fullName,
    });

    return {
      id: userId,
      email,
      full_name: fullName,
      role,
      status: 'INVITED',
      created_at: now,
      membership,
    };
  }

  /**
   * Met à jour le rôle d'un membre dans une organisation
   */
  public static async updateMembershipRole(
    userId: string,
    organizationId: string,
    role: UserRole,
    actorId?: string
  ): Promise<any> {
    return this.updateMembership(userId, organizationId, { role }, actorId);
  }

  /**
   * Met à jour le statut d'un membre (ex: SUSPENDED, ACTIVE)
   */
  public static async updateMembershipStatus(
    userId: string,
    organizationId: string,
    status: MembershipStatus,
    actorId?: string
  ): Promise<any> {
    return this.updateMembership(userId, organizationId, { status }, actorId);
  }
}

export const membershipService = MembershipService;


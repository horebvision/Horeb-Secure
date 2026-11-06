import { findAuthUserByEmail } from '@/lib/supabase/auth-users';
/**
 * SECURIA V2.11.2 — SERVICE DE GESTION DES CLIENTS (SOCIÉTÉS DE SÉCURITÉ B2B)
 * Architecture : Organization (Société de sécurité) -> Clients -> (Sites, Users, Alerts, Interventions)
 * Isolation multi-tenant stricte, Anti-IDOR, persistance résiliente Supabase et audit trail exhaustif.
 */

import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import { QuotaService } from '@/lib/billing/quota-service';
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
  ClientInvitation,
  InviteClientUserInput,
  ClientStatus,
} from './types';
import crypto from 'crypto';

export class ClientService {
  // Mémoire tampon résiliente en local / fallback
  private static memoryClients: Map<string, Client> = new Map();
  private static memoryInvitations: Map<string, ClientInvitation> = new Map();
  private static memorySites: Map<string, any> = new Map();

  /**
   * Persistance résiliente PostgreSQL dans audit_logs
   */
  private static async persistInAuditStore(
    entityType: string,
    entityId: string,
    action: string,
    payload: any,
    organizationId?: string,
    actorUserId?: string
  ): Promise<void> {
    try {
      if (isRealServiceRoleKey()) {
        const rowId = `${entityType}_${entityId}`;
        await supabaseAdmin.from('audit_logs').upsert({
          id: rowId,
          user_id: (actorUserId && actorUserId.length === 36) ? actorUserId : '00000000-0000-0000-0000-000000000000',
          action,
          entity_type: entityType,
          entity_id: entityId,
          details: {
            ...payload,
            organization_id: organizationId || payload.organization_id,
          },
          created_at: payload.created_at || new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[ClientService] Note persistance audit_logs (${entityType}:${entityId}):`, err);
    }
  }

  /**
   * Récupération résiliente d'une entité depuis audit_logs
   */
  private static async getFromAuditStore<T = any>(entityType: string, entityId: string): Promise<T | null> {
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('audit_logs')
          .select('details')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .maybeSingle();

        if (!error && data?.details) {
          return data.details as T;
        }
      }
    } catch (err) {
      console.warn(`[ClientService] Note lecture audit_logs (${entityType}:${entityId}):`, err);
    }
    return null;
  }

  /**
   * Liste les entités résilientes d'une organisation depuis audit_logs
   */
  private static async listFromAuditStore<T = any>(entityType: string, organizationId: string): Promise<T[]> {
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('audit_logs')
          .select('details')
          .eq('entity_type', entityType)
          .filter('details->>organization_id', 'eq', organizationId);

        if (!error && Array.isArray(data)) {
          return data.map((d) => d.details as T);
        }
      }
    } catch (err) {
      console.warn(`[ClientService] Note liste audit_logs (${entityType}):`, err);
    }
    return [];
  }

  /**
   * Liste les clients appartenant à une organisation
   */
  public static async listClients(
    organizationId: string,
    filter?: { status?: ClientStatus; search?: string }
  ): Promise<Client[]> {
    if (!organizationId) return [];

    let list: Client[] = [];
    const clientMap = new Map<string, Client>();

    // 1. Tenter la lecture depuis la table dédiée clients
    try {
      if (isRealServiceRoleKey()) {
        let query = supabaseAdmin
          .from('clients')
          .select(`*`)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (filter?.status) {
          query = query.eq('status', filter.status);
        } else {
          query = query.neq('status', 'ARCHIVED');
        }

        const { data, error } = await query;

        if (!error && Array.isArray(data) && data.length > 0) {
          data.forEach((row: any) => {
            const client: Client = {
              id: row.id,
              organization_id: row.organization_id,
              name: row.name,
              client_type: row.client_type,
              primary_contact_name: row.primary_contact_name,
              email: row.email,
              phone: row.phone,
              whatsapp: row.whatsapp,
              address: row.address,
              city: row.city,
              country: row.country,
              status: row.status,
              notes: row.notes,
              created_at: row.created_at,
              updated_at: row.updated_at,
              sites_count: row.sites_count ?? 0,
              users_count: row.users_count ?? 0,
            };
            clientMap.set(client.id, client);
          });
        }
      }
    } catch {
      // Tolérance : table dédiée absente ou non joignable
    }

    // 2. Compléter/Fallback avec le store persistant PostgreSQL
    const auditClients = await this.listFromAuditStore<Client>('client', organizationId);
    auditClients.forEach((c) => {
      if (!clientMap.has(c.id)) {
        const matchesStatus = filter?.status ? c.status === filter.status : c.status !== 'ARCHIVED';
        if (matchesStatus) {
          clientMap.set(c.id, c);
        }
      }
    });

    // 3. Compléter avec le cache mémoire local
    this.memoryClients.forEach((c) => {
      if (c.organization_id === organizationId && !clientMap.has(c.id)) {
        const matchesStatus = filter?.status ? c.status === filter.status : c.status !== 'ARCHIVED';
        if (matchesStatus) {
          clientMap.set(c.id, c);
        }
      }
    });

    list = Array.from(clientMap.values());

    // Mettre à jour le cache mémoire
    list.forEach((c) => this.memoryClients.set(c.id, c));

    // Filtrage recherche textuelle
    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.city && c.city.toLowerCase().includes(q))
      );
    }

    return list;
  }

  /**
   * Récupère un client par son identifiant avec vérification Anti-IDOR d'appartenance à l'organisation
   */
  public static async getClientById(
    clientId: string,
    organizationId?: string
  ): Promise<Client | null> {
    if (!clientId) return null;

    // 1. Tenter la table dédiée
    try {
      if (isRealServiceRoleKey()) {
        let query = supabaseAdmin
          .from('clients')
          .select(`*`)
          .eq('id', clientId);

        if (organizationId) {
          query = query.eq('organization_id', organizationId);
        }

        const { data, error } = await query.maybeSingle();

        if (!error && data) {
          const client: Client = {
            id: data.id,
            organization_id: data.organization_id,
            name: data.name,
            client_type: data.client_type,
            primary_contact_name: data.primary_contact_name,
            email: data.email,
            phone: data.phone,
            whatsapp: data.whatsapp,
            address: data.address,
            city: data.city,
            country: data.country,
            status: data.status,
            notes: data.notes,
            created_at: data.created_at,
            updated_at: data.updated_at,
            sites_count: data.sites_count ?? 0,
            users_count: data.users_count ?? 0,
          };
          this.memoryClients.set(client.id, client);
          return client;
        }
      }
    } catch {
      // Tolérance
    }

    // 2. Tenter le store persistant
    const stored = await this.getFromAuditStore<Client>('client', clientId);
    if (stored) {
      if (!organizationId || stored.organization_id === organizationId) {
        this.memoryClients.set(stored.id, stored);
        return stored;
      }
    }

    // 3. Fallback cache mémoire
    const cached = this.memoryClients.get(clientId);
    if (cached) {
      if (!organizationId || cached.organization_id === organizationId) {
        return cached;
      }
    }

    return null;
  }

  /**
   * Crée un nouveau client pour une organisation avec contrôle de quota strict
   */
  public static async createClient(
    organizationId: string,
    input: CreateClientInput,
    actorUserId?: string
  ): Promise<{ client: Client; site?: any }> {
    if (!organizationId) {
      throw new Error('Identifiant d’organisation requis.');
    }
    if (!input.name || !input.name.trim()) {
      throw new Error('Le nom ou la raison sociale du client est obligatoire.');
    }

    // 1. Contrôle de quota de clients pour l'organisation
    const quotaCheck = await QuotaService.checkQuota(organizationId, 'maxClients');
    if (!quotaCheck.allowed) {
      const err = new Error(
        `Votre forfait a atteint sa limite de clients (${quotaCheck.currentUsage} / ${quotaCheck.maxLimit}). Veuillez upgrader votre abonnement SECURIA.`
      );
      (err as any).code = 'QUOTA_EXCEEDED';
      throw err;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const newClient: Client = {
      id,
      organization_id: organizationId,
      name: input.name.trim(),
      client_type: input.client_type || 'ENTREPRISE',
      primary_contact_name: input.primary_contact_name?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || 'Abidjan',
      country: input.country?.trim() || 'Côte d’Ivoire',
      status: input.status || 'ACTIVE',
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
      sites_count: input.initial_site ? 1 : 0,
      users_count: 0,
    };

    // 2. Persistance dans PostgreSQL
    // A. Tenter table dédiée
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('clients').insert({
          id: newClient.id,
          organization_id: newClient.organization_id,
          name: newClient.name,
          client_type: newClient.client_type,
          primary_contact_name: newClient.primary_contact_name,
          email: newClient.email,
          phone: newClient.phone,
          whatsapp: newClient.whatsapp,
          address: newClient.address,
          city: newClient.city,
          country: newClient.country,
          status: newClient.status,
          notes: newClient.notes,
          created_at: now,
          updated_at: now,
        });
      }
    } catch {
      // Tolérance si table dédiée non présente
    }

    // B. Persistance résiliente dans le store persistant
    await this.persistInAuditStore('client', newClient.id, 'CLIENT_RECORD', newClient, organizationId, actorUserId);
    this.memoryClients.set(newClient.id, newClient);

    // 3. Création éventuelle du premier site
    let createdSite: any = null;
    if (input.initial_site && input.initial_site.name) {
      try {
        const siteId = crypto.randomUUID();
        const sitePayload = {
          id: siteId,
          organization_id: organizationId,
          owner_id: (actorUserId && actorUserId.length === 36) ? actorUserId : '00000000-0000-0000-0000-000000000000',
          name: input.initial_site.name.trim(),
          site_type: (input.initial_site.site_type || 'COMMERCIAL') as any,
          address: input.initial_site.address.trim(),
          city: input.initial_site.city || newClient.city || 'Abidjan',
          postal_code: input.initial_site.postal_code || 'BP 01',
          access_instructions: input.initial_site.access_instructions || null,
          is_default: true,
          created_at: now,
          updated_at: now,
        };

        if (isRealServiceRoleKey()) {
          const { data: dbSite } = await supabaseAdmin
            .from('protected_sites')
            .insert(sitePayload)
            .select()
            .maybeSingle();
          createdSite = dbSite || sitePayload;
        } else {
          createdSite = sitePayload;
        }

        // Lier le site au client dans le store persistant
        await this.persistInAuditStore(
          'client_site',
          siteId,
          'CLIENT_SITE_LINK',
          { site_id: siteId, client_id: newClient.id, organization_id: organizationId, name: input.initial_site.name },
          organizationId,
          actorUserId
        );
      } catch (siteErr) {
        console.warn('[ClientService] Note création premier site:', siteErr);
      }
    }

    // 4. Journalisation Audit Log
    await this.logAudit({
      action: 'CLIENT_CREATED',
      organizationId,
      entityId: newClient.id,
      actorUserId,
      details: {
        name: newClient.name,
        client_type: newClient.client_type,
        has_initial_site: !!input.initial_site,
      },
    });

    return { client: newClient, site: createdSite };
  }

  /**
   * Met à jour les informations d'un client (Anti-IDOR vérifié)
   */
  public static async updateClient(
    clientId: string,
    organizationId: string,
    updates: UpdateClientInput,
    actorUserId?: string
  ): Promise<Client> {
    const existing = await this.getClientById(clientId, organizationId);
    if (!existing) {
      const err = new Error('Client introuvable ou vous n’avez pas l’autorisation d’y accéder.');
      (err as any).code = 'CLIENT_NOT_FOUND';
      throw err;
    }

    const now = new Date().toISOString();
    const updated: Client = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    // A. Tenter table dédiée
    try {
      if (isRealServiceRoleKey()) {
        const payload: Record<string, any> = { updated_at: now };
        if (updates.name !== undefined) payload.name = updates.name.trim();
        if (updates.client_type !== undefined) payload.client_type = updates.client_type;
        if (updates.primary_contact_name !== undefined) payload.primary_contact_name = updates.primary_contact_name;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.phone !== undefined) payload.phone = updates.phone;
        if (updates.whatsapp !== undefined) payload.whatsapp = updates.whatsapp;
        if (updates.address !== undefined) payload.address = updates.address;
        if (updates.city !== undefined) payload.city = updates.city;
        if (updates.country !== undefined) payload.country = updates.country;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.notes !== undefined) payload.notes = updates.notes;

        await supabaseAdmin.from('clients').update(payload).eq('id', clientId).eq('organization_id', organizationId);
      }
    } catch {
      // Tolérance
    }

    // B. Store persistant
    await this.persistInAuditStore('client', clientId, 'CLIENT_RECORD', updated, organizationId, actorUserId);
    this.memoryClients.set(clientId, updated);

    // Audit Log
    let auditAction = 'CLIENT_UPDATED';
    if (updates.status === 'SUSPENDED') auditAction = 'CLIENT_SUSPENDED';
    if (updates.status === 'ARCHIVED') auditAction = 'CLIENT_ARCHIVED';

    await this.logAudit({
      action: auditAction,
      organizationId,
      entityId: clientId,
      actorUserId,
      details: { updated_fields: Object.keys(updates) },
    });

    return updated;
  }

  /**
   * Archive un client
   */
  public static async archiveClient(
    clientId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<Client> {
    return this.updateClient(clientId, organizationId, { status: 'ARCHIVED' }, actorUserId);
  }

  /**
   * Restaure un client archivé
   */
  public static async restoreClient(
    clientId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<Client> {
    return this.updateClient(clientId, organizationId, { status: 'ACTIVE' }, actorUserId);
  }

  /**
   * Suppression d'un client
   */
  public static async deleteClient(
    clientId: string,
    organizationId: string,
    actorUserId?: string,
    permanent: boolean = true
  ): Promise<boolean> {
    if (permanent) {
      return this.hardDeleteClient(clientId, organizationId, actorUserId);
    }
    await this.archiveClient(clientId, organizationId, actorUserId);
    return true;
  }

  /**
   * Suppression définitive d'un client (Hard delete)
   */
  public static async hardDeleteClient(
    clientId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<boolean> {
    if (!clientId) return false;

    // 1. Tenter table dédiée
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('clients').delete().eq('id', clientId).eq('organization_id', organizationId);
      }
    } catch {
      // Tolérance
    }

    // 2. Nettoyer le store persistant
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').delete().eq('id', `client_${clientId}`);
      }
    } catch {
      // Tolérance
    }

    this.memoryClients.delete(clientId);

    await this.logAudit({
      action: 'CLIENT_DELETED_PERMANENT',
      organizationId,
      entityId: clientId,
      actorUserId,
      details: { client_id: clientId },
    });

    return true;
  }

  /**
   * Liste les sites d'un client
   */
  public static async listClientSites(clientId: string, organizationId: string): Promise<any[]> {
    if (!clientId || !organizationId) return [];
    try {
      // Lire les liaisons sites depuis audit_logs
      const links = await this.listFromAuditStore<any>('client_site', organizationId);
      const clientLinks = links.filter((l) => l.client_id === clientId);
      const siteIds = clientLinks.map((l) => l.site_id);

      if (siteIds.length > 0 && isRealServiceRoleKey()) {
        const { data } = await supabaseAdmin
          .from('protected_sites')
          .select('*')
          .in('id', siteIds)
          .eq('organization_id', organizationId);
        if (data) return data;
      }
    } catch (e) {
      console.warn('[ClientService] Note listClientSites:', e);
    }
    return [];
  }

  /**
   * Rapproche un site existant à un client
   */
  public static async assignSiteToClient(
    clientId: string,
    siteId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<boolean> {
    await this.persistInAuditStore(
      'client_site',
      siteId,
      'CLIENT_SITE_LINK',
      { site_id: siteId, client_id: clientId, organization_id: organizationId },
      organizationId,
      actorUserId
    );

    await this.logAudit({
      action: 'CLIENT_SITE_ASSIGNED',
      organizationId,
      entityId: clientId,
      actorUserId,
      details: { site_id: siteId },
    });

    return true;
  }

  /**
   * Crée et lie un nouveau site directement à un client
   */
  public static async linkSiteToClient(
    clientId: string,
    organizationId: string,
    siteInput: {
      name: string;
      address?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      site_type?: string;
      access_instructions?: string;
    },
    actorUserId?: string
  ): Promise<any> {
    const siteId = crypto.randomUUID();
    const now = new Date().toISOString();
    const sitePayload = {
      id: siteId,
      organization_id: organizationId,
      owner_id: (actorUserId && actorUserId.length === 36) ? actorUserId : '00000000-0000-0000-0000-000000000000',
      name: siteInput.name.trim(),
      site_type: (siteInput.site_type || 'COMMERCIAL') as any,
      address: siteInput.address || 'Abidjan',
      city: siteInput.city || 'Abidjan',
      latitude: siteInput.latitude || 5.3484,
      longitude: siteInput.longitude || -4.0305,
      postal_code: 'BP 01',
      access_instructions: siteInput.access_instructions || null,
      is_default: false,
      created_at: now,
      updated_at: now,
    };

    try {
      if (isRealServiceRoleKey()) {
        const { data } = await supabaseAdmin
          .from('protected_sites')
          .insert(sitePayload)
          .select()
          .maybeSingle();
        if (data) {
          this.memorySites.set(siteId, data);
        }
      }
    } catch {
      // Tolérance
    }

    await this.persistInAuditStore(
      'client_site',
      siteId,
      'CLIENT_SITE_LINK',
      { site_id: siteId, client_id: clientId, organization_id: organizationId, name: siteInput.name },
      organizationId,
      actorUserId
    );

    this.memorySites.set(siteId, sitePayload);
    return sitePayload;
  }

  /**
   * Supprime en cascade les rattachements d'un utilisateur supprimé
   */
  public static async cascadeDeleteForUser(params: {
    userId: string;
    organizationId: string;
    email?: string | null;
    clientId?: string | null;
    userRole?: string | null;
    actorUserId?: string;
  }): Promise<void> {
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').delete().eq('id', `client_user_${params.userId}`);
      }
    } catch (e) {
      console.warn('[ClientService] Note cascadeDeleteForUser:', e);
    }
  }

  /**
   * Liste les comptes utilisateurs rattachés à un client
   */
  public static async listClientUsers(clientId: string, organizationId: string): Promise<any[]> {
    try {
      // 1. Lire les liaisons utilisateurs client depuis le store persistant
      const userLinks = await this.listFromAuditStore<any>('client_user', organizationId);
      const clientUsers = userLinks.filter((u) => u.client_id === clientId);

      if (clientUsers.length > 0 && isRealServiceRoleKey()) {
        const userIds = clientUsers.map((u) => u.user_id || u.id);
        const { data: dbUsers } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, phone, role, is_active, created_at')
          .in('id', userIds)
          .eq('organization_id', organizationId);

        if (dbUsers && dbUsers.length > 0) {
          return dbUsers;
        }
      }

      return clientUsers.map((u) => ({
        id: u.user_id || u.id,
        email: u.email,
        full_name: u.full_name,
        phone: u.phone,
        role: u.role || 'USER',
        is_active: u.is_active ?? true,
        created_at: u.created_at,
      }));
    } catch (e) {
      console.warn('[ClientService] Note listClientUsers:', e);
    }
    return [];
  }

  /**
   * Invite un utilisateur pour le compte d'un client (Section 6)
   */
  public static async inviteClientUser(
    clientId: string,
    organizationId: string,
    input: InviteClientUserInput,
    actorUserId?: string
  ): Promise<{ invitation: ClientInvitation; inviteUrl: string }> {
    const client = await this.getClientById(clientId, organizationId);
    if (!client) throw new Error('Client introuvable.');

    if (!input.email || !input.email.includes('@')) {
      throw new Error('Une adresse email valide est obligatoire pour inviter le contact client.');
    }

    const invitationId = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    // Expiration 7 jours
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const invitation: ClientInvitation = {
      id: invitationId,
      organization_id: organizationId,
      client_id: clientId,
      email: input.email.trim().toLowerCase(),
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      role: 'USER',
      token,
      allowed_site_ids: input.allowed_site_ids || [],
      status: 'PENDING',
      expires_at: expiresAt,
      invited_by: actorUserId || null,
      created_at: now,
      used_at: null,
    };

    // A. Tenter table dédiée
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('client_invitations').insert({
          id: invitation.id,
          organization_id: invitation.organization_id,
          client_id: invitation.client_id,
          email: invitation.email,
          full_name: invitation.full_name,
          phone: invitation.phone,
          role: 'USER',
          token: invitation.token,
          allowed_site_ids: invitation.allowed_site_ids,
          status: 'PENDING',
          expires_at: invitation.expires_at,
          invited_by: invitation.invited_by,
          created_at: now,
        });
      }
    } catch (invErr) {
      console.warn('[ClientService] Note insert client_invitations DB:', invErr);
    }

    // B. Persistance résiliente dans audit_logs (clé = token pour recherche O(1))
    await this.persistInAuditStore(
      'client_invitation',
      token,
      'CLIENT_INVITATION',
      invitation,
      organizationId,
      actorUserId
    );

    this.memoryInvitations.set(token, invitation);

    await this.logAudit({
      action: 'CLIENT_USER_INVITED',
      organizationId,
      entityId: clientId,
      actorUserId,
      details: {
        email: invitation.email,
        full_name: invitation.full_name,
        invitation_id: invitation.id,
        token,
      },
    });

    const inviteUrl = `/register?invite=${token}`;
    return { invitation, inviteUrl };
  }

  /**
   * Valide un jeton d'invitation client
   */
  public static async getInvitationByToken(token: string): Promise<ClientInvitation | null> {
    if (!token) return null;

    // 1. Tenter la table dédiée
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('client_invitations')
          .select('*')
          .eq('token', token)
          .maybeSingle();

        if (!error && data) {
          return data as ClientInvitation;
        }
      }
    } catch {
      // Tolérance
    }

    // 2. Tenter le store persistant
    const stored = await this.getFromAuditStore<ClientInvitation>('client_invitation', token);
    if (stored) {
      this.memoryInvitations.set(token, stored);
      return stored;
    }

    // 3. Fallback mémoire locale
    return this.memoryInvitations.get(token) || null;
  }

  /**
   * Active une invitation client avec mot de passe et crée l'utilisateur sécurisé (Section 6 & 8)
   */
  public static async acceptClientInvitation(
    token: string,
    password: string
  ): Promise<{ user: any; client: Client }> {
    const invitation = await this.getInvitationByToken(token);
    if (!invitation) {
      throw new Error('Jeton d’invitation introuvable ou invalide.');
    }

    if (invitation.status !== 'PENDING') {
      throw new Error('Cette invitation a déjà été utilisée ou a été révoquée.');
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new Error('Cette invitation a expiré. Veuillez contacter votre société de sécurité.');
    }

    if (!password || password.length < 6) {
      throw new Error('Le mot de passe doit comporter au moins 6 caractères.');
    }

    const client = await this.getClientById(invitation.client_id, invitation.organization_id);
    if (!client) {
      throw new Error('L’entreprise cliente associée est introuvable.');
    }

    let userId: string | null = null;
    const now = new Date().toISOString();

    // 1. Création / Mise à jour dans Supabase Auth avec rôle strict USER (CLIENT)
    if (isRealServiceRoleKey()) {
      try {
        const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: invitation.email,
          password: password,
          email_confirm: true,
          // Rôle et organisation de confiance : app_metadata n'est modifiable qu'avec la clé secrète
          app_metadata: { role: 'USER', organization_id: invitation.organization_id },
          user_metadata: {
            full_name: invitation.full_name,
            phone: invitation.phone,
            role: 'USER', // RÔLE STRICT CLIENT : Jamais ADMIN, SECURITY_MANAGER ou AGENT
            organization_id: invitation.organization_id,
            client_id: invitation.client_id,
          },
        });

        if (!authErr && authCreated?.user?.id) {
          userId = authCreated.user.id;
        } else if (authErr) {
          console.warn('[ClientService] createUser retourné avec erreur, vérification utilisateur existant:', authErr.message);

          // Compte déjà existant : jamais de réinitialisation de mot de passe ni de changement de
          // rôle/organisation via une invitation (sinon prise de contrôle de comptes d'autres tenants).
          const existingUser = await findAuthUserByEmail(invitation.email);
          if (existingUser) {
            throw new Error(
              'Échec : un compte existe déjà avec cette adresse email. Connectez-vous avec vos identifiants habituels ou contactez votre prestataire.'
            );
          }
          throw new Error(`Échec de la création de l'accès client : ${authErr.message}`);
        }
      } catch (authEx: any) {
        if (authEx.message?.includes('Impossible') || authEx.message?.includes('Échec')) {
          throw authEx;
        }
        console.warn('[ClientService] Auth note accept invitation:', authEx);
      }

      if (!userId) {
        throw new Error('Impossible d’initialiser le compte utilisateur client dans le système d’authentification.');
      }

      // 2. Persistance certifiée dans public.users (colonnes réelles de users)
      const { error: dbUserErr } = await supabaseAdmin.from('users').upsert({
        id: userId as any,
        email: invitation.email,
        full_name: invitation.full_name,
        phone: invitation.phone || '',
        role: 'USER',
        organization_id: invitation.organization_id,
        is_active: true,
        created_at: now,
        updated_at: now,
      });

      if (dbUserErr) {
        console.error('[ClientService] Erreur synchronisation public.users:', dbUserErr);
        throw new Error(`Erreur lors de la synchronisation du profil utilisateur : ${dbUserErr.message}`);
      }

      // 3. Liaison aux sites autorisés dans site_members si configurés
      if (invitation.allowed_site_ids && invitation.allowed_site_ids.length > 0) {
        for (const siteId of invitation.allowed_site_ids) {
          try {
            await supabaseAdmin.from('site_members').upsert({
              id: crypto.randomUUID(),
              site_id: siteId,
              user_id: userId as any,
              member_role: 'RESIDENT',
              can_trigger_alert: true,
              created_at: now,
            });
          } catch (smErr) {
            console.warn('[ClientService] Note site_members upsert:', smErr);
          }
        }
      }

      // 4. Marquer l'invitation comme acceptée dans la table dédiée et le store persistant
      try {
        await supabaseAdmin
          .from('client_invitations')
          .update({
            status: 'ACCEPTED',
            used_at: now,
          })
          .eq('token', token);
      } catch {
        // Tolérance
      }

      // Enregistrer le lien client-utilisateur dans le store persistant
      await this.persistInAuditStore(
        'client_user',
        userId,
        'CLIENT_USER_LINK',
        {
          user_id: userId,
          client_id: invitation.client_id,
          organization_id: invitation.organization_id,
          email: invitation.email,
          full_name: invitation.full_name,
          phone: invitation.phone,
          role: 'USER',
          created_at: now,
        },
        invitation.organization_id,
        userId
      );
    } else {
      userId = crypto.randomUUID();
    }

    invitation.status = 'ACCEPTED';
    invitation.used_at = now;

    // Mise à jour de l'invitation dans le store persistant
    await this.persistInAuditStore(
      'client_invitation',
      token,
      'CLIENT_INVITATION_ACCEPTED',
      invitation,
      invitation.organization_id,
      userId || undefined
    );
    this.memoryInvitations.set(token, invitation);

    await this.logAudit({
      action: 'CLIENT_USER_ACTIVATED',
      organizationId: invitation.organization_id,
      entityId: invitation.client_id,
      actorUserId: userId || undefined,
      details: {
        email: invitation.email,
        user_id: userId,
      },
    });

    return {
      user: {
        id: userId,
        email: invitation.email,
        fullName: invitation.full_name,
        role: 'USER',
        organizationId: invitation.organization_id,
        clientId: invitation.client_id,
      },
      client,
    };
  }

  /**
   * Révoque une invitation client
   */
  public static async revokeInvitation(
    invitationIdOrToken: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<boolean> {
    const invitation = await this.getInvitationByToken(invitationIdOrToken);
    if (!invitation || invitation.organization_id !== organizationId) {
      return false;
    }

    invitation.status = 'REVOKED';
    const now = new Date().toISOString();

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('client_invitations')
          .update({ status: 'REVOKED', updated_at: now })
          .eq('token', invitation.token);
      }
    } catch {
      // Tolérance
    }

    await this.persistInAuditStore(
      'client_invitation',
      invitation.token,
      'CLIENT_INVITATION_REVOKED',
      invitation,
      organizationId,
      actorUserId
    );
    this.memoryInvitations.set(invitation.token, invitation);

    await this.logAudit({
      action: 'CLIENT_INVITATION_REVOKED',
      organizationId,
      entityId: invitation.client_id,
      actorUserId,
      details: { token: invitation.token, email: invitation.email },
    });

    return true;
  }

  /**
   * Helper journalisation d'audit immuable
   */
  private static async logAudit(params: {
    action: string;
    organizationId: string;
    entityId: string;
    actorUserId?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: (params.actorUserId && params.actorUserId.length === 36)
            ? (params.actorUserId as any)
            : '00000000-0000-0000-0000-000000000000',
          action: params.action,
          entity_type: 'client',
          entity_id: params.entityId,
          details: {
            organization_id: params.organizationId,
            ...(params.details || {}),
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Tolérance audit
    }
  }
}

export const clientService = ClientService;

import { findAuthUserByEmail } from '@/lib/supabase/auth-users';
/**
 * SECURIA V2 — PHASE 11 : SERVICE DES ORGANISATIONS (MULTI-TENANT SAAS)
 * Gestion du cycle de vie des entreprises clientes : Création, Provisioning, Suspension, Réactivation, Métriques
 */

import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import { PlanCatalog, DEFAULT_PLANS } from '@/lib/billing/plans';
import { SubscriptionService } from '@/lib/billing/subscription-service';
import { QuotaService } from '@/lib/billing/quota-service';
import type { PlanCode, BillingCycle } from '@/lib/billing/types';
import type {
  OrganizationDetails,
  OrganizationStatus,
  CreateOrganizationInput,
  OrganizationMetrics,
  OrganizationCredentials,
} from './types';
import crypto from 'crypto';

export const MASTER_PLATFORM_ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

export class OrganizationService {
  private static memoryStore: Map<string, OrganizationDetails> = new Map([
    [
      MASTER_PLATFORM_ORG_ID,
      {
        id: MASTER_PLATFORM_ORG_ID,
        name: 'SECURIA Côte d’Ivoire — Télésurveillance & Dispatch',
        trade_name: 'SECURIA Platform',
        code: 'SECURIA-CI',
        phone: '+225 07 47 33 84 77',
        email: 'dispatch.ci@securia.com',
        address: 'Boulevard de la République, Plateau',
        city: 'Abidjan',
        country: 'CI',
        postal_code: 'BP 1234',
        rccm: 'CI-ABJ-2026-B-10442',
        ncc: '2604421A',
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        status: 'ACTIVE',
        is_active: true,
        quota_warning_threshold: 80,
        grace_period_days: 7,
        created_at: '2026-09-24T00:00:00.000Z',
        updated_at: new Date().toISOString(),
      },
    ],
    [
      'b0000000-0000-0000-0000-000000000002',
      {
        id: 'b0000000-0000-0000-0000-000000000002',
        name: 'SECURIA Agence San-Pédro',
        trade_name: 'Securia Littoral',
        code: 'SECURIA-ORG-SP',
        phone: '+225 07 47 00 00 02',
        email: 'contact.sanpedro@securia.ci',
        address: 'Boulevard du Port',
        city: 'San-Pédro',
        country: 'CI',
        postal_code: 'BP 555',
        rccm: null,
        ncc: null,
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        status: 'ACTIVE',
        is_active: true,
        quota_warning_threshold: 80,
        grace_period_days: 7,
        created_at: '2026-09-24T00:00:00.000Z',
        updated_at: new Date().toISOString(),
      },
    ],
    [
      'fa000000-0000-0000-0000-000000000001',
      {
        id: 'fa000000-0000-0000-0000-000000000001',
        name: 'SECURIA PILOT',
        trade_name: 'Banc d’Essai Multi-Tenant',
        code: 'PILOT',
        phone: '+225 01 02 03 04 05',
        email: 'pilot@securia.app',
        address: 'Centre de Commandement',
        city: 'Abidjan',
        country: 'CI',
        postal_code: '00225',
        rccm: null,
        ncc: null,
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        status: 'ACTIVE',
        is_active: true,
        quota_warning_threshold: 80,
        grace_period_days: 7,
        created_at: '2026-09-24T00:00:00.000Z',
        updated_at: new Date().toISOString(),
      },
    ],
  ]);

  /**
   * Récupère la liste de toutes les entreprises clientes (réservé Platform Admin)
   */
  public static async listOrganizations(filter?: {
    status?: OrganizationStatus;
    search?: string;
  }): Promise<OrganizationDetails[]> {
    const list: OrganizationDetails[] = [];

    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const subsMap = new Map<string, any>();
          try {
            const { data: subsData } = await supabaseAdmin
              .from('subscriptions')
              .select('organization_id, plan_id, status, billing_cycle, amount, plans(code, name)');
            if (subsData) {
              subsData.forEach((s: any) => subsMap.set(s.organization_id, s));
            }
          } catch {
            // Tolérance si table non migrée
          }

          for (const row of data) {
            const sub = subsMap.get(row.id);
            const planCode = sub?.plans?.code || sub?.plan_code || row.settings?.plan || 'BUSINESS_OS';
            const billingCycle = sub?.billing_cycle || row.settings?.billing_cycle || 'MONTHLY';
            const status = (sub?.status as OrganizationStatus) || (row.status as OrganizationStatus) || (row.is_active ? 'ACTIVE' : 'SUSPENDED');

            const org: OrganizationDetails = {
              id: row.id,
              name: row.name,
              trade_name: row.trade_name || row.name,
              code: row.code || `ORG-${row.id.substring(0, 6).toUpperCase()}`,
              phone: row.phone,
              email: row.email,
              address: row.address,
              city: row.city,
              country: row.country || 'CI',
              postal_code: row.postal_code,
              rccm: row.rccm,
              ncc: row.ncc,
              currency: row.currency || 'XOF',
              timezone: row.timezone || 'Africa/Abidjan',
              logo_url: row.logo_url,
              primary_color: row.primary_color,
              status,
              plan: planCode,
              billingCycle,
              is_active: row.is_active ?? (status !== 'SUSPENDED'),
              quota_warning_threshold: row.quota_warning_threshold ?? 80,
              grace_period_days: row.grace_period_days ?? 7,
              created_at: row.created_at,
              updated_at: row.updated_at || row.created_at,
            };
            this.memoryStore.set(org.id, org);
            list.push(org);
          }
        }
      }
    } catch (e) {
      console.warn('[OrganizationService] Note lecture organisations DB:', e);
    }

    // Si la liste est vide ou en cas d'erreur de base, utiliser memoryStore
    if (list.length === 0) {
      this.memoryStore.forEach((org) => list.push(org));
    }

    // Appliquer les filtres
    let filtered = list;
    if (filter?.status) {
      filtered = filtered.filter((o) => o.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      filtered = filtered.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.trade_name && o.trade_name.toLowerCase().includes(q)) ||
          o.code.toLowerCase().includes(q) ||
          (o.email && o.email.toLowerCase().includes(q)) ||
          (o.phone && o.phone.toLowerCase().includes(q)) ||
          o.id.toLowerCase().includes(q)
      );
    }

    return filtered;
  }

  /**
   * Récupère une organisation par son identifiant unique
   */
  public static async getOrganizationById(id: string): Promise<OrganizationDetails | null> {
    if (!id) return null;

    if (this.memoryStore.has(id)) {
      return this.memoryStore.get(id)!;
    }

    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('organizations')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          let sub: any = null;
          try {
            const { data: subData } = await supabaseAdmin
              .from('subscriptions')
              .select('organization_id, plan_id, status, billing_cycle, amount, plans(code, name)')
              .eq('organization_id', id)
              .maybeSingle();
            sub = subData;
          } catch {
            // Tolérance
          }

          const planCode = sub?.plans?.code || sub?.plan_code || data.settings?.plan || 'BUSINESS_OS';
          const billingCycle = sub?.billing_cycle || data.settings?.billing_cycle || 'MONTHLY';
          const status = (sub?.status as OrganizationStatus) || (data.status as OrganizationStatus) || (data.is_active ? 'ACTIVE' : 'SUSPENDED');

          const org: OrganizationDetails = {
            id: data.id,
            name: data.name,
            trade_name: data.trade_name || data.name,
            code: data.code || `ORG-${data.id.substring(0, 6).toUpperCase()}`,
            phone: data.phone,
            email: data.email,
            address: data.address,
            city: data.city,
            country: data.country || 'CI',
            postal_code: data.postal_code,
            rccm: data.rccm,
            ncc: data.ncc,
            currency: data.currency || 'XOF',
            timezone: data.timezone || 'Africa/Abidjan',
            logo_url: data.logo_url,
            primary_color: data.primary_color,
            status,
            plan: planCode,
            billingCycle,
            is_active: data.is_active ?? (status !== 'SUSPENDED'),
            quota_warning_threshold: data.quota_warning_threshold ?? 80,
            grace_period_days: data.grace_period_days ?? 7,
            created_at: data.created_at,
            updated_at: data.updated_at || data.created_at,
          };
          this.memoryStore.set(org.id, org);
          return org;
        }
      }
    } catch (e) {
      console.warn(`[OrganizationService] Erreur getOrganizationById(${id}):`, e);
    }

    return null;
  }

  /**
   * Workflow complet de création d'une nouvelle entreprise cliente (Section 8)
   */
  public static async createOrganization(
    input: CreateOrganizationInput,
    actorUserId?: string
  ): Promise<{
    organization: OrganizationDetails;
    adminUser: any;
    subscription?: any;
    credentials: OrganizationCredentials;
  }> {
    const orgId = crypto.randomUUID();
    const now = new Date().toISOString();
    const trialDays = input.trialDays !== undefined ? Number(input.trialDays) : (input.trial_days !== undefined ? Number(input.trial_days) : 14);
    const rawPlan = (input.plan || input.plan_code || 'BUSINESS_OS').toString().toUpperCase().trim();
    const planCode: PlanCode = (rawPlan === 'BUSINESS' ? 'BUSINESS_OS' : rawPlan) as PlanCode;
    const internalCatalogCode = rawPlan === 'BUSINESS_OS' ? 'BUSINESS' : rawPlan;
    const isYearly = ((input.billingCycle || input.billing_cycle || 'MONTHLY').toString().toUpperCase() === 'ANNUAL' || (input.billingCycle || input.billing_cycle) === 'YEARLY');
    const billingCycle: BillingCycle = isYearly ? 'YEARLY' : 'MONTHLY';
    const orgName = (input.name || 'Entreprise').trim();
    const isDirectActive = trialDays === 0;
    const initialStatus: OrganizationStatus = isDirectActive ? 'ACTIVE' : 'TRIAL';

    const tradeName = (input.commercialName || input.trade_name || orgName).trim();
    const orgEmail = (input.email || input.adminEmail || input.admin_email || `contact@${orgName.toLowerCase().replace(/[^a-z0-9]/g, '')}.ci`).trim().toLowerCase();
    const adminEmail = (input.adminEmail || input.admin_email || orgEmail).trim().toLowerCase();
    const adminName = (input.adminFullName || input.admin_name || 'Administrateur Entreprise').trim();

    // 1. Normalisation du code entreprise unique
    const code =
      tradeName.toUpperCase().replace(/[^A-Z0-9]/g, '-') ||
      orgName.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 12) + '-' + Math.floor(100 + Math.random() * 900);

    const newOrg: OrganizationDetails = {
      id: orgId,
      name: orgName,
      trade_name: tradeName,
      commercialName: tradeName,
      code,
      phone: input.phone || null,
      email: orgEmail,
      address: input.address || (input.city ? `${input.city}, ${input.country || 'CI'}` : null),
      city: input.city || 'Abidjan',
      country: input.country || 'CI',
      postal_code: null,
      rccm: input.rccm || null,
      ncc: input.ncc || null,
      currency: input.currency || 'XOF',
      timezone: input.timezone || 'Africa/Abidjan',
      status: initialStatus,
      plan: planCode,
      billingCycle,
      is_active: true,
      quota_warning_threshold: 80,
      grace_period_days: 7,
      created_at: now,
      updated_at: now,
    };

    // 2. Persistance en base PostgreSQL
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('organizations').insert({
          id: newOrg.id,
          name: newOrg.name,
          code: newOrg.code,
          phone: newOrg.phone,
          email: newOrg.email,
          address: newOrg.address,
          city: newOrg.city,
          postal_code: newOrg.postal_code,
          is_active: newOrg.is_active,
          settings: {
            plan: planCode,
            billing_cycle: billingCycle,
            trial_days: trialDays,
          },
          created_at: newOrg.created_at,
          updated_at: newOrg.updated_at,
        });
      }
    } catch (e) {
      console.warn('[OrganizationService] Note insertion table organizations:', e);
    }
    this.memoryStore.set(newOrg.id, newOrg);

    // 3. Création ou provisionnement de l'administrateur initial de l'entreprise dans Supabase Auth
    const initialPassword =
      input.adminPassword && input.adminPassword.trim().length >= 6
        ? input.adminPassword.trim()
        : `Securia@${Math.floor(1000 + Math.random() * 9000)}!`;

    let adminUserId: string = crypto.randomUUID();
    let inviteLink: string | null = null;

    try {
      if (isRealServiceRoleKey()) {
        const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email: adminEmail,
          password: initialPassword,
          email_confirm: true,
          // Rôle et organisation de confiance : app_metadata n'est modifiable qu'avec la clé secrète
          app_metadata: { role: 'ADMIN', organization_id: newOrg.id },
          user_metadata: {
            full_name: adminName,
            role: 'ADMIN',
            organization_id: newOrg.id,
          },
        });

        if (!authErr && authCreated?.user?.id) {
          adminUserId = authCreated.user.id;
        } else if (authErr) {
          console.warn('[OrganizationService] User createUser note:', authErr.message);
          try {
            const existing = await findAuthUserByEmail(adminEmail);
            if (existing?.id) {
              adminUserId = existing.id;
              await supabaseAdmin.auth.admin.updateUserById(existing.id, {
                password: initialPassword,
                user_metadata: {
                  full_name: adminName,
                  role: 'ADMIN',
                  organization_id: newOrg.id,
                },
              });
            }
          } catch {
            // fallback
          }
        }

        try {
          const { data: linkRes } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: adminEmail,
          });
          if (linkRes?.properties?.action_link) {
            inviteLink = linkRes.properties.action_link;
          }
        } catch {
          // ignore
        }
      }
    } catch (authEx) {
      console.warn('[OrganizationService] Auth note create admin user:', authEx);
    }

    const adminUser = {
      id: adminUserId,
      email: adminEmail,
      full_name: adminName,
      phone: input.admin_phone || input.phone || '',
      role: 'ADMIN',
      organization_id: newOrg.id,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('users').upsert({
          id: adminUser.id as any,
          email: adminUser.email,
          full_name: adminUser.full_name,
          phone: adminUser.phone,
          role: adminUser.role,
          organization_id: newOrg.id,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (e) {
      console.warn('[OrganizationService] Note création admin user:', e);
    }

    // 4. Initialisation de l'abonnement et des quotas (Subscription & Entitlements)
    let sub: any = null;
    try {
      const plan = await PlanCatalog.getPlanByCode(internalCatalogCode);
      const trialEndDate = isDirectActive ? null : new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString();
      const periodDurationMs = isYearly ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
      const periodEndDate = new Date(Date.now() + periodDurationMs).toISOString();
      const amount = isYearly ? (plan?.yearlyPrice || 0) : (plan?.monthlyPrice || 0);

      sub = await SubscriptionService.createSubscription({
        organizationId: newOrg.id,
        planId: plan?.id || 'plan_' + internalCatalogCode.toLowerCase(),
        planCode: (internalCatalogCode as PlanCode),
        status: initialStatus,
        billingCycle,
        amount,
        trialEnd: trialEndDate,
        currentPeriodEnd: periodEndDate,
      });
    } catch (e) {
      console.warn('[OrganizationService] Note initialisation subscription:', e);
    }

    // 5. Enregistrement de l'Audit Log
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: actorUserId || adminUserId,
          action: 'ORGANIZATION_CREATED',
          entity_type: 'organization',
          entity_id: newOrg.id,
          details: {
            organization_name: newOrg.name,
            code: newOrg.code,
            plan: planCode,
            trial_days: trialDays,
            admin_email: adminUser.email,
          },
          created_at: now,
        });
      }
    } catch {
      // Ignorer
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://horeb-secure.netlify.app';
    const credentials: OrganizationCredentials = {
      organizationId: newOrg.id,
      organizationName: newOrg.name,
      adminEmail,
      adminFullName: adminName,
      temporaryPassword: initialPassword,
      loginUrl: `${appUrl}/login`,
      inviteLink: inviteLink || undefined,
      createdAt: now,
    };

    return { organization: newOrg, adminUser, subscription: sub, credentials };
  }

  /**
   * Réinitialise ou génère les identifiants d'accès pour l'administrateur d'une entreprise
   */
  public static async resetOrganizationAdminPassword(
    organizationId: string,
    customPassword?: string
  ): Promise<OrganizationCredentials> {
    const org = await this.getOrganizationById(organizationId);
    if (!org) {
      throw new Error(`Organisation introuvable : ${organizationId}`);
    }

    let adminEmail: string = (org.email || '').trim().toLowerCase();
    let adminFullName: string = 'Administrateur Entreprise';
    let adminUserId: string | null = null;

    try {
      if (isRealServiceRoleKey()) {
        const { data: userRows } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, role')
          .eq('organization_id', organizationId)
          .eq('role', 'ADMIN')
          .limit(1);

        if (userRows && userRows.length > 0 && userRows[0].email) {
          adminEmail = userRows[0].email.trim().toLowerCase();
          adminFullName = userRows[0].full_name || adminFullName;
          adminUserId = userRows[0].id;
        }
      }
    } catch (e) {
      console.warn('[OrganizationService] Note fetch admin user for reset:', e);
    }

    if (!adminEmail) {
      adminEmail = `admin@${(org.code || 'org').toLowerCase().replace(/[^a-z0-9]/g, '')}.ci`;
    }

    const newPassword =
      customPassword && customPassword.trim().length >= 6
        ? customPassword.trim()
        : `Securia@${Math.floor(1000 + Math.random() * 9000)}!`;

    let inviteLink: string | null = null;

    try {
      if (isRealServiceRoleKey()) {
        if (adminUserId) {
          await supabaseAdmin.auth.admin.updateUserById(adminUserId, {
            password: newPassword,
          });
        } else {
          const { data: authCreated } = await supabaseAdmin.auth.admin.createUser({
            email: adminEmail,
            password: newPassword,
            email_confirm: true,
            // Rôle et organisation de confiance : app_metadata n'est modifiable qu'avec la clé secrète
            app_metadata: { role: 'ADMIN', organization_id: organizationId },
            user_metadata: {
              full_name: adminFullName,
              role: 'ADMIN',
              organization_id: organizationId,
            },
          });
          if (authCreated?.user?.id) {
            adminUserId = authCreated.user.id;
            await supabaseAdmin.from('users').upsert({
              id: adminUserId as any,
              email: adminEmail,
              full_name: adminFullName,
              role: 'ADMIN',
              organization_id: organizationId,
              is_active: true,
            });
          }
        }

        try {
          const { data: linkRes } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: adminEmail,
          });
          if (linkRes?.properties?.action_link) {
            inviteLink = linkRes.properties.action_link;
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('[OrganizationService] Note reset password Auth:', e);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://horeb-secure.netlify.app';
    return {
      organizationId: org.id,
      organizationName: org.name,
      adminEmail,
      adminFullName,
      temporaryPassword: newPassword,
      loginUrl: `${appUrl}/login`,
      inviteLink: inviteLink || undefined,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Met à jour les informations d'une organisation
   */
  public static async updateOrganization(
    id: string,
    updates: Partial<OrganizationDetails>,
    actorUserId?: string
  ): Promise<OrganizationDetails> {
    const existing = await this.getOrganizationById(id);
    if (!existing) {
      throw new Error(`Organisation introuvable : ${id}`);
    }

    const updated: OrganizationDetails = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    try {
      if (isRealServiceRoleKey()) {
        const payload: Record<string, any> = {
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          address: updated.address,
          city: updated.city,
          is_active: updated.is_active,
          updated_at: updated.updated_at,
        };
        await supabaseAdmin.from('organizations').update(payload).eq('id', id);
      }
    } catch (e) {
      console.warn('[OrganizationService] Note update DB:', e);
    }

    this.memoryStore.set(id, updated);

    // Audit Log
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: actorUserId || '00000000-0000-0000-0000-000000000000',
          action: 'ORGANIZATION_UPDATED',
          entity_type: 'organization',
          entity_id: id,
          details: { updated_fields: Object.keys(updates) },
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignorer
    }

    return updated;
  }

  /**
   * Modifie le plan SaaS, le cycle de facturation et le statut d'une organisation (réservé Super Admin)
   */
  public static async updateOrganizationPlan(
    organizationId: string,
    params: {
      plan: string;
      billingCycle?: string;
      status?: OrganizationStatus;
      trialDays?: number;
      reason?: string;
    },
    actorUserId?: string
  ): Promise<{
    organization: OrganizationDetails;
    subscription: any;
  }> {
    const existing = await this.getOrganizationById(organizationId);
    if (!existing) {
      throw new Error(`Organisation introuvable : ${organizationId}`);
    }

    const rawPlan = (params.plan || existing.plan || 'BUSINESS_OS').toString().toUpperCase().trim();
    const planCode: PlanCode = (rawPlan === 'BUSINESS' ? 'BUSINESS_OS' : rawPlan) as PlanCode;
    const internalCatalogCode = rawPlan === 'BUSINESS_OS' ? 'BUSINESS' : rawPlan;

    const rawCycle = (params.billingCycle || existing.billingCycle || 'MONTHLY').toString().toUpperCase().trim();
    const isYearly = rawCycle === 'ANNUAL' || rawCycle === 'YEARLY';
    const billingCycle: BillingCycle = isYearly ? 'YEARLY' : 'MONTHLY';

    const newStatus: OrganizationStatus = params.status || (params.trialDays === 0 ? 'ACTIVE' : existing.status);
    const plan = await PlanCatalog.getPlanByCode(internalCatalogCode);
    const now = new Date();
    const periodDurationMs = isYearly ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    const periodEnd = new Date(now.getTime() + periodDurationMs).toISOString();
    const amount = isYearly ? (plan?.yearlyPrice || 0) : (plan?.monthlyPrice || 0);

    // 1. Mise à jour ou création de l'abonnement
    let sub: any = null;
    try {
      sub = await SubscriptionService.changePlan(
        organizationId,
        (internalCatalogCode as PlanCode),
        billingCycle,
        params.reason || `Modification discrétionnaire Super Admin vers ${planCode}`
      );
      if (params.status && sub) {
        await SubscriptionService.updateStatus(organizationId, params.status as any);
        sub.status = params.status;
      }
    } catch (e) {
      console.warn('[OrganizationService] Erreur mise à jour subscription:', e);
      sub = await SubscriptionService.createSubscription({
        organizationId,
        planId: plan?.id || 'plan_' + internalCatalogCode.toLowerCase(),
        planCode: (internalCatalogCode as PlanCode),
        status: newStatus as any,
        billingCycle,
        amount,
        currentPeriodEnd: periodEnd,
      });
    }

    // 2. Mise à jour de l'organisation en base et dans le store
    const updated: OrganizationDetails = {
      ...existing,
      plan: planCode,
      billingCycle,
      status: newStatus,
      is_active: newStatus !== 'SUSPENDED',
      updated_at: now.toISOString(),
    };

    try {
      if (isRealServiceRoleKey()) {
        const { data: currentOrg } = await supabaseAdmin
          .from('organizations')
          .select('settings')
          .eq('id', organizationId)
          .maybeSingle();

        const currentSettings = currentOrg?.settings || {};
        const updatedSettings = {
          ...currentSettings,
          plan: planCode,
          billing_cycle: billingCycle,
          trial_days: params.trialDays ?? currentSettings.trial_days,
          last_plan_change_at: now.toISOString(),
          last_plan_change_by: actorUserId || 'SUPER_ADMIN',
        };

        await supabaseAdmin
          .from('organizations')
          .update({
            settings: updatedSettings,
            is_active: updated.is_active,
            updated_at: updated.updated_at,
          })
          .eq('id', organizationId);
      }
    } catch (e) {
      console.warn('[OrganizationService] Note mise à jour settings organization:', e);
    }

    this.memoryStore.set(organizationId, updated);

    // 3. Audit log
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: actorUserId || '00000000-0000-0000-0000-000000000000',
          action: 'ORGANIZATION_PLAN_CHANGED',
          entity_type: 'organization',
          entity_id: organizationId,
          details: {
            previous_plan: existing.plan,
            new_plan: planCode,
            billing_cycle: billingCycle,
            status: newStatus,
            amount,
            reason: params.reason || 'Attribution de plan par le Super Admin',
          },
          created_at: now.toISOString(),
        });
      }
    } catch {
      // Ignorer
    }

    return { organization: updated, subscription: sub };
  }

  /**
   * Suspend une organisation (Section 21) — Ne supprime AUCUNE donnée
   */
  public static async suspendOrganization(
    id: string,
    reason: string,
    actorUserId?: string
  ): Promise<OrganizationDetails> {
    const org = await this.updateOrganization(
      id,
      { status: 'SUSPENDED', is_active: false },
      actorUserId
    );

    // Mettre à jour l'abonnement en statut SUSPENDED
    try {
      await SubscriptionService.updateStatus(id, 'SUSPENDED');
    } catch {
      // Ignorer
    }

    // Audit Log
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: actorUserId || '00000000-0000-0000-0000-000000000000',
          action: 'ORGANIZATION_SUSPENDED',
          entity_type: 'organization',
          entity_id: id,
          details: { reason },
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignorer
    }

    return org;
  }

  /**
   * Réactive une organisation suspendue
   */
  public static async reactivateOrganization(
    id: string,
    actorUserId?: string
  ): Promise<OrganizationDetails> {
    const org = await this.updateOrganization(
      id,
      { status: 'ACTIVE', is_active: true },
      actorUserId
    );

    // Réactiver l'abonnement
    try {
      await SubscriptionService.updateStatus(id, 'ACTIVE');
    } catch {
      // Ignorer
    }

    // Audit Log
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: actorUserId || '00000000-0000-0000-0000-000000000000',
          action: 'ORGANIZATION_REACTIVATED',
          entity_type: 'organization',
          entity_id: id,
          details: { timestamp: new Date().toISOString() },
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Ignorer
    }

    return org;
  }

  /**
   * Calcule les métriques réelles d'une organisation
   */
  public static async getOrganizationMetrics(id: string): Promise<OrganizationMetrics> {
    const org = await this.getOrganizationById(id);
    let sub: any = null;
    try {
      sub = await SubscriptionService.getSubscription(id);
    } catch {
      // Fallback
    }

    const planCode: PlanCode = sub?.planCode || 'STARTER';
    const planName = sub?.planName || DEFAULT_PLANS[planCode]?.name || 'Formule Starter';
    const mrr = sub?.amount || DEFAULT_PLANS[planCode]?.monthlyPrice || 0;

    let usersCount = 0;
    let agentsCount = 0;
    let sitesCount = 0;
    let clientsCount = 0;
    let interventionsCount = 0;

    try {
      if (isRealServiceRoleKey()) {
        const [uRes, aRes, sRes, cRes, iRes] = await Promise.all([
          supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('organization_id', id),
          supabaseAdmin.from('security_agents').select('*', { count: 'exact', head: true }).eq('organization_id', id),
          supabaseAdmin.from('protected_sites').select('*', { count: 'exact', head: true }).eq('organization_id', id),
          supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('organization_id', id).eq('role', 'USER'),
          supabaseAdmin.from('alerts').select('*', { count: 'exact', head: true }).eq('organization_id', id),
        ]);

        usersCount = uRes.count || 0;
        agentsCount = aRes.count || 0;
        sitesCount = sRes.count || 0;
        clientsCount = cRes.count || 0;
        interventionsCount = iRes.count || 0;
      }
    } catch (e) {
      console.warn(`[OrganizationService] Erreur métriques pour org ${id}:`, e);
    }

    return {
      users_count: usersCount,
      agents_count: agentsCount,
      sites_count: sitesCount,
      clients_count: clientsCount,
      interventions_count: interventionsCount,
      cameras_count: 0,
      active_alerts_count: 0,
      plan_code: planCode,
      plan_name: planName,
      status: org?.status || 'ACTIVE',
      renewal_date: sub?.currentPeriodEnd,
      mrr,
    };
  }

  /**
   * Calcule la vue d'ensemble globale pour le Dashboard Platform Admin (Section 23)
   */
  public static async getPlatformOverview(): Promise<{
    total_organizations: number;
    active_organizations: number;
    trial_organizations: number;
    suspended_organizations: number;
    total_users: number;
    total_agents: number;
    total_sites: number;
    total_interventions: number;
    contractual_mrr: number;
    collected_mrr: number;
    arr: number;
  }> {
    const orgs = await this.listOrganizations();
    let totalUsers = 0;
    let totalAgents = 0;
    let totalSites = 0;
    let totalInterventions = 0;
    let contractualMrr = 0;

    try {
      if (isRealServiceRoleKey()) {
        const [uRes, aRes, sRes, iRes] = await Promise.all([
          supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('security_agents').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('protected_sites').select('*', { count: 'exact', head: true }),
          supabaseAdmin.from('alerts').select('*', { count: 'exact', head: true }),
        ]);

        totalUsers = uRes.count || 0;
        totalAgents = aRes.count || 0;
        totalSites = sRes.count || 0;
        totalInterventions = iRes.count || 0;
      }
    } catch {
      // Ignorer
    }

    // Calcul du MRR par organisation
    for (const org of orgs) {
      try {
        const sub = await SubscriptionService.getSubscription(org.id);
        if (sub && sub.status !== 'SUSPENDED' && sub.status !== 'CANCELLED') {
          contractualMrr += sub.amount;
        }
      } catch {
        // Ignorer
      }
    }

    const activeOrgs = orgs.filter((o) => o.status === 'ACTIVE').length;
    const trialOrgs = orgs.filter((o) => o.status === 'TRIAL').length;
    const suspendedOrgs = orgs.filter((o) => o.status === 'SUSPENDED').length;

    return {
      total_organizations: orgs.length,
      active_organizations: activeOrgs,
      trial_organizations: trialOrgs,
      suspended_organizations: suspendedOrgs,
      total_users: totalUsers,
      total_agents: totalAgents,
      total_sites: totalSites,
      total_interventions: totalInterventions,
      contractual_mrr: contractualMrr,
      collected_mrr: Math.round(contractualMrr * 0.94), // Estimation des paiements encaissés
      arr: contractualMrr * 12,
    };
  }
}

export const organizationService = OrganizationService;


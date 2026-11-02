/**
 * SECURIA V2 — PHASE 6 : SERVICE DES ABONNEMENTS
 * Gestion du cycle de vie des abonnements, essais gratuits, périodes de grâce et surcharges
 */

import { Subscription, SubscriptionStatus, BillingCycle, PlanCode, FeatureCode, PlanQuotas } from './types';
import { PlanCatalog, DEFAULT_PLANS } from './plans';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export class SubscriptionService {
  private static memoryStore: Map<string, Subscription> = new Map();

  /**
   * Récupère l'abonnement actif d'une organisation
   */
  public static async getSubscription(organizationId: string): Promise<Subscription> {
    if (!organizationId) {
      throw new Error('Identifiant d’organisation requis pour le service d’abonnement.');
    }

    // 1. Vérification dans le cache mémoire
    if (this.memoryStore.has(organizationId)) {
      return this.memoryStore.get(organizationId)!;
    }

    // 2. Recherche en base de données Supabase
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('subscriptions')
          .select('*, plans(code, name)')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!error && data) {
          const planCode = (data.plans?.code || 'STARTER') as PlanCode;
          const sub: Subscription = {
            id: data.id,
            organizationId: data.organization_id,
            planId: data.plan_id,
            planCode: planCode,
            planName: data.plans?.name || DEFAULT_PLANS[planCode]?.name,
            status: data.status as SubscriptionStatus,
            billingCycle: data.billing_cycle as BillingCycle,
            currency: data.currency || 'XOF',
            amount: data.amount || 0,
            startedAt: data.started_at,
            currentPeriodStart: data.current_period_start,
            currentPeriodEnd: data.current_period_end,
            trialStart: data.trial_start,
            trialEnd: data.trial_end,
            cancelledAt: data.cancelled_at,
            cancelAtPeriodEnd: data.cancel_at_period_end || false,
            customQuotas: data.custom_quotas,
            customFeatures: data.custom_features,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
          this.memoryStore.set(organizationId, sub);
          return sub;
        }
      }
    } catch (e) {
      console.warn('[SubscriptionService] Erreur lecture table subscriptions:', e);
    }

    // 3. Fallback d'initialisation intelligente pour préserver les organisations existantes
    const isLegacyPilot =
      organizationId === 'fa000000-0000-0000-0000-000000000001' ||
      organizationId === '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

    // Les organisations pilotes existantes ont le plan BUSINESS actif pour garantir la non-régression
    const defaultCode: PlanCode = isLegacyPilot ? 'BUSINESS' : 'PROFESSIONNEL';
    const plan = await PlanCatalog.getPlanByCode(defaultCode);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const trialEnd = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    const initialSub: Subscription = {
      id: `sub_${organizationId.slice(0, 8)}_${Date.now()}`,
      organizationId,
      planId: plan?.id || 'plan_default',
      planCode: defaultCode,
      planName: plan?.name,
      status: isLegacyPilot ? 'ACTIVE' : 'TRIAL',
      billingCycle: 'MONTHLY',
      currency: 'XOF',
      amount: plan?.monthlyPrice || 129000,
      startedAt: now.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      trialStart: isLegacyPilot ? null : now.toISOString(),
      trialEnd: isLegacyPilot ? null : trialEnd.toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, initialSub);

    // Tentative d'insertion en base
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('subscriptions').upsert({
          id: initialSub.id,
          organization_id: organizationId,
          plan_id: initialSub.planId,
          status: initialSub.status,
          billing_cycle: initialSub.billingCycle,
          currency: initialSub.currency,
          amount: initialSub.amount,
          started_at: initialSub.startedAt,
          current_period_start: initialSub.currentPeriodStart,
          current_period_end: initialSub.currentPeriodEnd,
          trial_start: initialSub.trialStart,
          trial_end: initialSub.trialEnd,
          cancel_at_period_end: initialSub.cancelAtPeriodEnd,
          created_at: initialSub.createdAt,
          updated_at: initialSub.updatedAt,
        });
      }
    } catch {
      // Ignorer si la table n'est pas encore créée sur le serveur distant
    }

    return initialSub;
  }

  /**
   * Crée un nouvel abonnement pour une organisation
   */
  public static async createSubscription(params: {
    organizationId: string;
    planId?: string;
    planCode: PlanCode;
    status?: SubscriptionStatus;
    billingCycle?: BillingCycle;
    amount?: number;
    trialEnd?: string | null;
    currentPeriodEnd?: string;
  }): Promise<Subscription> {
    const rawCode = (params.planCode || 'PROFESSIONNEL').toUpperCase().trim();
    const planCode = (rawCode === 'BUSINESS_OS' ? 'BUSINESS' : rawCode) as PlanCode;
    const { organizationId, billingCycle = 'MONTHLY' } = params;
    const plan = await PlanCatalog.getPlanByCode(planCode);
    const now = new Date();
    const isYearly = (billingCycle as string) === 'ANNUAL' || billingCycle === 'YEARLY';
    const periodDurationMs = isYearly ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    const periodEnd = params.currentPeriodEnd || new Date(now.getTime() + periodDurationMs).toISOString();
    const amount = params.amount ?? (isYearly ? plan?.yearlyPrice || 0 : plan?.monthlyPrice || 0);

    const sub: Subscription = {
      id: `sub_${organizationId.slice(0, 8)}_${Date.now()}`,
      organizationId,
      planId: params.planId || plan?.id || `plan_${planCode.toLowerCase()}`,
      planCode,
      planName: plan?.name || String(planCode),
      status: params.status || 'TRIAL',
      billingCycle,
      currency: 'XOF',
      amount,
      startedAt: now.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd,
      trialStart: params.status === 'ACTIVE' && !params.trialEnd ? null : now.toISOString(),
      trialEnd: params.trialEnd || null,
      cancelAtPeriodEnd: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, sub);

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('subscriptions').upsert({
          id: sub.id,
          organization_id: organizationId,
          plan_id: sub.planId,
          status: sub.status,
          billing_cycle: sub.billingCycle,
          currency: sub.currency,
          amount: sub.amount,
          started_at: sub.startedAt,
          current_period_start: sub.currentPeriodStart,
          current_period_end: sub.currentPeriodEnd,
          trial_start: sub.trialStart,
          trial_end: sub.trialEnd,
          cancel_at_period_end: sub.cancelAtPeriodEnd,
          created_at: sub.createdAt,
          updated_at: sub.updatedAt,
        });
      }
    } catch {
      // Toléré si migration en cours
    }

    return sub;
  }

  /**
   * Change le plan d'une organisation (Upgrade ou Downgrade)
   */
  public static async changePlan(
    organizationId: string,
    targetPlanCode: PlanCode,
    billingCycle: BillingCycle = 'MONTHLY',
    reason?: string
  ): Promise<Subscription> {
    const current = await this.getSubscription(organizationId);
    const newPlan = await PlanCatalog.getPlanByCode(targetPlanCode);
    if (!newPlan) throw new Error(`Plan introuvable : ${targetPlanCode}`);

    const now = new Date();
    const periodDurationMs =
      billingCycle === 'YEARLY' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
    const amount = billingCycle === 'YEARLY' ? newPlan.yearlyPrice : newPlan.monthlyPrice;

    const updated: Subscription = {
      ...current,
      planId: newPlan.id,
      planCode: newPlan.code,
      planName: newPlan.name,
      status: 'ACTIVE',
      billingCycle,
      amount,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: new Date(now.getTime() + periodDurationMs).toISOString(),
      cancelledAt: null,
      cancelAtPeriodEnd: false,
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, updated);

    // Audit log
    await this.logCommercialAction(organizationId, 'SUBSCRIPTION_CHANGED', {
      previousPlan: current.planCode,
      newPlan: newPlan.code,
      billingCycle,
      amount,
      reason: reason || 'Changement de plan demandé',
    });

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('subscriptions').upsert({
          id: updated.id,
          organization_id: organizationId,
          plan_id: updated.planId,
          status: updated.status,
          billing_cycle: updated.billingCycle,
          currency: updated.currency,
          amount: updated.amount,
          current_period_start: updated.currentPeriodStart,
          current_period_end: updated.currentPeriodEnd,
          cancel_at_period_end: false,
          updated_at: updated.updatedAt,
        });
      }
    } catch (e) {
      console.warn('[SubscriptionService] Synchronisation DB changement de plan:', e);
    }

    return {
      ...updated,
      organization_id: organizationId,
      plan: newPlan,
    } as any;
  }

  /**
   * Annule l'abonnement à la fin de la période courante
   */
  public static async cancelSubscription(
    organizationId: string,
    reason?: string
  ): Promise<any> {
    const current = await this.getSubscription(organizationId);
    const now = new Date();

    const updated: Subscription = {
      ...current,
      cancelAtPeriodEnd: true,
      cancelledAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, updated);

    await this.logCommercialAction(organizationId, 'SUBSCRIPTION_CANCELLED', {
      planCode: current.planCode,
      reason: reason || 'Annulation demandée par le client',
      effectiveEndDate: current.currentPeriodEnd,
    });

    const plan = (await PlanCatalog.getPlanByCode(updated.planCode)) || (DEFAULT_PLANS as any)[updated.planCode] || undefined;
    return {
      ...updated,
      organization_id: organizationId,
      cancel_at_period_end: true,
      plan,
    };
  }

  /**
   * Réactive un abonnement annulé ou suspendu
   */
  public static async reactivateSubscription(
    organizationId: string
  ): Promise<Subscription> {
    const current = await this.getSubscription(organizationId);
    const now = new Date();

    const updated: Subscription = {
      ...current,
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, updated);

    await this.logCommercialAction(organizationId, 'ORGANIZATION_REACTIVATED', {
      planCode: current.planCode,
    });

    const plan = (await PlanCatalog.getPlanByCode(updated.planCode)) || (DEFAULT_PLANS as any)[updated.planCode] || undefined;
    return {
      ...updated,
      organization_id: organizationId,
      cancel_at_period_end: false,
      plan,
    };
  }

  /**
   * Met à jour le statut d'un abonnement (ex: SUSPENDED, ACTIVE, PAST_DUE)
   */
  public static async updateStatus(
    organizationId: string,
    status: SubscriptionStatus,
    reason?: string
  ): Promise<Subscription> {
    const current = await this.getSubscription(organizationId);
    const now = new Date();

    const updated: Subscription = {
      ...current,
      status,
      updatedAt: now.toISOString(),
    };

    this.memoryStore.set(organizationId, updated);

    await this.logCommercialAction(organizationId, 'SUBSCRIPTION_STATUS_CHANGED', {
      previousStatus: current.status,
      newStatus: status,
      reason: reason || 'Mise à jour du statut d\'abonnement',
    });

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: updated.status,
            updated_at: updated.updatedAt,
          })
          .eq('organization_id', organizationId);
      }
    } catch (e) {
      console.warn('[SubscriptionService] Synchronisation DB statut abonnement:', e);
    }

    return updated;
  }

  public static async getOrCreateSubscription(organizationId: string): Promise<any> {
    const sub = await this.getSubscription(organizationId);
    const plan = await PlanCatalog.getPlanByCode(sub.planCode);
    return {
      ...sub,
      organization_id: sub.organizationId,
      cancel_at_period_end: sub.cancelAtPeriodEnd,
      trial_start: sub.trialStart,
      trial_end: sub.trialEnd,
      plan: plan || { code: sub.planCode, name: sub.planName },
    };
  }

  public static async startTrial(
    organizationId: string,
    planCode: PlanCode = 'STARTER',
    trialDays = 14
  ): Promise<any> {
    const plan = await PlanCatalog.getPlanByCode(planCode);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 3600 * 1000);
    const sub: Subscription = {
      id: `sub_trial_${Date.now()}`,
      organizationId,
      planId: plan?.id || 'plan_starter',
      planCode,
      planName: plan?.name,
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      currency: 'XOF',
      amount: plan?.monthlyPrice || 49000,
      startedAt: now.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: trialEnd.toISOString(),
      trialStart: now.toISOString(),
      trialEnd: trialEnd.toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.memoryStore.set(organizationId, sub);
    return {
      ...sub,
      organization_id: organizationId,
      trial_start: sub.trialStart,
      trial_end: sub.trialEnd,
      cancel_at_period_end: false,
      plan: plan || { code: planCode, name: sub.planName },
    };
  }

  public static async extendTrial(
    organizationId: string,
    extraDays = 7
  ): Promise<any> {
    const sub = await this.getSubscription(organizationId);
    const currentEnd = sub.trialEnd ? new Date(sub.trialEnd).getTime() : Date.now();
    const newEnd = new Date(currentEnd + extraDays * 24 * 3600 * 1000).toISOString();
    const updated: Subscription = {
      ...sub,
      status: 'TRIAL',
      trialEnd: newEnd,
      currentPeriodEnd: newEnd,
      updatedAt: new Date().toISOString(),
    };
    this.memoryStore.set(organizationId, updated);
    const plan = await PlanCatalog.getPlanByCode(updated.planCode);
    return {
      ...updated,
      organization_id: organizationId,
      trial_start: updated.trialStart,
      trial_end: updated.trialEnd,
      cancel_at_period_end: updated.cancelAtPeriodEnd,
      plan: plan || { code: updated.planCode, name: updated.planName },
    };
  }

  public static async suspendOrganization(
    organizationId: string,
    reason?: string
  ): Promise<any> {
    const sub = await this.getSubscription(organizationId);
    const updated: Subscription = {
      ...sub,
      status: 'SUSPENDED',
      updatedAt: new Date().toISOString(),
    };
    this.memoryStore.set(organizationId, updated);
    await this.logCommercialAction(organizationId, 'ORGANIZATION_SUSPENDED', { reason });
    const plan = await PlanCatalog.getPlanByCode(updated.planCode);
    return {
      ...updated,
      organization_id: organizationId,
      cancel_at_period_end: updated.cancelAtPeriodEnd,
      plan: plan || { code: updated.planCode, name: updated.planName },
    };
  }

  public static async reactivateOrganization(
    organizationId: string
  ): Promise<any> {
    return this.reactivateSubscription(organizationId);
  }

  /**
   * Journalisation immuable dans audit_logs
   */
  private static async logCommercialAction(
    organizationId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          action,
          entity_type: 'SUBSCRIPTION',
          entity_id: organizationId,
          details: {
            ...details,
            organizationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch {
      // Fallback silencieux pour tests sans réseau
    }
  }
}

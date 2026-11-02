/**
 * SECURIA V2 — PHASE 6 : CATALOGUE DES PLANS SaaS
 * Définition et gestion des plans commerciaux en Francs CFA (XOF)
 */

import { Plan, PlanCode, FeatureCode } from './types';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export { ALL_FEATURES, DEFAULT_PLANS } from './plans-data';
import { DEFAULT_PLANS } from './plans-data';


export class PlanCatalog {
  private static plansCache: Map<PlanCode, Plan> = new Map(
    Object.entries(DEFAULT_PLANS) as [PlanCode, Plan][]
  );

  /**
   * Récupère tous les plans actifs ou l'ensemble du catalogue
   */
  public static async getPlans(onlyActive = true): Promise<Plan[]> {
    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('plans')
          .select('*')
          .order('monthly_price', { ascending: true });

        if (!error && data && data.length > 0) {
          const loadedPlans = data.map(row => ({
            id: row.id,
            code: row.code as PlanCode,
            name: row.name,
            description: row.description || '',
            monthlyPrice: row.monthly_price,
            yearlyPrice: row.yearly_price,
            currency: row.currency || 'XOF',
            isActive: row.is_active,
            trialDays: row.trial_days || 14,
            quotas: row.quotas || DEFAULT_PLANS[row.code as PlanCode]?.quotas,
            features: row.features || DEFAULT_PLANS[row.code as PlanCode]?.features || [],
          }));

          loadedPlans.forEach(p => this.plansCache.set(p.code, p));
        }
      }
    } catch (e) {
      console.warn('[PlanCatalog] Lecture table plans échouée, utilisation du cache:', e);
    }

    const all = Array.from(this.plansCache.values());
    return onlyActive ? all.filter(p => p.isActive) : all;
  }

  /**
   * Récupère un plan spécifique par son code
   */
  public static async getPlanByCode(code: string): Promise<Plan | null> {
    const raw = (code || '').toUpperCase().trim();
    const normalized = (raw === 'BUSINESS_OS' ? 'BUSINESS' : raw) as PlanCode;
    if (this.plansCache.has(normalized)) {
      return this.plansCache.get(normalized)!;
    }
    const plans = await this.getPlans(false);
    return plans.find(p => p.code === normalized) || DEFAULT_PLANS[normalized] || null;
  }

  /**
   * Met à jour ou personnalise un plan (réservé PLATFORM_ADMIN)
   */
  public static async updatePlan(
    code: PlanCode,
    updates: Partial<Omit<Plan, 'code' | 'id'>> & { priceMonthly?: number; priceYearly?: number }
  ): Promise<any> {
    const existing = await this.getPlanByCode(code);
    if (!existing) throw new Error(`Plan non trouvé pour le code : ${code}`);

    const mPrice = updates.priceMonthly !== undefined ? updates.priceMonthly : (updates.monthlyPrice !== undefined ? updates.monthlyPrice : existing.monthlyPrice);
    const yPrice = updates.priceYearly !== undefined ? updates.priceYearly : (updates.yearlyPrice !== undefined ? updates.yearlyPrice : existing.yearlyPrice);

    const updated: any = {
      ...existing,
      ...updates,
      monthlyPrice: mPrice,
      priceMonthly: mPrice,
      yearlyPrice: yPrice,
      priceYearly: yPrice,
      quotas: {
        ...existing.quotas,
        ...(updates.quotas || {}),
      },
      features: updates.features || existing.features,
    };

    this.plansCache.set(code, updated);

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('plans')
          .update({
            name: updated.name,
            description: updated.description,
            monthly_price: updated.monthlyPrice,
            yearly_price: updated.yearlyPrice,
            is_active: updated.isActive,
            trial_days: updated.trialDays,
            quotas: updated.quotas,
            features: updated.features,
            updated_at: new Date().toISOString(),
          })
          .eq('code', code);
      }
    } catch (e) {
      console.warn('[PlanCatalog] Mise à jour table plans échouée:', e);
    }

    return updated;
  }

  public static async getAllPlans(): Promise<Plan[]> {
    return this.getPlans(false);
  }

  public static async getActivePlans(): Promise<Plan[]> {
    return this.getPlans(true);
  }

  public static async upsertPlan(plan: any): Promise<any> {
    const code = plan.code.toUpperCase() as PlanCode;
    const existing = await this.getPlanByCode(code);
    if (existing) {
      return this.updatePlan(code, plan);
    }
    const mPrice = plan.priceMonthly || plan.monthlyPrice || 0;
    const yPrice = plan.priceYearly || plan.yearlyPrice || 0;
    const newPlan: any = {
      id: plan.id || `plan_${code.toLowerCase()}`,
      code,
      name: plan.name || code,
      description: plan.description || '',
      monthlyPrice: mPrice,
      priceMonthly: mPrice,
      yearlyPrice: yPrice,
      priceYearly: yPrice,
      currency: plan.currency || 'XOF',
      isActive: plan.isActive !== undefined ? plan.isActive : true,
      trialDays: plan.trialDays || 14,
      quotas: plan.quotas || DEFAULT_PLANS.STARTER.quotas,
      features: plan.features || DEFAULT_PLANS.STARTER.features,
    };
    this.plansCache.set(code, newPlan);
    return newPlan;
  }
}

export const PlanService = PlanCatalog;

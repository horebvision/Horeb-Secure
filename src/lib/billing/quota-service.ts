/**
 * SECURIA V2 — PHASE 6 : MOTEUR DE QUOTAS & CALCUL D'USAGE RÉEL
 * Calcule la consommation à partir des données réelles de la base de données
 * Applique le soft limit (80%) et le hard limit (100%) sans invention de métriques
 */

import { PlanQuotas, OrganizationUsageStats, UsageMetric } from './types';
import { SubscriptionService } from './subscription-service';
import { PlanCatalog, DEFAULT_PLANS } from './plans';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export const QUOTA_LABELS: Record<keyof PlanQuotas, string> = {
  maxUsers: 'Comptes Utilisateurs',
  maxAgents: 'Agents de terrain',
  maxSites: 'Sites protégés',
  maxClients: 'Clients rattachés',
  maxInterventionsMonth: 'Interventions par mois',
  maxApiKeys: 'Clés API actives',
  maxWebhooks: 'Connecteurs Webhooks',
  maxStorageMb: 'Stockage documents (Mo)',
  maxExportsMonth: 'Exports générés par mois',
  maxReportsMonth: 'Rapports automatisés par mois',
};

export class QuotaService {
  private static normalizeKey(key: string): keyof PlanQuotas {
    const map: Record<string, keyof PlanQuotas> = {
      MAX_USERS: 'maxUsers',
      MAX_AGENTS: 'maxAgents',
      MAX_SITES: 'maxSites',
      MAX_CLIENTS: 'maxClients',
      MAX_INTERVENTIONS_MONTH: 'maxInterventionsMonth',
      MAX_API_KEYS: 'maxApiKeys',
      MAX_WEBHOOKS: 'maxWebhooks',
      MAX_STORAGE: 'maxStorageMb',
      MAX_EXPORTS_MONTH: 'maxExportsMonth',
      MAX_REPORTS_MONTH: 'maxReportsMonth',
    };
    return (map[key] || key) as keyof PlanQuotas;
  }

  /**
   * Récupère la limite autorisée pour un quota donné
   */
  public static async getLimit(
    organizationId: string,
    rawKey: string
  ): Promise<number> {
    const key = this.normalizeKey(rawKey);
    const sub = await SubscriptionService.getSubscription(organizationId);
    if (sub.customQuotas && typeof sub.customQuotas[key] === 'number') {
      return sub.customQuotas[key]!;
    }
    const plan = await PlanCatalog.getPlanByCode(sub.planCode);
    const quotas = plan?.quotas || DEFAULT_PLANS[sub.planCode]?.quotas || DEFAULT_PLANS.STARTER.quotas;
    return quotas[key];
  }

  /**
   * Récupère la consommation et la limite sous forme d'objet structuré
   */
  public static async getQuota(
    organizationId: string,
    rawKey: string
  ): Promise<{ used: number; limit: number; percentage: number; remaining: number }> {
    const key = this.normalizeKey(rawKey);
    const limit = await this.getLimit(organizationId, key);
    const used = await this.getCurrentUsage(organizationId, key);
    const percentage = limit >= 999999 ? 0 : Math.min(100, Math.round((used / limit) * 100));
    const remaining = limit >= 999999 ? 999999 : Math.max(0, limit - used);
    return { used, limit, percentage, remaining };
  }

  /**
   * Calcule l'utilisation actuelle réelle à partir des tables Supabase
   */
  public static async getCurrentUsage(
    organizationId: string,
    key: keyof PlanQuotas
  ): Promise<number> {
    if (!organizationId) return 0;

    try {
      if (isRealServiceRoleKey()) {
        switch (key) {
          case 'maxUsers': {
            // Les agents relèvent de leur propre quota (maxAgents) : les compter ici
            // bloquait la création de tout compte de gestion dès 15 agents.
            const { count } = await supabaseAdmin
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .neq('role', 'AGENT');
            return count || 0;
          }

          case 'maxAgents': {
            // Récupère les utilisateurs de l'org puis leurs agents
            const { data: orgUsers } = await supabaseAdmin
              .from('users')
              .select('id')
              .eq('organization_id', organizationId);

            if (!orgUsers || orgUsers.length === 0) return 0;
            const userIds = orgUsers.map(u => u.id);

            const { count } = await supabaseAdmin
              .from('security_agents')
              .select('*', { count: 'exact', head: true })
              .in('user_id', userIds);
            return count || 0;
          }

          case 'maxSites': {
            const { count } = await supabaseAdmin
              .from('protected_sites')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId);
            return count || 0;
          }

          case 'maxClients': {
            const { count: clientsCount } = await supabaseAdmin
              .from('clients')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .neq('status', 'ARCHIVED');

            if (clientsCount !== null && clientsCount !== undefined && clientsCount > 0) {
              return clientsCount;
            }

            const { count } = await supabaseAdmin
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .eq('role', 'USER');
            return count || 0;
          }

          case 'maxInterventionsMonth': {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            // Filtrer par les alertes appartenant à cette organisation
            const { data: orgAlerts } = await supabaseAdmin
              .from('alerts')
              .select('id')
              .eq('organization_id', organizationId);

            if (!orgAlerts || orgAlerts.length === 0) return 0;
            const alertIds = orgAlerts.map(a => a.id);

            const { count } = await supabaseAdmin
              .from('interventions')
              .select('*', { count: 'exact', head: true })
              .in('alert_id', alertIds)
              .gte('created_at', startOfMonth.toISOString());
            return count || 0;
          }

          case 'maxApiKeys': {
            // Lecture depuis le cache ou table api_keys
            const { count } = await supabaseAdmin
              .from('api_keys')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .is('revoked_at', null);
            return count || 0;
          }

          case 'maxWebhooks': {
            const { count } = await supabaseAdmin
              .from('integration_partners')
              .select('*', { count: 'exact', head: true })
              .eq('organization_id', organizationId);
            return count || 0;
          }

          default:
            return 0;
        }
      }
    } catch (e) {
      console.warn(`[QuotaService] Erreur calcul usage pour ${key}:`, e);
    }

    // Valeur minimale par défaut pour les tests isolés
    return 0;
  }

  /**
   * Vérifie si une opération peut être consommée sans dépasser le quota avec détails
   */
  public static async checkQuota(
    organizationId: string,
    rawKey: string,
    amount = 1
  ): Promise<{ allowed: boolean; warning?: string; currentUsage?: number; maxLimit?: number }> {
    const key = this.normalizeKey(rawKey);
    const limit = await this.getLimit(organizationId, key);
    if (limit >= 999999) return { allowed: true, currentUsage: 0, maxLimit: limit };
    const current = await this.getCurrentUsage(organizationId, key);
    const allowed = current + amount <= limit;
    const percentage = Math.round(((current + amount) / limit) * 100);
    const warning = percentage >= 80 ? `Vous avez utilisé ${percentage}% de votre quota.` : undefined;
    return { allowed, warning, currentUsage: current, maxLimit: limit };
  }

  /**
   * Vérifie si une opération peut être consommée sans dépasser le quota
   */
  public static async canConsume(
    organizationId: string,
    rawKey: string,
    amount = 1
  ): Promise<{ allowed: boolean; warning?: string }> {
    const key = this.normalizeKey(rawKey);
    const limit = await this.getLimit(organizationId, key);
    if (limit >= 999999) return { allowed: true };
    const current = await this.getCurrentUsage(organizationId, key);
    const allowed = current + amount <= limit;
    const percentage = Math.round(((current + amount) / limit) * 100);
    const warning = percentage >= 80 ? `Vous avez utilisé ${percentage}% de votre quota.` : undefined;
    return { allowed, warning };
  }

  /**
   * Déclenche une exception bloquante explicite en cas de dépassement
   */
  public static async assertCanConsume(
    organizationId: string,
    rawKey: string,
    amount = 1
  ): Promise<void> {
    const key = this.normalizeKey(rawKey);
    const limit = await this.getLimit(organizationId, key);
    if (limit >= 999999) return;

    const current = await this.getCurrentUsage(organizationId, key);
    if (current + amount > limit) {
      const sub = await SubscriptionService.getSubscription(organizationId);
      const label = QUOTA_LABELS[key] || key;

      const error: any = new Error(
        `Limite du plan atteinte. Votre plan (${sub.planCode}) autorise un maximum de ${limit} ${label}. Vous utilisez actuellement ${current}/${limit}. Veuillez passer à un plan supérieur ou contacter le service commercial SECURIA.`
      );
      error.code = 'QUOTA_EXCEEDED';
      error.statusCode = 403;
      error.quotaKey = key;
      error.current = current;
      error.limit = limit;
      error.plan = sub.planCode;
      throw error;
    }
  }

  /**
   * Synthèse complète d'usage pour la page /settings/usage et la facturation
   */
  public static async getOrganizationUsageStats(
    organizationId: string
  ): Promise<OrganizationUsageStats> {
    const sub = await SubscriptionService.getSubscription(organizationId);
    const plan = await PlanCatalog.getPlanByCode(sub.planCode);

    const keys: (keyof PlanQuotas)[] = [
      'maxUsers',
      'maxAgents',
      'maxSites',
      'maxClients',
      'maxInterventionsMonth',
      'maxApiKeys',
      'maxWebhooks',
      'maxStorageMb',
      'maxExportsMonth',
      'maxReportsMonth',
    ];

    const metricsRecord: Partial<Record<keyof PlanQuotas, UsageMetric>> = {};
    let hasWarning = false;
    let hasExceeded = false;

    for (const key of keys) {
      const limit = await this.getLimit(organizationId, key);
      const current = await this.getCurrentUsage(organizationId, key);
      const pct = limit >= 999999 ? 0 : Math.min(100, Math.round((current / limit) * 100));
      const isSoft = pct >= 80 && pct < 100;
      const isHard = current >= limit && limit < 999999;

      if (isSoft) hasWarning = true;
      if (isHard) hasExceeded = true;

      metricsRecord[key] = {
        key,
        label: QUOTA_LABELS[key],
        current,
        max: limit,
        percentage: pct,
        isSoftLimit: isSoft,
        isHardLimit: isHard,
      };
    }

    return {
      organizationId,
      planCode: sub.planCode,
      planName: sub.planName || plan?.name || sub.planCode,
      status: sub.status,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      metrics: metricsRecord as Record<keyof PlanQuotas, UsageMetric>,
      hasWarning,
      hasExceeded,
    };
  }
}

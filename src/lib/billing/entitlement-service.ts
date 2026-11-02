/**
 * SECURIA V2 — PHASE 6 : SERVICE DES ENTITLEMENTS (HABILITATIONS MODULES)
 * Vérifie côté serveur si une organisation est autorisée à consommer une fonctionnalité
 */

import { FeatureCode, PlanCode } from './types';
import { SubscriptionService } from './subscription-service';
import { PlanCatalog, DEFAULT_PLANS } from './plans';

export class EntitlementService {
  private static temporaryOverrides: Map<string, Set<FeatureCode>> = new Map();

  /**
   * Vérifie si une organisation a accès à un module/fonctionnalité
   */
  public static async hasFeature(
    organizationId: string,
    feature: FeatureCode
  ): Promise<boolean> {
    if (!organizationId) return false;

    // 1. Vérification des habilitations temporaires accordées par un administrateur
    const overrides = this.temporaryOverrides.get(organizationId);
    if (overrides && overrides.has(feature)) {
      return true;
    }

    // 2. Récupération de l'abonnement actif
    const subscription = await SubscriptionService.getSubscription(organizationId);

    // Si suspendu ou expiré, seul l'accès de base est préservé
    if (subscription.status === 'SUSPENDED' || subscription.status === 'EXPIRED') {
      return feature === 'CORE_SECURITY';
    }

    // 3. Vérification des surcharges personnalisées du contrat
    if (subscription.customFeatures && subscription.customFeatures.includes(feature)) {
      return true;
    }

    // 4. Vérification dans le plan associé
    const plan = await PlanCatalog.getPlanByCode(subscription.planCode);
    const planFeatures = plan?.features || DEFAULT_PLANS[subscription.planCode]?.features || [];

    return planFeatures.includes(feature);
  }

  /**
   * Bloque avec une erreur explicite si le module n'est pas inclus
   */
  public static async assertFeature(
    organizationId: string,
    feature: FeatureCode
  ): Promise<void> {
    const allowed = await this.hasFeature(organizationId, feature);
    if (!allowed) {
      const sub = await SubscriptionService.getSubscription(organizationId);
      const error: any = new Error(
        `Le module "${feature}" n'est pas inclus dans votre offre actuelle (${sub.planCode}). Veuillez mettre à niveau votre abonnement SECURIA.`
      );
      error.code = 'FEATURE_NOT_INCLUDED';
      error.statusCode = 403;
      error.feature = feature;
      error.plan = sub.planCode;
      throw error;
    }
  }

  /**
   * Active temporairement un module pour une organisation (démo / essai commercial)
   */
  public static grantTemporaryFeature(
    organizationId: string,
    feature: FeatureCode,
    _durationDays?: number
  ): void {
    if (!this.temporaryOverrides.has(organizationId)) {
      this.temporaryOverrides.set(organizationId, new Set());
    }
    this.temporaryOverrides.get(organizationId)!.add(feature);
  }

  /**
   * Révoque une habilitation temporaire
   */
  public static revokeTemporaryFeature(
    organizationId: string,
    feature: FeatureCode
  ): void {
    const overrides = this.temporaryOverrides.get(organizationId);
    if (overrides) {
      overrides.delete(feature);
    }
  }

  /**
   * Récupère la liste de tous les modules activés pour une organisation
   */
  public static async getActiveFeatures(organizationId: string): Promise<FeatureCode[]> {
    const sub = await SubscriptionService.getSubscription(organizationId);
    const plan = await PlanCatalog.getPlanByCode(sub.planCode);
    const baseFeatures = plan?.features || DEFAULT_PLANS[sub.planCode]?.features || [];
    const customFeatures = sub.customFeatures || [];
    const tempFeatures = Array.from(this.temporaryOverrides.get(organizationId) || []);

    const combined = new Set([...baseFeatures, ...customFeatures, ...tempFeatures]);
    return Array.from(combined);
  }
}

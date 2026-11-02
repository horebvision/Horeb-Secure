import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateApiRequest,
  getScopedDatabaseClient,
  isValidUuid,
  safeErrorResponse,
} from '@/lib/security/api-guard';
import { SmartDispatchService } from '@/lib/dispatch';

/**
 * GET /api/dispatch/recommendation
 * Point d'accès du Smart Dispatch Engine V2.
 * Fournit la recommandation explicable du meilleur agent pour une alerte donnée.
 * Sécurité : Réservé aux profils SECURITY_MANAGER et ADMIN, cloisonnement strict par organisation.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Contrôle RBAC : Seuls les RÉGULATEURS SOC et ADMINS peuvent consulter les recommandations
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json(
          { success: false, error: 'Accès refusé. Habilitation superviseur SOC requise.' },
          { status: 403 }
        )
      );
    }

    const { searchParams } = new URL(req.url);
    const alertId = searchParams.get('alert_id') || searchParams.get('alertId');

    if (!alertId || !isValidUuid(alertId)) {
      return NextResponse.json(
        { success: false, error: 'Paramètre alert_id valide (UUID) obligatoire.' },
        { status: 400 }
      );
    }

    // 2. Client de base de données contextualisé (Bearer token de session pour respect RLS)
    const db = await getScopedDatabaseClient(req);
    // Seul le Super Admin plateforme est transverse ; un admin d'entreprise reste dans son tenant
    const isSuperAdmin = user.isPlatformAdmin === true;
    const callerOrgId = user.organizationId;

    // 3. Calcul de la recommandation
    const recommendation = await SmartDispatchService.getRecommendationForAlert(
      alertId,
      db,
      callerOrgId,
      isSuperAdmin
    );

    return NextResponse.json({
      success: true,
      alertId: recommendation.alertId,
      alertNumber: recommendation.alertNumber,
      organizationId: recommendation.organizationId,
      alertPriority: recommendation.alertPriority,
      alertType: recommendation.alertType,
      alertStatus: recommendation.alertStatus,
      locationAddress: recommendation.locationAddress,
      siteName: recommendation.siteName,
      clientName: recommendation.clientName,
      securityCenter: recommendation.securityCenter,
      securityCenters: recommendation.securityCenters,
      recommendedAgent: recommendation.recommendedAgent,
      candidates: recommendation.candidates,
      totalCandidatesEvaluated: recommendation.totalCandidatesEvaluated,
      eligibleCandidatesCount: recommendation.eligibleCandidatesCount,
      generatedAt: recommendation.generatedAt,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la génération de la recommandation de dispatch');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { AlertEngine } from '@/modules/alerts/alert-engine.service';
import {
  authenticateApiRequest,
  safeErrorResponse,
} from '@/lib/security/api-guard';

/**
 * POST /api/alerts/escalate
 * Moteur d'escalade automatique pour les alertes critiques non prises en charge.
 * Accessible uniquement aux superviseurs, admins ou tâches planifiées autorisées.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Contrôle RBAC
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Accès refusé. Habilitation superviseur requise.' }, { status: 403 })
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawTimeout = Number(body.timeout_seconds);
    const timeoutSeconds = !isNaN(rawTimeout) && rawTimeout >= 10 && rawTimeout <= 3600 ? rawTimeout : 60;

    const result = await AlertEngine.checkAndEscalateAlerts(timeoutSeconds);

    return NextResponse.json({
      success: true,
      message: `${result.escalatedCount} alerte(s) critique(s) escaladée(s) vers les superviseurs`,
      escalatedCount: result.escalatedCount,
      alerts: result.alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du traitement de l’escalade');
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json({ error: 'Accès refusé. Habilitation superviseur requise.' }, { status: 403 })
      );
    }

    const result = await AlertEngine.checkAndEscalateAlerts(60);
    return NextResponse.json({
      status: 'escalation-engine-active',
      escalatedCount: result.escalatedCount,
      alerts: result.alerts,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du diagnostic d’escalade');
  }
}

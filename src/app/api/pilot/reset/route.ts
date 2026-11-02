import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';

/**
 * POST /api/pilot/reset
 * Réinitialisation sécurisée et isolée du scénario pilote.
 * N'affecte QUE les données de l'organisation SECURIA PILOT.
 */
export async function POST(req: NextRequest) {
  // SÉCURITÉ PRODUCTION : Rejet strict (HTTP 404) avant tout accès ou réinitialisation
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint introuvable' }, { status: 404 });
  }

  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return (
        errorResponse ||
        NextResponse.json(
          { success: false, error: 'Accès refusé. Habilitation superviseur requise.' },
          { status: 403 }
        )
      );
    }

    // Appel de la procédure stockée sécurisée
    const { data, error } = await (supabaseAdmin as any).rpc('reset_pilot_scenario');

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la réinitialisation du scénario pilote');
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la réinitialisation du pilote');
  }
}

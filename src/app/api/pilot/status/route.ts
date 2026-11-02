import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { safeErrorResponse } from '@/lib/security/api-guard';

/**
 * GET /api/pilot/status
 * Retourne l'état complet du système pour l'environnement pilote :
 * - Santé API & Database
 * - État des 3 comptes pilotes (Client, Agent, SOC)
 * - Alerte pilote active en cours
 * - Historique des événements du scénario
 */
export async function GET(req: NextRequest) {
  // SÉCURITÉ PRODUCTION : Rejet strict (HTTP 404) avant tout accès à la base
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint introuvable' }, { status: 404 });
  }

  try {
    const startTime = Date.now();

    // Appel de la procédure PostgreSQL SECURITY DEFINER
    const { data, error } = await (supabaseAdmin as any).rpc('get_pilot_status');

    const dbLatencyMs = Date.now() - startTime;

    if (error) {
      return safeErrorResponse(error, 'Erreur lors de la récupération du statut pilote');
    }

    return NextResponse.json({
      ...data,
      timestamp: new Date().toISOString(),
      system: {
        api: 'ONLINE',
        database: 'ONLINE',
        dbLatencyMs,
        realtime: 'CONNECTED',
        auth: 'OK',
        environment: 'PILOT',
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la consultation du statut pilote');
  }
}

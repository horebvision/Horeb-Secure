import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/security/api-guard';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/test-db
 * Endpoint de diagnostic sécurisé :
 * - En production : désactivé (réponse 404 stricte, aucun diagnostic public).
 * - Hors-production : accessible uniquement aux Super Administrateurs de la Plateforme authentifiés.
 * - Aucune fuite de métadonnées de tables, d'identifiants d'organisations ni de configurations.
 */
export async function GET(req: NextRequest) {
  // 1. Désactivation stricte en environnement de production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint introuvable' }, { status: 404 });
  }

  // 2. Contrôle d'habilitation strict hors production : Super Admin Plateforme uniquement
  const { user, errorResponse } = await authenticateApiRequest(req, {
    allowedRoles: ['ADMIN'],
  });

  if (errorResponse || !user || !user.isPlatformAdmin) {
    return NextResponse.json({ error: 'Endpoint introuvable' }, { status: 404 });
  }

  // 3. Test de connectivité basique et épuré (sans fuite de schéma ni d'IDs)
  try {
    const supabase = getAdminClient();
    const { error } = await supabase.from('organizations').select('id', { count: 'exact', head: true }).limit(1);

    if (error) {
      return NextResponse.json(
        { success: false, database: 'unreachable' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { success: false, database: 'error' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { secretariatService } from '@/lib/secretariat/secretariat-service';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

/**
 * GET /api/secretariat/reports
 * Statistiques agrégées et exports du secrétariat interne.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user || !user.organizationId) {
      return (
        errorResponse ||
        NextResponse.json({ success: false, error: 'Organisation non définie ou accès refusé' }, { status: 401 })
      );
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format'); // 'json' | 'csv'
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    // 1. Calcul des statistiques réelles
    const stats = await secretariatService.getSecretariatStats(user.organizationId);

    // Si export CSV demandé
    if (format === 'csv') {
      const { visits } = await secretariatService.listVisits(user.organizationId, {
        startDate,
        endDate,
        limit: 500,
      });

      // Journaliser l'export dans l'audit
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: user.id as any,
          action: 'VISIT_EXPORTED',
          entity_type: 'secretariat',
          entity_id: user.organizationId,
          details: {
            organization_id: user.organizationId,
            format: 'csv',
            count: visits.length,
          },
          created_at: new Date().toISOString(),
        });
      }

      // Construction du CSV avec en-têtes et données masquées
      const headers = [
        'Reference',
        'Date_Arrivee',
        'Nom_Visiteur',
        'Piece_Type',
        'Piece_Derniers_4',
        'Motif',
        'Hote_Contact',
        'Service',
        'Societe_Origine',
        'Statut',
        'Date_Depart',
        'Duree_Minutes',
        'Signature_Statut',
      ];

      const rows: string[][] = [];
      for (const v of visits) {
        for (const p of v.people || []) {
          rows.push([
            v.visit_reference,
            p.arrival_at,
            `"${p.full_name.replace(/"/g, '""')}"`,
            p.identity_document_type,
            p.identity_number_last4 || '',
            v.visit_reason,
            `"${(v.host_name || '').replace(/"/g, '""')}"`,
            `"${(v.host_department || '').replace(/"/g, '""')}"`,
            `"${(v.visitor_company || '').replace(/"/g, '""')}"`,
            p.status,
            p.departure_at || '',
            p.duration_minutes ? String(p.duration_minutes) : '',
            p.signature_status,
          ]);
        }
      }

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="registre_visiteurs_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      stats,
      organizationId: user.organizationId,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la génération du rapport');
  }
}

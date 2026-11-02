/**
 * GET /api/exports/[id]
 * Consultation de l'état d'avancement d'un job d'export
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { ExportRepository } from '@/lib/exports/repository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['SECURITY_MANAGER', 'ADMIN', 'USER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    const job = await ExportRepository.getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job d’export introuvable' }, { status: 404 });
    }

    // Contrôle d'habilitation : seul l'auteur ou un admin peut voir le job
    // Auteur, Super Admin plateforme, ou responsable/admin de la MÊME organisation uniquement
    const isAuthor = job.requested_by === user.id;
    const isSameOrgSupervisor =
      (user.role === 'ADMIN' || user.role === 'SECURITY_MANAGER') &&
      !!user.organizationId &&
      user.organizationId === job.organization_id;
    if (!isAuthor && !user.isPlatformAdmin && !isSameOrgSupervisor) {
      return NextResponse.json({ error: 'Accès refusé à ce job d’export' }, { status: 403 });
    }

    const downloadUrl = job.status === 'COMPLETED' && job.download_token
      ? `/api/exports/${job.id}/download?token=${job.download_token}`
      : null;

    return NextResponse.json({
      success: true,
      job,
      download_url: downloadUrl,
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors de la récupération du job d’export');
  }
}

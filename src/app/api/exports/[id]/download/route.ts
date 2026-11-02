/**
 * GET /api/exports/[id]/download?token=xxx
 * Téléchargement sécurisé de l'archive ZIP
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { ExportRepository } from '@/lib/exports/repository';
import { supabaseAdmin } from '@/lib/supabase/admin';
import crypto from 'crypto';

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
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    const job = await ExportRepository.getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Archive d’export introuvable' }, { status: 404 });
    }

    // Contrôle d'expiration (Section 14)
    if (job.status === 'EXPIRED' || new Date(job.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Cette archive d’export a expiré et n’est plus disponible au téléchargement (durée maximale : 24h).' },
        { status: 410 }
      );
    }

    // Contrôle de token ou propriétaire
    if (token && job.download_token && token !== job.download_token) {
      return NextResponse.json({ error: 'Jeton de téléchargement invalide' }, { status: 403 });
    }

    // Anti-IDOR : contrôle d'appartenance
    if (user.role === 'USER' && job.requested_by !== user.id) {
      return NextResponse.json({ error: 'Accès refusé : vous ne pouvez télécharger que vos propres exports' }, { status: 403 });
    }
    if (
      !user.isPlatformAdmin &&
      user.role !== 'USER' &&
      (!user.organizationId || user.organizationId !== job.organization_id)
    ) {
      return NextResponse.json({ error: 'Accès refusé : archive d’une autre organisation' }, { status: 403 });
    }

    const storedData = token ? await ExportRepository.getDownloadBuffer(token, job.file_path) : null;

    if (!storedData) {
      return NextResponse.json(
        { error: 'Le fichier temporaire a expiré ou n’est plus disponible en cache. Veuillez relancer l’export.' },
        { status: 404 }
      );
    }

    // Traçabilité d'audit : EXPORT_DOWNLOADED (Section 15)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'EXPORT_DOWNLOADED',
      entity_type: 'export_jobs',
      entity_id: job.id,
      details: {
        job_id: job.id,
        user_id: user.id,
        filename: storedData.filename,
        timestamp: new Date().toISOString(),
      },
    });

    return new NextResponse(new Uint8Array(storedData.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${storedData.filename}"`,
        'Content-Length': storedData.buffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur lors du téléchargement de l’archive d’export');
  }
}

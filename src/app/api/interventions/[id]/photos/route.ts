import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse, sanitizeString } from '@/lib/security/api-guard';
import { resolveInterventionWithAccess, serializeStructuredReport } from '@/lib/interventions';
import { supabaseAdmin } from '@/lib/supabase/admin';

const ALLOWED_MIME_PREFIXES = ['data:image/jpeg', 'data:image/jpg', 'data:image/png', 'data:image/webp'];
const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // ~5MB binaire

/**
 * POST /api/interventions/[id]/photos
 * Ajout sécurisé d'une pièce justificative photographique horodatée au dossier d'intervention.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: 'Identifiant d’intervention invalide (format UUID)' },
        { status: 400 }
      );
    }

    const access = await resolveInterventionWithAccess(id, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!access.allowed || !access.proof) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Si le rapport est déjà validé, interdiction d'ajouter des photos
    if (access.proof.report.report_status === 'REPORT_VALIDATED' && user.role === 'AGENT') {
      return NextResponse.json(
        { error: 'Action impossible : Le rapport a déjà été validé par le centre de sécurité.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const photoDataUrl = body.photo_url || body.data_url;
    const caption = sanitizeString(body.caption || '', 200);

    if (!photoDataUrl || typeof photoDataUrl !== 'string') {
      return NextResponse.json({ error: 'Donnée photo manquante ou invalide.' }, { status: 400 });
    }

    // Validation MIME et taille
    const isMimeAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => photoDataUrl.startsWith(prefix));
    if (!isMimeAllowed) {
      return NextResponse.json(
        { error: 'Format photo non supporté. Formats acceptés : JPEG, PNG, WebP.' },
        { status: 400 }
      );
    }

    if (photoDataUrl.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { error: 'Taille de fichier excessive. La taille maximale autorisée est de 5 Mo par photo.' },
        { status: 400 }
      );
    }

    const currentPhotos = access.proof.report.photos || [];
    if (currentPhotos.length >= 6) {
      return NextResponse.json(
        { error: 'Nombre maximal de photos atteint (6 photos maximum par dossier d’intervention).' },
        { status: 400 }
      );
    }

    const newPhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      url: photoDataUrl,
      caption: caption || 'Photographie constatation terrain',
      timestamp: new Date().toISOString(),
      author_name: user.role === 'AGENT' ? 'Agent Patrouilleur' : 'Superviseur SOC',
    };

    const updatedPhotos = [...currentPhotos, newPhoto];
    const currentReport = access.proof.report;
    currentReport.photos = updatedPhotos;

    const serializedReport = serializeStructuredReport(currentReport);

    // Mise à jour en base
    if (access.intervention?.id) {
      await supabaseAdmin
        .from('interventions')
        .update({ report: serializedReport, updated_at: new Date().toISOString() })
        .eq('id', access.intervention.id);
    }

    await supabaseAdmin
      .from('alerts')
      .update({ resolution_report: serializedReport, updated_at: new Date().toISOString() })
      .eq('id', access.alert.id);

    // Journalisation d'audit
    await supabaseAdmin.from('alert_events').insert({
      alert_id: access.alert.id,
      actor_id: user.id,
      event_type: 'PHOTO_ADDED',
      comment: `Pièce justificative ajoutée au dossier : "${newPhoto.caption}"`,
      metadata: { photo_id: newPhoto.id, count: updatedPhotos.length },
    });

    return NextResponse.json({
      success: true,
      photo: newPhoto,
      total_photos: updatedPhotos.length,
      message: 'Photo horodatée ajoutée avec succès au dossier d’intervention.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de l’ajout de la photo au dossier');
  }
}

/**
 * DELETE /api/interventions/[id]/photos
 * Suppression d'une photo avant validation du rapport.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['AGENT', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get('photo_id');

    if (!id || !isValidUuid(id) || !photoId) {
      return NextResponse.json({ error: 'Paramètres manquants ou invalides.' }, { status: 400 });
    }

    const access = await resolveInterventionWithAccess(id, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!access.allowed || !access.proof) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (access.proof.report.report_status === 'REPORT_VALIDATED') {
      return NextResponse.json(
        { error: 'Action impossible : Le rapport a déjà été validé.' },
        { status: 400 }
      );
    }

    const currentPhotos = access.proof.report.photos || [];
    const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);

    const currentReport = access.proof.report;
    currentReport.photos = updatedPhotos;

    const serializedReport = serializeStructuredReport(currentReport);

    if (access.intervention?.id) {
      await supabaseAdmin
        .from('interventions')
        .update({ report: serializedReport, updated_at: new Date().toISOString() })
        .eq('id', access.intervention.id);
    }

    await supabaseAdmin
      .from('alerts')
      .update({ resolution_report: serializedReport, updated_at: new Date().toISOString() })
      .eq('id', access.alert.id);

    await supabaseAdmin.from('alert_events').insert({
      alert_id: access.alert.id,
      actor_id: user.id,
      event_type: 'PHOTO_REMOVED',
      comment: `Pièce justificative retirée du dossier (${photoId})`,
      metadata: { photo_id: photoId, remaining: updatedPhotos.length },
    });

    return NextResponse.json({
      success: true,
      remaining_photos: updatedPhotos.length,
      message: 'Photo retirée du dossier d’intervention.',
    });
  } catch (err: any) {
    return safeErrorResponse(err, 'Erreur interne lors de la suppression de la photo');
  }
}

/**
 * POST /api/interventions/[id]/signature
 * GET /api/interventions/[id]/signature
 * Soumission tactile et consultation de la signature électronique du rapport
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, isValidUuid, safeErrorResponse, checkRateLimit } from '@/lib/security/api-guard';
import { SignatureService } from '@/lib/signatures/signature-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'SECURITY_MANAGER', 'ADMIN', 'AGENT'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'ID intervention invalide' }, { status: 400 });
    }

    const signature = await SignatureService.getSignature(id, user);

    return NextResponse.json({
      success: true,
      has_signature: Boolean(signature),
      signature,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur récupération signature', err.status || 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['USER', 'SECURITY_MANAGER', 'ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !isValidUuid(id)) {
      return NextResponse.json({ error: 'ID intervention invalide' }, { status: 400 });
    }

    // Rate Limiting : max 5 signatures par minute
    const rl = await checkRateLimit(`sig_${user.id}`, 5, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de requêtes de signature. Veuillez patienter ${rl.resetInSeconds} secondes.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const userAgent = req.headers.get('user-agent') || undefined;
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

    const signature = await SignatureService.signIntervention(
      {
        intervention_id: id,
        signer_name: body.signer_name,
        signer_role: body.signer_role,
        signature_image: body.signature_image,
        consent: body.consent === true,
        consent_text: body.consent_text,
        user_agent: userAgent,
        ip_address: forwardedFor,
      },
      user
    );

    return NextResponse.json({
      success: true,
      message: 'Signature électronique enregistrée avec succès et empreinte SHA-256 certifiée.',
      signature,
    });
  } catch (err: any) {
    return safeErrorResponse(err, err.message || 'Erreur lors de la signature', err.status || 500);
  }
}

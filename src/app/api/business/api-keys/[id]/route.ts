import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/security/api-guard';
import { ApiKeyService } from '@/lib/api-keys/api-key-service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const orgId = user.organizationId || 'fa000000-0000-0000-0000-000000000001';

    const result = await ApiKeyService.revokeApiKey(id, orgId, user.id);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Erreur lors de la révocation' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Clé API révoquée avec succès.',
    });
  } catch (err: any) {
    console.error('Error revoking API key:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

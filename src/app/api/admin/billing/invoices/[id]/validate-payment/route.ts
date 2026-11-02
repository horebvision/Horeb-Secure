import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin } from '@/lib/security/api-guard';
import { InvoiceService } from '@/lib/billing/invoice-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/billing/invoices/[id]/validate-payment
 * Valide manuellement un règlement par virement/chèque (action réservée ADMIN)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    // Validation d'encaissement réservée aux Super Admins plateforme (jamais à l'admin du tenant facturé)
    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const { id: invoiceId } = await params;
    const body = await req.json().catch(() => ({}));
    const { reference, paymentMethod } = body;

    const invoice = await InvoiceService.markInvoiceAsPaid(invoiceId, {
      reference,
      paymentMethod,
      adminUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      invoice,
      message: `La facture ${invoice.invoiceNumber} a été marquée comme payée avec succès.`,
    });
  } catch (err: any) {
    console.error('Error validating manual payment:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de valider le règlement' },
      { status: 500 }
    );
  }
}

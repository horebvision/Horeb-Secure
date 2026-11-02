import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, getTenantOrgId } from '@/lib/security/api-guard';
import { InvoiceService } from '@/lib/billing/invoice-service';
import { PaymentGatewayManager } from '@/lib/billing/payment-provider';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/invoices
 * Retourne les factures de l'organisation avec isolation stricte
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const orgId = getTenantOrgId(user);
    const invoices = await InvoiceService.getInvoicesByOrganization(orgId);

    return NextResponse.json({
      success: true,
      invoices,
    });
  } catch (err: any) {
    console.error('Error fetching invoices:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de récupérer les factures' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/billing/invoices
 * Demande un paiement ou génère une facture d'abonnement
 */
export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const orgId = getTenantOrgId(user);
    const body = await req.json();
    const { invoiceId, action } = body;

    if (action === 'PAYMENT_REQUEST' && invoiceId) {
      const invoice = await InvoiceService.getInvoiceById(invoiceId, orgId);
      if (!invoice) {
        return NextResponse.json({ success: false, error: 'Facture introuvable' }, { status: 404 });
      }

      const intent = await PaymentGatewayManager.processPaymentRequest({
        invoiceId,
        organizationId: orgId,
        amount: invoice.total,
        currency: invoice.currency,
      });

      return NextResponse.json({
        success: true,
        paymentIntent: intent,
        isOnlinePaymentConfigured: PaymentGatewayManager.isOnlinePaymentConfigured(),
        message: PaymentGatewayManager.isOnlinePaymentConfigured()
          ? 'Session de paiement initiée.'
          : 'Paiement en ligne non configuré. Veuillez effectuer un virement bancaire avec le numéro de facture en référence.',
      });
    }

    return NextResponse.json({ success: false, error: 'Action non reconnue' }, { status: 400 });
  } catch (err: any) {
    console.error('Error processing invoice payment request:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Erreur lors du traitement de la facture' },
      { status: 500 }
    );
  }
}

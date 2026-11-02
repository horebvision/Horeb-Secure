import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { PaymentGatewayManager } from '@/lib/payments/payment-gateway-manager';
import { InvoiceService } from '@/lib/billing/invoice-service';
import type { PaymentProviderCode } from '@/lib/payments/types';

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER'],
    });
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const organizationId = user.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: 'Aucune organisation associée à cette session' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { invoice_id, invoiceId, provider_code, providerCode } = body;
    const targetInvoiceId = invoice_id || invoiceId;

    if (!targetInvoiceId) {
      return NextResponse.json(
        { error: 'Le champ invoice_id est obligatoire' },
        { status: 400 }
      );
    }

    // Récupération de la facture pour validation du montant et de l'organisation
    const invoice = await InvoiceService.getInvoiceById(targetInvoiceId, organizationId);
    if (!invoice) {
      return NextResponse.json(
        { error: 'Facture introuvable ou non autorisée' },
        { status: 404 }
      );
    }

    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { error: 'Cette facture a déjà été acquittée' },
        { status: 400 }
      );
    }

    const selectedProvider: PaymentProviderCode = provider_code || providerCode || 'OFFLINE_TRANSFER';

    const result = await PaymentGatewayManager.processPaymentRequest(
      {
        invoiceId: invoice.id,
        organizationId,
        amount: invoice.total,
        currency: invoice.currency,
        customerEmail: user.email,
        customerName: user.fullName,
      },
      selectedProvider
    );

    return NextResponse.json({
      success: true,
      payment: result,
    });
  } catch (err: any) {
    if (err.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
      return NextResponse.json(
        {
          error: 'Paiement en ligne temporairement indisponible',
          code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
          message: 'Veuillez utiliser la procédure de virement bancaire ou contacter le service commercial.',
        },
        { status: 503 }
      );
    }
    return safeErrorResponse(err);
  }
}

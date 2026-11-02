import { NextRequest, NextResponse } from 'next/server';
import { PaymentGatewayManager } from '@/lib/payments/payment-gateway-manager';
import { InvoiceService } from '@/lib/billing/invoice-service';
import { SubscriptionService } from '@/lib/billing/subscription-service';
import type { PaymentProviderCode } from '@/lib/payments/types';

const SUPPORTED_PROVIDERS: PaymentProviderCode[] = ['WAVE_CI'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const resolvedParams = await params;
    const providerCode = resolvedParams.provider.toUpperCase() as PaymentProviderCode;

    if (!SUPPORTED_PROVIDERS.includes(providerCode)) {
      return NextResponse.json({ error: 'Fournisseur de paiement inconnu' }, { status: 404 });
    }

    // Corps brut conservé tel quel : la signature HMAC porte sur ces octets exacts
    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
    }

    const headers: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headers[key.toLowerCase()] = val;
    });

    const result = await PaymentGatewayManager.processWebhook(providerCode, payload, headers, rawBody);

    if (result.isDuplicate) {
      return NextResponse.json({
        received: true,
        status: 'ALREADY_PROCESSED',
        message: result.message,
      });
    }

    // Acquittement uniquement si la facture existe, appartient à l'organisation annoncée
    // et que le montant/devise correspondent exactement.
    if (result.newStatus === 'SUCCEEDED' && result.invoiceId) {
      let processingError: string | undefined;
      try {
        const invoice = await InvoiceService.getInvoiceById(result.invoiceId);
        if (!invoice) {
          processingError = 'Facture introuvable';
        } else if (result.organizationId && invoice.organizationId !== result.organizationId) {
          processingError = 'Organisation de la facture non concordante';
        } else if (typeof result.amount !== 'number' || result.amount !== Math.round(Number(invoice.total))) {
          processingError = `Montant non concordant (reçu ${result.amount}, attendu ${invoice.total})`;
        } else if (result.currency && invoice.currency && result.currency !== invoice.currency) {
          processingError = 'Devise non concordante';
        } else if (invoice.status !== 'PAID') {
          await InvoiceService.markInvoiceAsPaid(
            result.invoiceId,
            result.transactionId || `tx_${result.eventId}`,
            providerCode
          );
          await SubscriptionService.reactivateSubscription(invoice.organizationId);
        }
      } catch (err: any) {
        processingError = err?.message || 'Erreur mise à jour facture/abonnement';
        console.error('[PaymentWebhook] Erreur mise à jour facture/abonnement:', err);
      }

      await PaymentGatewayManager.markWebhookProcessed(providerCode, String(result.eventId), processingError).catch(
        () => {}
      );

      if (processingError) {
        console.error('[PaymentWebhook] Paiement non appliqué:', processingError, { eventId: result.eventId });
        return NextResponse.json({ received: true, status: 'REJECTED', eventId: result.eventId });
      }
    } else if (result.handled) {
      await PaymentGatewayManager.markWebhookProcessed(providerCode, String(result.eventId)).catch(() => {});
    }

    return NextResponse.json({
      received: true,
      status: result.newStatus || 'PROCESSED',
      eventId: result.eventId,
    });
  } catch (err: any) {
    if (
      err.code === 'INVALID_WEBHOOK_SIGNATURE' ||
      err.code === 'INVALID_SIGNATURE' ||
      err.statusCode === 401
    ) {
      return NextResponse.json(
        { error: 'Signature invalide', code: 'INVALID_SIGNATURE' },
        { status: 401 }
      );
    }

    console.error('[PaymentWebhook] Erreur traitement webhook:', err);
    return NextResponse.json({ error: 'Erreur traitement webhook' }, { status: err.statusCode || 400 });
  }
}

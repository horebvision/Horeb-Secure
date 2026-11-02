import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin, safeErrorResponse } from '@/lib/security/api-guard';
import { ReconciliationService } from '@/lib/payments/reconciliation-service';
import { InvoiceService } from '@/lib/billing/invoice-service';

export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
    });
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const invoices = await InvoiceService.getInvoices();
    // Exécute la réconciliation sur les factures et transactions enregistrées
    const report = ReconciliationService.reconcile(invoices, []);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    return safeErrorResponse(err);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, requirePlatformAdmin } from '@/lib/security/api-guard';
import { InvoiceService } from '@/lib/billing/invoice-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/billing/invoices
 * Liste consolidée de l'ensemble des factures de toutes les organisations
 * Accès réservé aux Administrateurs de la Plateforme (Super Admin)
 */
export async function GET(req: NextRequest) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN'],
      allowTestFallback: true,
    });

    if (errorResponse || !user) {
      return errorResponse || NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const platformCheck = requirePlatformAdmin(user);
    if (!platformCheck.allowed) {
      return platformCheck.errorResponse;
    }

    const invoices = await InvoiceService.getAllInvoices();

    return NextResponse.json({
      success: true,
      invoices,
    });
  } catch (err: any) {
    console.error('Error fetching admin invoices:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Impossible de récupérer les factures administratives' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, safeErrorResponse } from '@/lib/security/api-guard';
import { InvoiceService } from '@/lib/billing/invoice-service';
import { FiscalPdfGenerator } from '@/lib/fiscal/fiscal-pdf-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await authenticateApiRequest(req, {
      allowedRoles: ['ADMIN', 'SECURITY_MANAGER', 'USER'],
    });
    if (errorResponse) return errorResponse;
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const resolvedParams = await params;
    const invoiceId = resolvedParams.id;
    const organizationId = user.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Aucune organisation rattachée à cette session' },
        { status: 400 }
      );
    }

    const invoice = await InvoiceService.getInvoiceById(invoiceId, organizationId);
    if (!invoice) {
      return NextResponse.json(
        { error: 'Facture introuvable ou non autorisée' },
        { status: 404 }
      );
    }

    const pdfBytes = FiscalPdfGenerator.generatePdf({
      invoice,
      organizationName: user.fullName || 'Organisation Abonnée',
    });

    const invNum = invoice.invoiceNumber || (invoice as any).invoice_number || invoice.id;
    const filename = `facture-${invNum}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  } catch (err: any) {
    return safeErrorResponse(err);
  }
}

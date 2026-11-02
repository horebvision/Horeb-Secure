import { NextRequest, NextResponse } from 'next/server';
import { CommercialLeadsService } from '@/lib/billing/commercial-leads-service';
import { checkRateLimit, sanitizeString } from '@/lib/security/api-guard';
import { getEffectiveSession } from '@/lib/auth/get-effective-session';
import type { LeadStatus } from '@/lib/billing/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/leads
 * Récupère les leads commerciaux (réservé ADMIN)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getEffectiveSession(req);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as LeadStatus | undefined;

    const leads = await CommercialLeadsService.getLeads(status || undefined);
    return NextResponse.json(leads);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/billing/leads
 * Enregistrement public d'une demande de démonstration ou devis Enterprise
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'public_lead_client';
    const rl = await checkRateLimit(`lead_submit_${ip}`, 10, 60000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter un instant.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const companyName = sanitizeString(body.companyName || body.company_name || '', 100);
    const contactName = sanitizeString(body.contactName || body.contact_name || '', 100);
    const jobTitle = sanitizeString(body.jobTitle || body.job_title || body.function || '', 100);
    const phone = sanitizeString(body.phone || '', 50);
    const email = sanitizeString(body.email || '', 100).toLowerCase();
    const city = sanitizeString(body.city || '', 80);
    const country = sanitizeString(body.country || 'Côte d’Ivoire', 80);
    const requestedPlan = sanitizeString(body.requestedPlan || body.plan || body.formula || '', 50);
    const agentsCount = Number(body.agentsCount || body.agents_count) || 0;
    const sitesCount = Number(body.sitesCount || body.sites_count) || 0;
    const clientsCount = Number(body.clientsCount || body.clients_count) || 0;
    const needs = sanitizeString(body.needs || body.notes || '', 500);
    const message = sanitizeString(body.message || '', 1000);

    if (!companyName || !phone || !email) {
      return NextResponse.json(
        { success: false, error: 'Le nom de l’entreprise, le téléphone et l’email professionnel sont requis.' },
        { status: 400 }
      );
    }

    // Validation stricte du format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Format d’adresse email invalide.' },
        { status: 400 }
      );
    }

    const lead = await CommercialLeadsService.createLead({
      companyName,
      contactName: contactName || companyName,
      jobTitle: jobTitle || undefined,
      phone,
      email,
      city: city || undefined,
      country: country || undefined,
      requestedPlan: requestedPlan || undefined,
      agentsCount,
      sitesCount,
      clientsCount,
      needs,
      message,
    });

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      lead,
      message: 'Votre demande a bien été enregistrée. L’équipe commerciale de HOREB SECURE vous contactera sous 24h ouvrées.',
    });
  } catch (err: any) {
    console.error('Error submitting commercial lead:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Erreur lors de l’enregistrement de votre demande' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/billing/leads
 * Met à jour le statut d'un lead (réservé ADMIN)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getEffectiveSession(req);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { leadId, status, notes } = body;

    if (!leadId || !status) {
      return NextResponse.json({ error: 'leadId et status sont obligatoires' }, { status: 400 });
    }

    const updated = await CommercialLeadsService.updateLeadStatus(leadId, status, notes);
    return NextResponse.json({ success: true, lead: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

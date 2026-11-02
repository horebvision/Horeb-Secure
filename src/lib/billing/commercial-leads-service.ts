/**
 * SECURIA V2 — PHASE 6 : SERVICE DES PROSPECTS & DEMANDES DE DÉMONSTRATION
 * Enregistrement serveur des demandes commerciales, qualification et traçabilité
 */

import { CommercialLead, LeadStatus } from './types';
import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';

export class CommercialLeadsService {
  private static memoryLeads: Map<string, CommercialLead> = new Map();

  /**
   * Enregistre une nouvelle demande de démonstration ou contact commercial
   */
  public static async createLead(params: {
    companyName: string;
    contactName: string;
    jobTitle?: string;
    phone: string;
    email: string;
    city?: string;
    country?: string;
    requestedPlan?: string;
    agentsCount?: number;
    sitesCount?: number;
    clientsCount?: number;
    needs?: string;
    message?: string;
  }): Promise<CommercialLead> {
    if (!params.companyName || !params.phone || !params.email) {
      throw new Error('Nom de l’entreprise, téléphone et email sont obligatoires.');
    }

    const lead: CommercialLead = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      companyName: params.companyName.trim(),
      contactName: params.contactName.trim(),
      jobTitle: params.jobTitle?.trim(),
      phone: params.phone.trim(),
      email: params.email.trim().toLowerCase(),
      city: params.city?.trim(),
      country: params.country?.trim() || 'Côte d’Ivoire',
      requestedPlan: params.requestedPlan?.trim(),
      agentsCount: params.agentsCount || 0,
      sitesCount: params.sitesCount || 0,
      clientsCount: params.clientsCount || 0,
      needs: params.needs || '',
      message: params.message || '',
      status: 'NEW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.memoryLeads.set(lead.id, lead);

    try {
      if (isRealServiceRoleKey()) {
        const enrichedNotes = [
          params.jobTitle ? `Fonction: ${params.jobTitle}` : null,
          params.city ? `Ville: ${params.city}` : null,
          params.country ? `Pays: ${params.country}` : null,
          params.requestedPlan ? `Formule: ${params.requestedPlan}` : null,
        ].filter(Boolean).join(' | ');

        const { error: insertErr } = await supabaseAdmin.from('commercial_leads').insert({
          id: lead.id,
          company_name: lead.companyName,
          contact_name: lead.contactName,
          phone: lead.phone,
          email: lead.email,
          agents_count: lead.agentsCount,
          sites_count: lead.sitesCount,
          clients_count: lead.clientsCount,
          needs: lead.needs,
          message: lead.message,
          notes: enrichedNotes || null,
          status: lead.status,
          created_at: lead.createdAt,
        });

        if (insertErr) {
          console.error('[CommercialLeadsService] Erreur insertion commercial_leads:', insertErr);
        }

        await supabaseAdmin.from('audit_logs').insert({
          action: 'COMMERCIAL_LEAD_SUBMITTED',
          entity_type: 'LEAD',
          entity_id: lead.id,
          details: {
            companyName: lead.companyName,
            email: lead.email,
            phone: lead.phone,
          },
        });
      }
    } catch (e) {
      console.warn('[CommercialLeadsService] Sauvegarde DB lead:', e);
    }

    return lead;
  }

  /**
   * Récupère la liste des demandes de démo (réservé ADMIN)
   */
  public static async getLeads(statusFilter?: LeadStatus): Promise<CommercialLead[]> {
    try {
      if (isRealServiceRoleKey()) {
        let query = supabaseAdmin
          .from('commercial_leads')
          .select('*')
          .order('created_at', { ascending: false });

        if (statusFilter) {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          const dbLeads: CommercialLead[] = data.map(r => ({
            id: r.id,
            companyName: r.company_name,
            contactName: r.contact_name,
            phone: r.phone,
            email: r.email,
            agentsCount: r.agents_count,
            sitesCount: r.sites_count,
            clientsCount: r.clients_count,
            needs: r.needs,
            message: r.message,
            status: r.status as LeadStatus,
            assignedTo: r.assigned_to,
            organizationId: r.organization_id,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }));

          // Synchroniser le cache mémoire
          for (const item of dbLeads) {
            this.memoryLeads.set(item.id, item);
          }

          return dbLeads;
        } else if (error) {
          console.warn('[CommercialLeadsService] Erreur lecture leads DB:', error);
        }
      }
    } catch (err) {
      console.warn('[CommercialLeadsService] Exception lecture leads:', err);
    }

    const all = Array.from(this.memoryLeads.values());
    return statusFilter ? all.filter(l => l.status === statusFilter) : all;
  }

  /**
   * Met à jour le statut d'un prospect (ex: QUALIFIED, DEMO, WON, LOST)
   */
  public static async updateLeadStatus(
    leadId: string,
    status: LeadStatus,
    notes?: string
  ): Promise<CommercialLead> {
    const existing = this.memoryLeads.get(leadId);
    const updated: CommercialLead = existing
      ? { ...existing, status, notes: notes || existing.notes, updatedAt: new Date().toISOString() }
      : {
          id: leadId,
          companyName: 'Entreprise Prospect',
          contactName: 'Contact',
          phone: '',
          email: '',
          status,
          notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

    this.memoryLeads.set(leadId, updated);

    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin
          .from('commercial_leads')
          .update({ status, notes, updated_at: new Date().toISOString() })
          .eq('id', leadId);
      }
    } catch {}

    return updated;
  }
}

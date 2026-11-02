/**
 * SECURIA V2.12.0 — SERVICE DE SECRÉTARIAT & REGISTRE DES VISITEURS
 * Accueil interne de la société de sécurité (Multi-tenant, Anti-IDOR, Stockage Privé, Audit)
 */

import { supabaseAdmin, isRealServiceRoleKey } from '@/lib/supabase/admin';
import type {
  VisitorVisit,
  VisitorPerson,
  VisitorIdentityDocument,
  CreateVisitInput,
  VisitStatus,
  SecretariatStats,
} from './types';
import crypto from 'crypto';

export class SecretariatService {
  /**
   * Générateur de référence de visite sécurisée et lisible (ex: SEC-2610-A1B2)
   */
  public static generateVisitReference(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `SEC-${yy}${mm}-${randomHex}`;
  }

  /**
   * Extrait les 4 derniers caractères d'un numéro pour l'affichage masqué sécurisé
   */
  public static maskIdentityNumber(num?: string | null): { last4: string | null; masked: string | null } {
    if (!num || !num.trim()) return { last4: null, masked: null };
    const clean = num.trim();
    const last4 = clean.slice(-4);
    const masked = clean.length > 4 ? `•••• •••• ${last4}` : `•••• ${last4}`;
    return { last4, masked };
  }

  /**
   * Liste les visites d'une organisation avec pagination et filtres
   */
  public static async listVisits(
    organizationId: string,
    params?: {
      status?: VisitStatus;
      search?: string;
      siteId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ visits: VisitorVisit[]; total: number; page: number; limit: number }> {
    if (!organizationId) {
      return { visits: [], total: 0, page: 1, limit: 50 };
    }

    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(100, Math.max(1, params?.limit || 20));
    const offset = (page - 1) * limit;

    try {
      if (isRealServiceRoleKey()) {
        let query = supabaseAdmin
          .from('visitor_visits')
          .select(
            `
            *,
            site:protected_sites(id, name),
            creator:users(id, full_name, email),
            people:visitor_visit_people(*)
          `,
            { count: 'exact' }
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (params?.status) {
          query = query.eq('status', params.status);
        }

        if (params?.siteId) {
          query = query.eq('site_id', params.siteId);
        }

        if (params?.startDate) {
          query = query.gte('created_at', params.startDate);
        }

        if (params?.endDate) {
          query = query.lte('created_at', params.endDate);
        }

        if (params?.search && params.search.trim()) {
          const q = params.search.trim();
          query = query.or(
            `visit_reference.ilike.%${q}%,host_name.ilike.%${q}%,host_department.ilike.%${q}%,visitor_company.ilike.%${q}%`
          );
        }

        const { data, count, error } = await query.range(offset, offset + limit - 1);

        if (error) {
          console.warn('[SecretariatService] Erreur listVisits:', error.message);
          return { visits: [], total: 0, page, limit };
        }

        const visits: VisitorVisit[] = (data || []).map((row: any) => ({
          id: row.id,
          organization_id: row.organization_id,
          site_id: row.site_id,
          site_name: row.site?.name || null,
          visit_reference: row.visit_reference,
          visit_reason: row.visit_reason,
          host_name: row.host_name,
          host_department: row.host_department,
          visitor_company: row.visitor_company,
          status: row.status,
          notes: row.notes,
          created_by: row.created_by,
          created_by_name: row.creator?.full_name || row.creator?.email || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
          people_count: row.people?.length || 0,
          people: (row.people || []).map((p: any) => ({
            id: p.id,
            organization_id: p.organization_id,
            visit_id: p.visit_id,
            full_name: p.full_name,
            phone: p.phone,
            identity_document_type: p.identity_document_type,
            identity_number_last4: p.identity_number_last4,
            identity_number_encrypted: p.identity_number_encrypted,
            identity_expiry_date: p.identity_expiry_date,
            arrival_at: p.arrival_at,
            departure_at: p.departure_at,
            duration_minutes: p.duration_minutes,
            signature_storage_path: p.signature_storage_path,
            signature_data_url: p.signature_data_url,
            signed_at: p.signed_at,
            signature_consent: p.signature_consent,
            signature_status: p.signature_status,
            signature_refusal_reason: p.signature_refusal_reason,
            status: p.status,
            created_at: p.created_at,
            updated_at: p.updated_at,
          })),
        }));

        return { visits, total: count || visits.length, page, limit };
      }
    } catch (e) {
      console.warn('[SecretariatService] Exception listVisits:', e);
    }

    return { visits: [], total: 0, page, limit };
  }

  /**
   * Récupère le détail complet d'une visite avec vérification Anti-IDOR
   */
  public static async getVisitById(
    visitId: string,
    organizationId: string
  ): Promise<VisitorVisit | null> {
    if (!visitId || !organizationId) return null;

    try {
      if (isRealServiceRoleKey()) {
        const { data, error } = await supabaseAdmin
          .from('visitor_visits')
          .select(
            `
            *,
            site:protected_sites(id, name),
            creator:users(id, full_name, email),
            people:visitor_visit_people(
              *,
              documents:visitor_identity_documents(*)
            )
          `
          )
          .eq('id', visitId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (error || !data) return null;

        const visit: VisitorVisit = {
          id: data.id,
          organization_id: data.organization_id,
          site_id: data.site_id,
          site_name: data.site?.name || null,
          visit_reference: data.visit_reference,
          visit_reason: data.visit_reason,
          host_name: data.host_name,
          host_department: data.host_department,
          visitor_company: data.visitor_company,
          status: data.status,
          notes: data.notes,
          created_by: data.created_by,
          created_by_name: data.creator?.full_name || data.creator?.email || null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          people_count: data.people?.length || 0,
          people: (data.people || []).map((p: any) => ({
            id: p.id,
            organization_id: p.organization_id,
            visit_id: p.visit_id,
            full_name: p.full_name,
            phone: p.phone,
            identity_document_type: p.identity_document_type,
            identity_number_last4: p.identity_number_last4,
            identity_number_encrypted: p.identity_number_encrypted,
            identity_expiry_date: p.identity_expiry_date,
            arrival_at: p.arrival_at,
            departure_at: p.departure_at,
            duration_minutes: p.duration_minutes,
            signature_storage_path: p.signature_storage_path,
            signature_data_url: p.signature_data_url,
            signed_at: p.signed_at,
            signature_consent: p.signature_consent,
            signature_status: p.signature_status,
            signature_refusal_reason: p.signature_refusal_reason,
            status: p.status,
            created_at: p.created_at,
            updated_at: p.updated_at,
            documents: (p.documents || []).map((d: any) => ({
              id: d.id,
              organization_id: d.organization_id,
              visitor_person_id: d.visitor_person_id,
              document_type: d.document_type,
              storage_path: d.storage_path,
              file_size_bytes: d.file_size_bytes,
              mime_type: d.mime_type,
              captured_at: d.captured_at,
              uploaded_by: d.uploaded_by,
              retention_until: d.retention_until,
              deleted_at: d.deleted_at,
              created_at: d.created_at,
            })),
          })),
        };

        return visit;
      }
    } catch (e) {
      console.warn('[SecretariatService] Exception getVisitById:', e);
    }

    return null;
  }

  /**
   * Enregistre une nouvelle visite à l'accueil avec prise en charge multi-visiteurs,
   * stockage privé des pièces d'identité et signatures individuelles.
   */
  public static async createVisit(
    organizationId: string,
    input: CreateVisitInput,
    actorUserId?: string
  ): Promise<VisitorVisit> {
    if (!organizationId) {
      throw new Error('Identifiant d’organisation obligatoire.');
    }
    if (!input.people || input.people.length === 0) {
      throw new Error('Au moins un visiteur doit être enregistré.');
    }

    const visitId = crypto.randomUUID();
    const visitReference = this.generateVisitReference();
    const now = new Date().toISOString();

    // 1. Persister la visite parente
    const { data: createdVisitRow, error: visitErr } = await supabaseAdmin
      .from('visitor_visits')
      .insert({
        id: visitId,
        organization_id: organizationId,
        site_id: input.site_id || null,
        visit_reference: visitReference,
        visit_reason: input.visit_reason || 'RENDEZ_VOUS',
        host_name: input.host_name?.trim() || null,
        host_department: input.host_department?.trim() || null,
        visitor_company: input.visitor_company?.trim() || null,
        status: 'PRESENT',
        notes: input.notes?.trim() || null,
        created_by: actorUserId || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (visitErr || !createdVisitRow) {
      throw new Error(`Erreur enregistrement visite: ${visitErr?.message || 'Inconnue'}`);
    }

    const createdPeople: VisitorPerson[] = [];

    // 2. Traiter chaque visiteur individuellement
    for (const p of input.people) {
      const personId = crypto.randomUUID();
      const { last4, masked } = this.maskIdentityNumber(p.identity_number);

      // Traitement signature
      let signaturePath: string | null = null;
      let signatureDataUrl: string | null = null;
      let signedAt: string | null = null;
      const signatureStatus = p.signature_status || (p.signature_data ? 'SIGNED' : 'UNSIGNED');

      if (p.signature_data && signatureStatus === 'SIGNED') {
        signatureDataUrl = p.signature_data;
        signedAt = now;
        try {
          // Uploader dans le bucket privé Supabase documents
          const base64Data = p.signature_data.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const sigStorageKey = `secretariat/${organizationId}/visits/${visitId}/signatures/${personId}.png`;
          const { error: uploadSigErr } = await supabaseAdmin.storage
            .from('documents')
            .upload(sigStorageKey, buffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (!uploadSigErr) {
            signaturePath = sigStorageKey;
          }
        } catch (sigErr) {
          console.warn('[SecretariatService] Note upload signature storage:', sigErr);
        }
      }

      // Insertion personne
      const { data: personRow, error: personErr } = await supabaseAdmin
        .from('visitor_visit_people')
        .insert({
          id: personId,
          organization_id: organizationId,
          visit_id: visitId,
          full_name: p.full_name.trim(),
          phone: p.phone?.trim() || null,
          identity_document_type: p.identity_document_type || 'CNI',
          identity_number_last4: last4,
          identity_number_encrypted: masked,
          identity_expiry_date: p.identity_expiry_date || null,
          arrival_at: now,
          departure_at: null,
          duration_minutes: null,
          signature_storage_path: signaturePath,
          signature_data_url: signatureDataUrl,
          signed_at: signedAt,
          signature_consent: Boolean(p.signature_consent),
          signature_status: signatureStatus,
          signature_refusal_reason: p.signature_refusal_reason?.trim() || null,
          status: 'PRESENT',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (personErr || !personRow) {
        console.error('[SecretariatService] Erreur insertion visiteur:', personErr);
        continue;
      }

      const docs: VisitorIdentityDocument[] = [];

      // Traitement des photos de pièces d'identité (Recto & Verso)
      if (p.recto_photo_data) {
        const docRecto = await this.saveIdentityPhoto({
          organizationId,
          visitId,
          personId,
          documentType: 'RECTO',
          photoData: p.recto_photo_data,
          actorUserId,
        });
        if (docRecto) docs.push(docRecto);
      }

      if (p.verso_photo_data) {
        const docVerso = await this.saveIdentityPhoto({
          organizationId,
          visitId,
          personId,
          documentType: 'VERSO',
          photoData: p.verso_photo_data,
          actorUserId,
        });
        if (docVerso) docs.push(docVerso);
      }

      createdPeople.push({
        id: personRow.id,
        organization_id: personRow.organization_id,
        visit_id: personRow.visit_id,
        full_name: personRow.full_name,
        phone: personRow.phone,
        identity_document_type: personRow.identity_document_type,
        identity_number_last4: personRow.identity_number_last4,
        identity_number_encrypted: personRow.identity_number_encrypted,
        identity_expiry_date: personRow.identity_expiry_date,
        arrival_at: personRow.arrival_at,
        departure_at: personRow.departure_at,
        duration_minutes: personRow.duration_minutes,
        signature_storage_path: personRow.signature_storage_path,
        signature_data_url: personRow.signature_data_url,
        signed_at: personRow.signed_at,
        signature_consent: personRow.signature_consent,
        signature_status: personRow.signature_status,
        signature_refusal_reason: personRow.signature_refusal_reason,
        status: personRow.status,
        created_at: personRow.created_at,
        updated_at: personRow.updated_at,
        documents: docs,
      });
    }

    // 3. Journalisation d'audit immuable
    await this.logAudit({
      action: 'VISIT_CREATED',
      organizationId,
      entityId: visitId,
      actorUserId,
      details: {
        visit_reference: visitReference,
        visit_reason: input.visit_reason,
        people_count: createdPeople.length,
        host_name: input.host_name,
      },
    });

    const fullVisit = await this.getVisitById(visitId, organizationId);
    return (
      fullVisit || {
        id: createdVisitRow.id,
        organization_id: createdVisitRow.organization_id,
        site_id: createdVisitRow.site_id,
        visit_reference: createdVisitRow.visit_reference,
        visit_reason: createdVisitRow.visit_reason,
        host_name: createdVisitRow.host_name,
        host_department: createdVisitRow.host_department,
        visitor_company: createdVisitRow.visitor_company,
        status: createdVisitRow.status,
        notes: createdVisitRow.notes,
        created_by: createdVisitRow.created_by,
        created_at: createdVisitRow.created_at,
        updated_at: createdVisitRow.updated_at,
        people_count: createdPeople.length,
        people: createdPeople,
      }
    );
  }

  /**
   * Sauvegarde une photo de pièce d'identité dans le bucket privé et enregistre les métadonnées
   */
  private static async saveIdentityPhoto(params: {
    organizationId: string;
    visitId: string;
    personId: string;
    documentType: 'RECTO' | 'VERSO';
    photoData: string;
    actorUserId?: string;
  }): Promise<VisitorIdentityDocument | null> {
    const { organizationId, visitId, personId, documentType, photoData, actorUserId } = params;
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const storageKey = `secretariat/${organizationId}/visits/${visitId}/docs/${personId}_${documentType.toLowerCase()}.jpg`;

      // Upload dans le bucket privé Supabase documents
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('documents')
        .upload(storageKey, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadErr) {
        console.warn('[SecretariatService] Erreur upload pièce storage:', uploadErr.message);
      }

      const { data: docRow, error: docErr } = await supabaseAdmin
        .from('visitor_identity_documents')
        .insert({
          id: docId,
          organization_id: organizationId,
          visitor_person_id: personId,
          document_type: documentType,
          storage_path: storageKey,
          file_size_bytes: buffer.length,
          mime_type: 'image/jpeg',
          captured_at: now,
          uploaded_by: actorUserId || null,
          retention_until: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
          created_at: now,
        })
        .select()
        .single();

      if (docErr || !docRow) {
        console.warn('[SecretariatService] Note insertion visitor_identity_documents:', docErr);
        return null;
      }

      await this.logAudit({
        action: 'IDENTITY_PHOTO_UPLOADED',
        organizationId,
        entityId: docId,
        actorUserId,
        details: {
          person_id: personId,
          document_type: documentType,
          storage_path: storageKey,
        },
      });

      return docRow as VisitorIdentityDocument;
    } catch (e) {
      console.warn('[SecretariatService] Exception saveIdentityPhoto:', e);
      return null;
    }
  }

  /**
   * Enregistre la sortie d'un visiteur individuel avec calcul de durée serveur
   */
  public static async checkoutPerson(
    personId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<{ success: boolean; person: any; duration_minutes: number }> {
    if (!personId || !organizationId) {
      throw new Error('Identifiant visiteur et organisation requis.');
    }

    // 1. Appel de la procédure atomique RPC Postgres
    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('checkout_visitor_person', {
      p_person_id: personId,
      p_actor_user_id: actorUserId || null,
    });

    if (rpcRes && !rpcRes.success) {
      throw new Error(rpcRes.error || 'Ce visiteur a déjà été enregistré en sortie.');
    }

    if (rpcErr) {
      // Fallback applicatif si RPC indisponible (ex: environnement local mock)
      const now = new Date();
      const { data: person, error: findErr } = await supabaseAdmin
        .from('visitor_visit_people')
        .select('*')
        .eq('id', personId)
        .eq('organization_id', organizationId)
        .single();

      if (findErr || !person) {
        throw new Error('Visiteur introuvable.');
      }

      if (person.status === 'CHECKED_OUT') {
        throw new Error('Ce visiteur a déjà été enregistré en sortie.');
      }

      const arrivalTime = new Date(person.arrival_at).getTime();
      const duration = Math.max(1, Math.round((now.getTime() - arrivalTime) / (60 * 1000)));

      const { data: updatedPerson } = await supabaseAdmin
        .from('visitor_visit_people')
        .update({
          status: 'CHECKED_OUT',
          departure_at: now.toISOString(),
          duration_minutes: duration,
          updated_at: now.toISOString(),
        })
        .eq('id', personId)
        .select()
        .single();

      // Vérifier si toutes les personnes de la visite sont sorties
      const { data: remaining } = await supabaseAdmin
        .from('visitor_visit_people')
        .select('id')
        .eq('visit_id', person.visit_id)
        .eq('status', 'PRESENT');

      if (!remaining || remaining.length === 0) {
        await supabaseAdmin
          .from('visitor_visits')
          .update({ status: 'CHECKED_OUT', updated_at: now.toISOString() })
          .eq('id', person.visit_id);
      }

      await this.logAudit({
        action: 'VISITOR_CHECKED_OUT',
        organizationId,
        entityId: personId,
        actorUserId,
        details: { duration_minutes: duration, visit_id: person.visit_id },
      });

      return { success: true, person: updatedPerson, duration_minutes: duration };
    }

    return {
      success: true,
      person: rpcRes,
      duration_minutes: rpcRes.duration_minutes || 0,
    };
  }

  /**
   * Enregistre la sortie de tous les visiteurs encore présents d'une visite
   */
  public static async checkoutVisit(
    visitId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<{ checkedOutCount: number }> {
    const { data: people } = await supabaseAdmin
      .from('visitor_visit_people')
      .select('id, status')
      .eq('visit_id', visitId)
      .eq('organization_id', organizationId)
      .eq('status', 'PRESENT');

    if (!people || people.length === 0) {
      return { checkedOutCount: 0 };
    }

    let count = 0;
    for (const p of people) {
      try {
        await this.checkoutPerson(p.id, organizationId, actorUserId);
        count++;
      } catch (e) {
        console.warn(`[SecretariatService] Checkout visit person ${p.id}:`, e);
      }
    }

    return { checkedOutCount: count };
  }

  /**
   * Génère une URL signée éphémère (120 secondes) pour consulter un document privé
   */
  public static async getSignedDocumentUrl(
    documentId: string,
    organizationId: string,
    actorUserId?: string
  ): Promise<{ signedUrl: string; document: VisitorIdentityDocument }> {
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('visitor_identity_documents')
      .select('*')
      .eq('id', documentId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (docErr || !doc) {
      throw new Error('Document d’identité introuvable ou accès non autorisé.');
    }

    // Créer une URL signée courte (120 secondes)
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 120);

    if (signErr || !signedData?.signedUrl) {
      throw new Error('Impossible de générer l’accès sécurisé temporaire au document.');
    }

    // Journalisation d'audit de la consultation sensible
    await this.logAudit({
      action: 'IDENTITY_DOCUMENT_ACCESSED',
      organizationId,
      entityId: documentId,
      actorUserId,
      details: { document_type: doc.document_type, person_id: doc.visitor_person_id },
    });

    return {
      signedUrl: signedData.signedUrl,
      document: doc as VisitorIdentityDocument,
    };
  }

  /**
   * Calcule les indicateurs statistiques temps réel du secrétariat
   */
  public static async getSecretariatStats(organizationId: string): Promise<SecretariatStats> {
    if (!organizationId) {
      return {
        currently_present: 0,
        today_arrivals: 0,
        today_departures: 0,
        active_visits_count: 0,
        average_duration_minutes: 0,
      };
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayIso = startOfToday.toISOString();

    try {
      if (isRealServiceRoleKey()) {
        // 1. Personnes actuellement présentes
        const { count: presentCount } = await supabaseAdmin
          .from('visitor_visit_people')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'PRESENT');

        // 2. Arrivées du jour
        const { count: todayArrivals } = await supabaseAdmin
          .from('visitor_visit_people')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('arrival_at', todayIso);

        // 3. Départs du jour
        const { count: todayDepartures } = await supabaseAdmin
          .from('visitor_visit_people')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('departure_at', todayIso);

        // 4. Visites en cours
        const { count: activeVisits } = await supabaseAdmin
          .from('visitor_visits')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'PRESENT');

        // 5. Durée moyenne des visites clôturées aujourd'hui
        const { data: durations } = await supabaseAdmin
          .from('visitor_visit_people')
          .select('duration_minutes')
          .eq('organization_id', organizationId)
          .eq('status', 'CHECKED_OUT')
          .gte('departure_at', todayIso);

        let avgMinutes = 0;
        if (durations && durations.length > 0) {
          const validDurations = durations
            .map((d) => d.duration_minutes)
            .filter((d): d is number => typeof d === 'number' && d > 0);
          if (validDurations.length > 0) {
            const sum = validDurations.reduce((acc, v) => acc + v, 0);
            avgMinutes = Math.round(sum / validDurations.length);
          }
        }

        return {
          currently_present: presentCount || 0,
          today_arrivals: todayArrivals || 0,
          today_departures: todayDepartures || 0,
          active_visits_count: activeVisits || 0,
          average_duration_minutes: avgMinutes,
        };
      }
    } catch (e) {
      console.warn('[SecretariatService] Exception getSecretariatStats:', e);
    }

    return {
      currently_present: 0,
      today_arrivals: 0,
      today_departures: 0,
      active_visits_count: 0,
      average_duration_minutes: 0,
    };
  }

  /**
   * Helper journalisation d'audit immuable
   */
  private static async logAudit(params: {
    action: string;
    organizationId: string;
    entityId: string;
    actorUserId?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      if (isRealServiceRoleKey()) {
        await supabaseAdmin.from('audit_logs').insert({
          id: crypto.randomUUID(),
          user_id: (params.actorUserId || '00000000-0000-0000-0000-000000000000') as any,
          action: params.action,
          entity_type: 'secretariat',
          entity_id: params.entityId,
          details: {
            organization_id: params.organizationId,
            ...(params.details || {}),
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Tolérance audit
    }
  }
}

export const secretariatService = SecretariatService;

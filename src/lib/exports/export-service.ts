/**
 * SECURIA V2 — EXPORT SERVICE
 * Moteur d'exportation multi-rapports, exécution des filtres côté serveur,
 * contrôle strict multi-tenant et limitation des ressources.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveInterventionWithAccess } from '@/lib/interventions';
import { ProofOfIntervention } from '@/lib/interventions/types';
import { ExportFilters, ExportPreviewSummary, ExportJob } from './types';
import { generateInterventionsCsv, proofToCsvRow } from './csv-builder';
import { buildExportZipBuffer } from './zip-builder';
import { ExportRepository } from './repository';
import { calculateAlertSla } from '@/lib/sla';

export class ExportService {
  /**
   * Récupère la liste des interventions filtrées selon les autorisations RBAC de l'utilisateur
   */
  static async queryInterventions(
    filters: ExportFilters,
    user: { id: string; role: string; organizationId?: string | null }
  ): Promise<any[]> {
    // 1. Contrôle RBAC
    if (user.role === 'AGENT') {
      throw new Error('Habilitation insuffisante : les patrouilleurs ne sont pas autorisés à générer des exports massifs.');
    }

    let query = supabaseAdmin
      .from('alerts')
      .select(`
        *,
        users:user_id (id, full_name, email, phone, organization_id),
        protected_sites:site_id (id, name, address, city, latitude, longitude, organization_id, owner_id),
        security_agents:assigned_agent_id (id, user_id, badge_number, patrol_vehicle, duty_status, users:user_id(id, full_name, phone)),
        interventions:interventions!fk_interventions_alert (id, alert_id, agent_id, status, report, resolved_at, created_at, assigned_at, accepted_at, en_route_at, arrived_at)
      `)
      .order('created_at', { ascending: false });

    // 2. Cloisonnement Multi-Tenant (Anti-IDOR)
    if (user.role === 'USER') {
      // Un client ne peut voir que ses propres alertes
      query = query.eq('user_id', user.id);
    } else if (user.role === 'SECURITY_MANAGER' && user.organizationId) {
      // Un superviseur SOC ne peut voir que les alertes de son organisation
      query = query.eq('organization_id', user.organizationId);
    }

    // 3. Filtres temporels
    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    // 4. Filtre par site
    if (filters.siteId) {
      query = query.eq('site_id', filters.siteId);
    }

    // 5. Filtre par statut
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // 6. Filtre par type d'incident
    if (filters.incidentType) {
      query = query.eq('type', filters.incidentType);
    }

    // 7. Filtre par sévérité / priorité
    if (filters.severity) {
      query = query.eq('priority', filters.severity);
    }

    // 8. Filtre par agent
    if (filters.agentId) {
      query = query.eq('assigned_agent_id', filters.agentId);
    }

    // Limite de sécurité anti-débordement mémoire (Section 51 : max 500)
    query = query.limit(500);

    const { data: alerts, error } = await query;
    if (error) {
      console.error('[ExportService] Erreur requête SQL:', error);
      throw new Error(`Erreur lors du filtrage des interventions : ${error.message}`);
    }

    let results = alerts || [];

    // 9. Recherche textuelle (recherche sur numéro d'alerte ou ID)
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      results = results.filter((a: any) =>
        (a.alert_number && a.alert_number.toLowerCase().includes(q)) ||
        (a.id && a.id.toLowerCase().includes(q)) ||
        (a.protected_sites?.name && a.protected_sites.name.toLowerCase().includes(q))
      );
    }

    // 10. Filtre SLA si demandé (calculé)
    if (filters.slaStatus) {
      results = results.filter((alert: any) => {
        const sla = calculateAlertSla({
          id: alert.id,
          alert_number: alert.alert_number,
          status: alert.status,
          created_at: alert.created_at,
          acknowledged_at: alert.acknowledged_at,
          assigned_at: alert.assigned_at,
          en_route_at: alert.en_route_at,
          arrived_at: alert.arrived_at,
          resolved_at: alert.resolved_at,
        });
        return sla.overallStatus === filters.slaStatus || sla.steps.ARRIVAL.status === filters.slaStatus;
      });
    }

    return results;
  }

  /**
   * Prévisualisation des résultats d'export (Section 7)
   */
  static async getPreviewSummary(
    filters: ExportFilters,
    user: { id: string; role: string; organizationId?: string | null }
  ): Promise<ExportPreviewSummary> {
    const alerts = await this.queryInterventions(filters, user);

    let slaRespected = 0;
    let slaBreached = 0;
    const siteIds = new Set<string>();

    const items = alerts.map((a: any) => {
      if (a.site_id) siteIds.add(a.site_id);

      const sla = calculateAlertSla({
        id: a.id,
        alert_number: a.alert_number,
        status: a.status,
        created_at: a.created_at,
        acknowledged_at: a.acknowledged_at,
        assigned_at: a.assigned_at,
        en_route_at: a.en_route_at,
        arrived_at: a.arrived_at,
        resolved_at: a.resolved_at,
      });

      if (sla.steps.ARRIVAL.status === 'COMPLETED') {
        slaRespected++;
      } else if (sla.steps.ARRIVAL.status === 'BREACHED') {
        slaBreached++;
      }

      return {
        id: a.id,
        number: a.alert_number || `SEC-${a.id.slice(0, 8)}`,
        date: a.created_at,
        site_name: a.protected_sites?.name || 'Site Protégé',
        client_name: a.users?.full_name || 'Client',
        incident_type: a.type,
        status: a.status,
        sla_status: sla.steps.ARRIVAL.status,
      };
    });

    return {
      total_count: items.length,
      period: {
        start: filters.startDate || (items.length ? items[items.length - 1].date : null),
        end: filters.endDate || (items.length ? items[0].date : null),
      },
      sites_count: siteIds.size,
      sla_respected_count: slaRespected,
      sla_breached_count: slaBreached,
      interventions: items.slice(0, 50), // 50 premiers items pour le résumé visuel
    };
  }

  /**
   * Exécute la génération de l'export (CSV + ZIP)
   */
  static async executeExport(
    filters: ExportFilters,
    user: { id: string; role: string; organizationId?: string | null }
  ): Promise<{
    job: ExportJob;
    downloadUrl?: string;
    isImmediate: boolean;
    totalItems: number;
    csvPreview?: string;
  }> {
    // 1. Audit : EXPORT_REQUESTED
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'EXPORT_REQUESTED',
      entity_type: 'export_jobs',
      entity_id: user.id,
      details: {
        filters,
        requested_by: user.id,
        role: user.role,
        timestamp: new Date().toISOString(),
      },
    });

    // 2. Récupération des interventions
    const rawAlerts = await this.queryInterventions(filters, user);
    const totalItems = rawAlerts.length;

    const orgId = user.organizationId || (rawAlerts[0]?.organization_id) || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

    // 3. Création du Job
    const job = await ExportRepository.createJob({
      organization_id: orgId,
      requested_by: user.id,
      filters,
      total_items: totalItems,
    });

    if (totalItems === 0) {
      await ExportRepository.updateJobStatus(job.id, 'COMPLETED', {
        processed_items: 0,
        completed_at: new Date().toISOString(),
      });
      return { job, isImmediate: true, totalItems: 0 };
    }

    // 4. Résolution complète des ProofOfIntervention
    const proofs: ProofOfIntervention[] = [];
    for (const alert of rawAlerts) {
      const res = await resolveInterventionWithAccess(alert.id, {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      });
      if (res.allowed && res.proof) {
        proofs.push(res.proof);
      }
    }

    // 5. Génération CSV récapitulatif
    const csvRows = proofs.map(p => proofToCsvRow(p, 'NOT_SIGNED'));
    const csvContent = generateInterventionsCsv(csvRows);

    // 6. Génération ZIP immédiate (si <= 25 items - Section 11)
    const isImmediate = totalItems <= 25;

    await ExportRepository.updateJobStatus(job.id, 'PROCESSING', {
      started_at: new Date().toISOString(),
    });

    try {
      const { buffer, filename } = await buildExportZipBuffer(proofs, {
        includePhotos: filters.includePhotos !== false,
      });

      // Stocker l'archive dans le bucket privé « exports » (accessible depuis toutes les instances)
      let storagePath: string | null = null;
      if (job.download_token) {
        storagePath = await ExportRepository.storeDownloadBuffer(job.download_token, job.id, buffer, filename);
      }

      await ExportRepository.updateJobStatus(job.id, 'COMPLETED', {
        processed_items: proofs.length,
        completed_at: new Date().toISOString(),
        file_path: storagePath || filename,
      });

      // Audit : EXPORT_COMPLETED
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'EXPORT_COMPLETED',
        entity_type: 'export_jobs',
        entity_id: job.id,
        details: {
          job_id: job.id,
          total_items: proofs.length,
          filename,
          timestamp: new Date().toISOString(),
        },
      });

      const downloadUrl = `/api/exports/${job.id}/download?token=${job.download_token}`;

      return {
        job,
        downloadUrl,
        isImmediate,
        totalItems: proofs.length,
        csvPreview: csvContent.slice(0, 1000),
      };
    } catch (err: any) {
      console.error('[ExportService] Erreur génération ZIP:', err);
      await ExportRepository.updateJobStatus(job.id, 'FAILED', {
        error_message: err.message || 'Erreur lors de la compression de l’archive ZIP',
      });
      // Audit : EXPORT_FAILED
      await supabaseAdmin.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        action: 'EXPORT_FAILED',
        entity_type: 'export_jobs',
        entity_id: job.id,
        details: { error: err.message, timestamp: new Date().toISOString() },
      });
      throw err;
    }
  }
}

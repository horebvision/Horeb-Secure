/**
 * SECURIA V2 — EXPORT JOBS REPOSITORY & STORAGE
 * Persistance résiliente pour les jobs d'exportation avec gestion d'expiration et download tokens.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ExportJob, ExportStatus } from './types';
import crypto from 'crypto';

// Cache en mémoire pour livraison rapide et tests
const inMemoryExportJobs = new Map<string, ExportJob>();
const inMemoryTokens = new Map<string, { jobId: string; buffer: Buffer; filename: string; expiresAt: number }>();
const EXPORTS_BUCKET = 'exports';

export class ExportRepository {
  /**
   * Crée un nouveau job d'export
   */
  static async createJob(job: Omit<ExportJob, 'id' | 'created_at' | 'expires_at' | 'status' | 'processed_items'>): Promise<ExportJob> {
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
    const downloadToken = crypto.randomBytes(32).toString('hex');

    const newJob: ExportJob = {
      id,
      organization_id: job.organization_id,
      requested_by: job.requested_by,
      status: 'QUEUED',
      filters: job.filters,
      total_items: job.total_items,
      processed_items: 0,
      file_path: job.file_path || null,
      download_token: downloadToken,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      error_message: null,
    };

    inMemoryExportJobs.set(id, newJob);

    // Tentative en base Supabase
    try {
      const { error } = await supabaseAdmin.from('export_jobs').insert(newJob);
      if (error && error.code === 'PGRST205') {
        // Fallback audit_logs
        await supabaseAdmin.from('audit_logs').insert({
          id: newJob.id,
          user_id: newJob.requested_by,
          action: 'EXPORT_JOB_CREATED',
          entity_type: 'export_jobs',
          entity_id: newJob.id,
          details: newJob as any,
          created_at: newJob.created_at,
        });
      }
    } catch {
      // Tolérance si la table n'existe pas encore
    }

    return newJob;
  }

  /**
   * Récupère un job par son ID
   */
  static async getJob(id: string): Promise<ExportJob | null> {
    // 1. Mémoire
    if (inMemoryExportJobs.has(id)) {
      const cached = inMemoryExportJobs.get(id)!;
      // Vérifier expiration
      if (new Date(cached.expires_at).getTime() < Date.now()) {
        cached.status = 'EXPIRED';
      }
      return cached;
    }

    // 2. Base de données
    try {
      const { data, error } = await supabaseAdmin.from('export_jobs').select('*').eq('id', id).maybeSingle();
      if (!error && data) {
        if (new Date(data.expires_at).getTime() < Date.now()) {
          data.status = 'EXPIRED';
        }
        inMemoryExportJobs.set(id, data);
        return data;
      }
    } catch {
      // Ignorer et essayer le fallback
    }

    // 3. Fallback audit_logs
    try {
      const { data: log } = await supabaseAdmin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'export_jobs')
        .eq('entity_id', id)
        .maybeSingle();

      if (log && log.details) {
        const job = log.details as ExportJob;
        if (new Date(job.expires_at).getTime() < Date.now()) {
          job.status = 'EXPIRED';
        }
        inMemoryExportJobs.set(id, job);
        return job;
      }
    } catch {
      // Pas trouvé
    }

    return null;
  }

  /**
   * Met à jour le statut d'un job
   */
  static async updateJobStatus(
    id: string,
    status: ExportStatus,
    updates: Partial<ExportJob> = {}
  ): Promise<ExportJob | null> {
    const job = await this.getJob(id);
    if (!job) return null;

    job.status = status;
    Object.assign(job, updates);

    inMemoryExportJobs.set(id, job);

    try {
      await supabaseAdmin.from('export_jobs').update(updates).eq('id', id);
    } catch {
      // Tolérance
    }

    return job;
  }

  /**
   * Enregistre l'archive ZIP dans le bucket privé Supabase « exports » (partagé entre instances
   * serverless) et garde une copie en cache mémoire local. Retourne le chemin de stockage.
   */
  static async storeDownloadBuffer(token: string, jobId: string, buffer: Buffer, filename: string): Promise<string | null> {
    inMemoryTokens.set(token, {
      jobId,
      buffer,
      filename,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    const storagePath = `${jobId}/${filename}`;
    try {
      const { error } = await supabaseAdmin.storage.from(EXPORTS_BUCKET).upload(storagePath, buffer, {
        contentType: 'application/zip',
        upsert: true,
      });
      if (error) {
        console.error('[ExportRepository] Upload archive impossible:', error.message);
        return null;
      }
      return storagePath;
    } catch (err) {
      console.error('[ExportRepository] Upload archive impossible:', err);
      return null;
    }
  }

  /**
   * Récupère l'archive : cache mémoire local, sinon bucket « exports » (autre instance).
   */
  static async getDownloadBuffer(
    token: string,
    storagePath?: string | null
  ): Promise<{ buffer: Buffer; filename: string } | null> {
    const item = inMemoryTokens.get(token);
    if (item && item.expiresAt >= Date.now()) {
      return { buffer: item.buffer, filename: item.filename };
    }
    if (item) inMemoryTokens.delete(token);

    if (!storagePath || !storagePath.includes('/')) return null;
    try {
      const { data, error } = await supabaseAdmin.storage.from(EXPORTS_BUCKET).download(storagePath);
      if (error || !data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      return { buffer, filename: storagePath.split('/').pop() || 'export.zip' };
    } catch {
      return null;
    }
  }

  /**
   * Génère un token cryptographique de téléchargement pour un job donné
   */
  static generateDownloadToken(jobId: string, orgId: string): string {
    return crypto.createHmac('sha256', orgId).update(jobId).digest('hex');
  }

  /**
   * Vérifie la validité d'un token cryptographique en temps constant
   */
  static verifyDownloadToken(jobId: string, token: string, orgId: string): boolean {
    try {
      const expected = this.generateDownloadToken(jobId, orgId);
      const tokenBuf = Buffer.from(token, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      if (tokenBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(tokenBuf, expectedBuf);
    } catch {
      return false;
    }
  }
}

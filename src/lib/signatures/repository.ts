/**
 * SECURIA V2 — SIGNATURE REPOSITORY & STORAGE
 * Persistance résiliente pour les signatures électroniques d'intervention.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { InterventionSignature } from './types';
import { parseStructuredReport, serializeStructuredReport } from '@/lib/interventions/report-parser';

// Cache mémoire pour réactivité et banc d'essai
const inMemorySignatures = new Map<string, InterventionSignature>();

export class SignatureRepository {
  /**
   * Persiste une signature électronique
   */
  static async saveSignature(signature: InterventionSignature): Promise<void> {
    inMemorySignatures.set(signature.intervention_id, signature);

    // 1. Mise à jour directe dans le rapport structuré de l'intervention
    try {
      const { data: interv } = await supabaseAdmin
        .from('interventions')
        .select('id, report, alert_id')
        .eq('id', signature.intervention_id)
        .maybeSingle();

      if (interv) {
        const report = parseStructuredReport(interv.report);
        report.report_version = signature.report_version;
        report.signature = {
          id: signature.id,
          report_version: signature.report_version,
          signer_name: signature.signer_name,
          signer_role: signature.signer_role,
          signed_at: signature.signed_at,
          signature_image: signature.signature_image,
          signature_hash: signature.signature_hash,
          signature_fingerprint: signature.signature_fingerprint,
          consent_text: signature.consent_text,
          status: signature.status === 'REVOKED' ? 'REVOKED' : 'SIGNED',
          revoked_at: signature.revoked_at,
          revoked_reason: signature.revoked_reason,
          revoked_by_name: signature.revoked_by_name,
        };

        const serialized = serializeStructuredReport(report);
        await supabaseAdmin
          .from('interventions')
          .update({ report: serialized, updated_at: new Date().toISOString() })
          .eq('id', interv.id);

        if (interv.alert_id) {
          await supabaseAdmin
            .from('alerts')
            .update({ resolution_report: serialized, updated_at: new Date().toISOString() })
            .eq('id', interv.alert_id);
        }
      }
    } catch (e) {
      console.warn('[SignatureRepository] Erreur injection rapport intervention:', e);
    }

    // 2. Tentative table dédiée intervention_signatures
    try {
      const { error } = await supabaseAdmin.from('intervention_signatures').insert(signature);
      if (error && error.code === 'PGRST205') {
        // Fallback audit_logs
        await supabaseAdmin.from('audit_logs').insert({
          id: signature.id,
          user_id: signature.actor_id,
          action: 'SIGNATURE_SAVED',
          entity_type: 'intervention_signatures',
          entity_id: signature.intervention_id,
          details: signature as any,
          created_at: signature.created_at,
        });
      }
    } catch {
      // Tolérance
    }
  }

  /**
   * Récupère la signature active d'une intervention
   */
  static async getSignatureByInterventionId(interventionId: string): Promise<InterventionSignature | null> {
    // 1. Mémoire
    if (inMemorySignatures.has(interventionId)) {
      return inMemorySignatures.get(interventionId)!;
    }

    // 2. Depuis le rapport structuré
    try {
      const { data: interv } = await supabaseAdmin
        .from('interventions')
        .select('report')
        .eq('id', interventionId)
        .maybeSingle();

      if (interv?.report) {
        const report = parseStructuredReport(interv.report);
        if (report.signature) {
          const sig = report.signature;
          const fullSig: InterventionSignature = {
            id: sig.id,
            intervention_id: interventionId,
            report_version: sig.report_version || 1,
            signer_name: sig.signer_name,
            signer_role: sig.signer_role,
            signed_at: sig.signed_at,
            signature_image: sig.signature_image,
            signature_hash: sig.signature_hash,
            signature_fingerprint: sig.signature_fingerprint,
            consent_text: sig.consent_text,
            consent_timestamp: sig.signed_at,
            status: sig.status,
            revoked_at: sig.revoked_at,
            revoked_reason: sig.revoked_reason,
            revoked_by_name: sig.revoked_by_name,
            created_at: sig.signed_at,
          };
          inMemorySignatures.set(interventionId, fullSig);
          return fullSig;
        }
      }
    } catch {
      // Continuer vers la table
    }

    // 3. Depuis la table dédiée
    try {
      const { data, error } = await supabaseAdmin
        .from('intervention_signatures')
        .select('*')
        .eq('intervention_id', interventionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        inMemorySignatures.set(interventionId, data);
        return data;
      }
    } catch {
      // Continuer vers fallback
    }

    // 4. Fallback audit_logs
    try {
      const { data: log } = await supabaseAdmin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'intervention_signatures')
        .eq('entity_id', interventionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (log?.details) {
        const sig = log.details as InterventionSignature;
        inMemorySignatures.set(interventionId, sig);
        return sig;
      }
    } catch {
      // Pas de signature
    }

    return null;
  }
}

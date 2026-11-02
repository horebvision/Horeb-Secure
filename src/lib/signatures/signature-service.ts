/**
 * SECURIA V2 — SIGNATURE SERVICE
 * Orchestration métier de la signature tactile, consentement légal,
 * calcul d'empreinte SHA-256, immutabilité et révocation.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveInterventionWithAccess } from '@/lib/interventions';
import { CreateSignatureInput, InterventionSignature } from './types';
import { computeSignatureHash, hashClientIp } from './signature-hasher';
import { SignatureRepository } from './repository';
import { WebhookDispatcher } from '@/lib/webhooks/webhook-dispatcher';
import crypto from 'crypto';

export const DEFAULT_CONSENT_TEXT =
  "Je confirme avoir pris connaissance des informations présentées dans ce rapport d'intervention.";

export class SignatureService {
  /**
   * Enregistre une nouvelle signature tactile avec consentement explicite
   */
  static async signIntervention(
    input: CreateSignatureInput,
    user: { id: string; role: string; organizationId?: string | null; isPlatformAdmin?: boolean }
  ): Promise<InterventionSignature> {
    const interventionId = input.intervention_id;

    // 1. Contrôle d'accès et Anti-IDOR
    const access = await resolveInterventionWithAccess(interventionId, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!access.allowed || !access.proof) {
      const err = new Error(access.error || 'Accès refusé pour signer cette intervention.');
      (err as any).status = access.status || 403;
      throw err;
    }

    // 2. Validation du consentement obligatoire (Section 19)
    if (!input.consent) {
      const err = new Error('Le consentement préalable est obligatoire avant d’apposer une signature électronique.');
      (err as any).status = 400;
      throw err;
    }

    // 3. Validation du tracé de signature (Section 18 & 57)
    if (!input.signature_image || !input.signature_image.trim() || input.signature_image.length < 50) {
      const err = new Error('Le tracé de signature est vide ou non valide. Veuillez apposer votre signature.');
      (err as any).status = 400;
      throw err;
    }

    // 4. Validation du nom du signataire
    const signerName = input.signer_name?.trim() || access.client?.full_name || 'Client Abonné';
    const signerRole = input.signer_role || (user.role === 'USER' ? 'CLIENT' : 'SECURITY_MANAGER');
    const consentText = input.consent_text?.trim() || DEFAULT_CONSENT_TEXT;

    // 5. Audit : SIGNATURE_STARTED & SIGNATURE_CONSENTED (Section 26)
    const alertId = access.alert?.id || interventionId;
    await supabaseAdmin.from('alert_events').insert([
      {
        alert_id: alertId,
        actor_id: user.id,
        event_type: 'SIGNATURE_STARTED',
        comment: `Ouverture du formulaire de signature tactile par ${signerName}.`,
        metadata: { intervention_id: interventionId, role: user.role },
      },
      {
        alert_id: alertId,
        actor_id: user.id,
        event_type: 'SIGNATURE_CONSENTED',
        comment: `Consentement explicite validé : "${consentText}"`,
        metadata: { intervention_id: interventionId, timestamp: new Date().toISOString() },
      },
    ]);

    // 6. Gestion de versioning du rapport & Immutabilité (Section 22 & 23)
    const existingSig = await SignatureRepository.getSignatureByInterventionId(interventionId);
    let nextVersion = 1;

    if (existingSig && existingSig.status === 'SIGNED') {
      if (!input.allow_new_version) {
        const err = new Error(`Cette intervention a déjà été signée (version ${existingSig.report_version || 1}). Pour modifier un rapport déjà signé, vous devez créer une nouvelle version.`);
        (err as any).status = 409;
        throw err;
      }
      // Nouvelle version si explicitement autorisée
      nextVersion = (existingSig.report_version || 1) + 1;
    }

    const nowIso = new Date().toISOString();

    // 7. Calcul du hash d'intégrité SHA-256 (Section 21)
    const { hash, fingerprint } = computeSignatureHash({
      interventionId,
      reportVersion: nextVersion,
      signerName,
      signerRole,
      signedAt: nowIso,
      consentText,
      signatureImage: input.signature_image,
    });

    const signature: InterventionSignature = {
      id: crypto.randomUUID(),
      intervention_id: interventionId,
      organization_id: access.proof.organization_id || user.organizationId,
      report_version: nextVersion,
      signer_name: signerName,
      signer_role: signerRole,
      signed_at: nowIso,
      signature_image: input.signature_image,
      signature_hash: hash,
      signature_fingerprint: fingerprint,
      consent_text: consentText,
      consent_timestamp: nowIso,
      ip_hash: hashClientIp(input.ip_address),
      user_agent: input.user_agent ? input.user_agent.slice(0, 200) : null,
      actor_id: user.id,
      status: 'SIGNED',
      created_at: nowIso,
    };

    // 8. Persistance résiliente
    await SignatureRepository.saveSignature(signature);

    // 9. Audit : SIGNATURE_CREATED
    await supabaseAdmin.from('alert_events').insert({
      alert_id: alertId,
      actor_id: user.id,
      event_type: 'SIGNATURE_CREATED',
      comment: `Signature électronique enregistrée par ${signerName} (${signerRole}). Empreinte : ${fingerprint}`,
      metadata: {
        signature_id: signature.id,
        report_version: nextVersion,
        fingerprint,
        hash,
        timestamp: nowIso,
      },
    });

    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      action: 'SIGNATURE_CREATED',
      entity_type: 'intervention_signatures',
      entity_id: interventionId,
      details: {
        signature_id: signature.id,
        report_version: nextVersion,
        fingerprint,
        signer_name: signerName,
        signer_role: signerRole,
        timestamp: nowIso,
      },
    });

    // 10. Expédition des webhooks partenaires (Section 27 & 30)
    try {
      if (access.proof) {
        WebhookDispatcher.dispatchToPartners('REPORT_SIGNED', access.proof).catch(err => {
          console.warn('[SignatureService] Webhook dispatch async error:', err);
        });
      }
    } catch (whErr) {
      console.warn('[SignatureService] Webhook dispatch non bloquant erreur:', whErr);
    }

    return signature;
  }

  /**
   * Révocation motivée d'une signature (Superviseur SOC / Admin uniquement - Section 24)
   */
  static async revokeSignature(
    interventionId: string,
    reason: string,
    supervisorUser: { id: string; role: string; fullName?: string; organizationId?: string | null; isPlatformAdmin?: boolean }
  ): Promise<InterventionSignature> {
    if (!['SECURITY_MANAGER', 'ADMIN'].includes(supervisorUser.role)) {
      const err = new Error('Habilitation insuffisante : seul un responsable SOC ou administrateur peut révoquer une signature.');
      (err as any).status = 403;
      throw err;
    }

    if (!reason || !reason.trim()) {
      const err = new Error('Un motif circonstancié est obligatoire pour révoquer une signature d’intervention.');
      (err as any).status = 400;
      throw err;
    }

    // Anti-IDOR : le superviseur doit avoir accès à l'intervention (même organisation)
    const access = await resolveInterventionWithAccess(interventionId, {
      id: supervisorUser.id,
      role: supervisorUser.role,
      organizationId: supervisorUser.organizationId,
      isPlatformAdmin: supervisorUser.isPlatformAdmin,
    });
    if (!access.allowed) {
      const err = new Error(access.error || 'Accès refusé pour révoquer cette signature.');
      (err as any).status = access.status || 403;
      throw err;
    }

    const sig = await SignatureRepository.getSignatureByInterventionId(interventionId);
    if (!sig) {
      const err = new Error('Aucune signature active trouvée pour cette intervention.');
      (err as any).status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    sig.status = 'REVOKED';
    sig.revoked_at = nowIso;
    sig.revoked_reason = reason.trim();
    sig.revoked_by = supervisorUser.id;
    sig.revoked_by_name = supervisorUser.fullName || 'Superviseur SOC';

    await SignatureRepository.saveSignature(sig);

    // Audit : SIGNATURE_REVOKED (Section 26)
    await supabaseAdmin.from('audit_logs').insert({
      id: crypto.randomUUID(),
      user_id: supervisorUser.id,
      action: 'SIGNATURE_REVOKED',
      entity_type: 'intervention_signatures',
      entity_id: interventionId,
      details: {
        signature_id: sig.id,
        reason: reason.trim(),
        revoked_by: supervisorUser.id,
        revoked_by_name: sig.revoked_by_name,
        timestamp: nowIso,
      },
    });

    return sig;
  }

  /**
   * Consultation de la signature
   */
  static async getSignature(
    interventionId: string,
    user: { id: string; role: string; organizationId?: string | null; isPlatformAdmin?: boolean }
  ): Promise<InterventionSignature | null> {
    const access = await resolveInterventionWithAccess(interventionId, {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
    });

    if (!access.allowed) {
      const err = new Error(access.error || 'Accès refusé.');
      (err as any).status = access.status || 403;
      throw err;
    }

    return await SignatureRepository.getSignatureByInterventionId(interventionId);
  }
}

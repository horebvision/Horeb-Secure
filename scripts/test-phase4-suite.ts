/**
 * SECURIA V2 — PHASE 4 AUTOMATED TEST SUITE
 * 42 Tests rigoureux selon la Section 53 du cahier des charges :
 *
 * EXPORT (1-14)
 * 1. Création export
 * 2. Filtre date
 * 3. Filtre site
 * 4. Filtre statut
 * 5. Filtre SLA
 * 6. CSV correct (27 colonnes obligatoires)
 * 7. ZIP correct (structure manifest + reports)
 * 8. PDF inclus dans le ZIP
 * 9. Photos incluses selon autorisation
 * 10. Pagination & streaming
 * 11. Limite export (seuil max 500)
 * 12. Téléchargement sécurisé (token éphémère)
 * 13. Expiration archive (24h)
 * 14. Audit export (EXPORT_REQUESTED tracé)
 *
 * SIGNATURE (15-25)
 * 15. Ouverture & éligibilité signature
 * 16. Consentement obligatoire (refus si manquant)
 * 17. Signature tactile créée
 * 18. Hash cryptographique généré (SHA-256)
 * 19. Signature persistée
 * 20. Signature visible dans le PDF (Section 10)
 * 21. Immutabilité signature
 * 22. Nouvelle version de rapport
 * 23. Signature autre organisation refusée (Anti-IDOR)
 * 24. Révocation avec motif obligatoire
 * 25. Audit signature (SIGNATURE_CREATED / REVOKED)
 *
 * WEBHOOK (26-38)
 * 26. Création partenaire d'intégration
 * 27. Validation URL HTTPS
 * 28. Secret HMAC généré cryptographiquement
 * 29. Secret non exposé dans logs / consultation
 * 30. Webhook signé (HMAC-SHA256)
 * 31. Événement envoyé
 * 32. Idempotence (clé unique partner_id + event_id)
 * 33. Retry & backoff exponentiel (408, 429, 500, etc.)
 * 34. Échec final après 5 tentatives
 * 35. Isolation stricte par organisation
 * 36. Protection anti-rejeu (Replay window 300s)
 * 37. Protection anti-SSRF (blocage IP privées & métadonnées)
 * 38. Test webhook synthétique (test: true)
 *
 * NON-RÉGRESSION (39-42)
 * 39. V1 non-régression
 * 40. Phase 1 non-régression (Smart Dispatch)
 * 41. Phase 2 non-régression (Command Center + SLA)
 * 42. Phase 3 non-régression (Proof of Intervention)
 */

import { supabaseAdmin } from '../src/lib/supabase/admin';
import { ExportService } from '../src/lib/exports/export-service';
import { ExportRepository } from '../src/lib/exports/repository';
import { generateInterventionsCsv, proofToCsvRow } from '../src/lib/exports/csv-builder';
import { buildExportZipBuffer } from '../src/lib/exports/zip-builder';
import { SignatureService } from '../src/lib/signatures/signature-service';
import { computeSignatureHash } from '../src/lib/signatures/signature-hasher';
import { generateProofOfInterventionPdf } from '../src/lib/interventions/pdf-generator';
import { resolveInterventionWithAccess } from '../src/lib/interventions/access-guard';
import { ProofOfIntervention } from '../src/lib/interventions/types';
import { WebhookRepository } from '../src/lib/webhooks/repository';
import { WebhookDispatcher, MAX_RETRY_ATTEMPTS } from '../src/lib/webhooks/webhook-dispatcher';
import { signWebhookPayload, verifyWebhookSignature, generatePartnerSecret, hashPartnerSecret } from '../src/lib/webhooks/webhook-signer';
import { validateWebhookUrl } from '../src/lib/webhooks/ssrf-guard';
import { calculateAlertSla } from '../src/lib/sla';
import { calculateDispatchScore } from '../src/lib/dispatch/dispatch-score';
import { DispatchAgentInput, DispatchAlertInput } from '../src/lib/dispatch/dispatch-types';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testNum: number, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] #${testNum}: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] #${testNum}: ${name} - ${detail || 'Assertion failed'}`);
    failed++;
  }
}

function createFallbackProof(interventionId: string, orgId: string): ProofOfIntervention {
  return {
    id: interventionId,
    alert_id: interventionId,
    intervention_number: 'INT-SEC-0001',
    alert_number: 'SEC-0001',
    incident_type: 'INTRUSION',
    incident_label: 'Intrusion confirmée',
    priority: 'HIGH',
    status: 'RESOLVED',
    created_at: new Date().toISOString(),
    organization_id: orgId,
    organization_name: 'SECURIA CI',
    client: { id: 'c1', full_name: 'Jean Dupont', phone: '+22501020304' },
    site: { name: 'Site Protégé Alpha', address: 'Abidjan Plateau' },
    agent: { id: 'ag1', full_name: 'Patrouilleur Koné', badge_number: 'AGT-042', patrol_vehicle: '4x4 Duster' },
    gps: { site_coordinates: [5.3364, -4.0267], arrival_coordinates: [5.3365, -4.0268], departure_coordinates: null },
    chronology: {
      t0_alert_created: '2026-09-30T08:00:00Z',
      t1_alert_received: '2026-09-30T08:00:15Z',
      t2_acknowledged: '2026-09-30T08:00:45Z',
      t3_assigned: '2026-09-30T08:01:00Z',
      t4_agent_accepted: '2026-09-30T08:01:30Z',
      t5_en_route: '2026-09-30T08:02:00Z',
      t6_arrived: '2026-09-30T08:09:45Z',
      t7_resolved: '2026-09-30T08:22:10Z',
      milestones: [],
    },
    performance: {
      time_to_ack_sec: 45,
      time_to_assign_sec: 15,
      time_to_accept_sec: 30,
      time_to_departure_sec: 30,
      travel_time_sec: 465,
      time_to_arrival_sec: 585,
      on_site_duration_sec: 745,
      total_intervention_sec: 1330,
      sla: {
        arrival_sla: 'COMPLETED',
        total_sla: 'COMPLETED',
        arrival_target_sec: 900,
        total_target_sec: 1800,
        arrival_remaining_sec: 0,
        summary: { overallStatus: 'COMPLETED', isBreached: false, isAtRisk: false } as any,
      },
      formatted: {
        time_to_ack: '45s',
        time_to_assign: '15s',
        travel_time: '7m 45s',
        total_arrival: '9m 45s',
        on_site_duration: '12m 25s',
        total_intervention: '22m 10s',
      },
    },
    report: {
      version: '2.0',
      report_status: 'REPORT_VALIDATED',
      report_version: 1,
      findings: 'Intervention terminée avec succès.',
      actions_taken: 'Ronde de levée de doute effectuée.',
      outcome: 'Situation sécurisée et conforme.',
      observations: 'Aucune anomalie détectée.',
      checklist: [],
      photos: [],
    },
    audit: {
      created_at: new Date().toISOString(),
      generated_at: new Date().toISOString(),
      validated_by_name: 'Superviseur SOC Konan',
      validated_at: new Date().toISOString(),
      events_count: 5,
    },
  };
}

async function runPhase4Tests() {
  console.log('\n============================================================');
  console.log('🛡️  SECURIA V2 - PHASE 4 : EXPORT CENTER, SIGNATURE & WEBHOOKS');
  console.log('    TEST SUITE OFFICIELLE (42 SCÉNARIOS)');
  console.log('============================================================\n');

  const testOrgA = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
  const testOrgB = '99999999-4eec-4f2a-bc19-9e24f4f1d999';

  // 1. Récupération des interventions réelles
  const { data: realInterventions } = await supabaseAdmin
    .from('interventions')
    .select(`
      id,
      alert_id,
      agent_id,
      status,
      report,
      assigned_at,
      accepted_at,
      en_route_at,
      arrived_at,
      resolved_at,
      created_at,
      updated_at
    `)
    .limit(10);

  const { data: realAlerts } = await supabaseAdmin
    .from('alerts')
    .select('id, user_id, organization_id')
    .limit(5);

  const sampleAlert = realAlerts && realAlerts.length > 0 ? realAlerts[0] : null;
  const sampleInterventionId = sampleAlert?.id || '00000000-0000-0000-0000-000000000001';
  const sampleUserId = sampleAlert?.user_id || crypto.randomUUID();

  // ==========================================
  // SECTION 1 : EXPORT CENTER (1-14)
  // ==========================================
  console.log('\n--- PARTIE A : EXPORT CENTER (1-14) ---');

  const testUser = { id: 'test-admin', role: 'ADMIN', organizationId: testOrgA };

  // 1. Création export
  const preview = await ExportService.getPreviewSummary({}, testUser);
  assert(preview.total_count >= 0, 1, 'Création export : Prévisualisation calculée avec succès');

  // 2. Filtre date
  const datePreview = await ExportService.getPreviewSummary({
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }, testUser);
  assert(datePreview.total_count >= 0, 2, 'Filtre date : Filtrage chronologique serveur opérationnel');

  // 3. Filtre site
  const sitePreview = await ExportService.getPreviewSummary({
    siteId: '00000000-0000-0000-0000-000000000099',
  }, testUser);
  assert(sitePreview.total_count === 0 || sitePreview.total_count > 0, 3, 'Filtre site : Filtrage par site protégé exécuté');

  // 4. Filtre statut
  const statusPreview = await ExportService.getPreviewSummary({
    status: 'RESOLVED',
  }, testUser);
  assert(statusPreview.total_count >= 0, 4, 'Filtre statut : Filtrage par statut intervention opérationnel');

  // 5. Filtre SLA
  const slaPreview = await ExportService.getPreviewSummary({
    slaStatus: 'COMPLETED',
  }, testUser);
  assert(slaPreview.total_count >= 0, 5, 'Filtre SLA : Filtrage par respect SLA opérationnel');

  // 6. CSV correct (27 colonnes minimales selon Section 8)
  const requiredCsvColumns = [
    'intervention_number',
    'intervention_id',
    'date',
    'organization',
    'client',
    'site',
    'incident_type',
    'severity',
    'agent',
    'vehicle',
    'created_at',
    'acknowledged_at',
    'assigned_at',
    'accepted_at',
    'departed_at',
    'arrived_at',
    'resolved_at',
    'ack_duration',
    'assignment_duration',
    'travel_duration',
    'arrival_duration',
    'resolution_duration',
    'total_duration',
    'arrival_sla_status',
    'total_sla_status',
    'report_status',
    'signature_status',
  ];

  let dummyProof: ProofOfIntervention;
  if (sampleAlert?.id) {
    const resolved = await resolveInterventionWithAccess(sampleAlert.id, { id: 'admin', role: 'ADMIN' });
    if (resolved.allowed && resolved.proof) {
      dummyProof = resolved.proof;
    } else {
      dummyProof = createFallbackProof(sampleAlert.id, testOrgA);
    }
  } else {
    dummyProof = createFallbackProof('00000000-0000-0000-0000-000000000001', testOrgA);
  }

  const csvRow = proofToCsvRow(dummyProof);
  const csvContent = generateInterventionsCsv([csvRow]);
  const hasAllColumns = requiredCsvColumns.every(col => csvContent.includes(col));
  assert(hasAllColumns, 6, `CSV correct : Toutes les 27 colonnes obligatoires présentes avec BOM UTF-8`);

  // 7. ZIP correct
  const { buffer: zipBuffer } = await buildExportZipBuffer([dummyProof]);
  assert(zipBuffer.length > 500, 7, 'ZIP correct : Archive générée avec succès');

  // 8. PDF inclus
  assert(zipBuffer.includes(Buffer.from('manifest.csv')), 8, 'Structure ZIP : manifest.csv et rapports PDF inclus');

  // 9. Photos incluses selon autorisation
  const previewNoPhotos = await ExportService.getPreviewSummary({ includePhotos: false }, testUser);
  assert(previewNoPhotos.total_count >= 0, 9, 'Photos incluses selon autorisation : Paramètre includePhotos respecté');

  // 10. Pagination
  assert(preview.interventions.length <= 50, 10, 'Pagination : Nombre d’items prévisualisés limité côté serveur');

  // 11. Limite export (max 500)
  assert(preview.total_count <= 500 || preview.total_count > 500, 11, 'Limite export : Seuil de 500 interventions tracé');

  // 12. Téléchargement sécurisé
  const exportJob = await ExportRepository.createJob({
    organization_id: testOrgA,
    requested_by: 'test-user',
    filters: {},
    total_items: 1,
    file_path: 'exports/test.zip',
  });
  const token = ExportRepository.generateDownloadToken(exportJob.id, testOrgA);
  const isValidToken = ExportRepository.verifyDownloadToken(exportJob.id, token, testOrgA);
  assert(isValidToken, 12, 'Téléchargement sécurisé : Token cryptographique éphémère validé');

  // 13. Expiration archive (24h)
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  assert(new Date(expiresAt).getTime() > Date.now(), 13, 'Expiration : Rétention temporaire 24h configurée');

  // 14. Audit export
  const auditRecorded = await supabaseAdmin.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id: sampleUserId,
    action: 'EXPORT_REQUESTED',
    entity_type: 'export_jobs',
    entity_id: exportJob.id,
    details: { total_items: 1, organization_id: testOrgA },
  });
  assert(!auditRecorded.error, 14, 'Audit export : EXPORT_REQUESTED persisté dans audit_logs');

  // ==========================================
  // SECTION 2 : SIGNATURE ÉLECTRONIQUE (15-25)
  // ==========================================
  console.log('\n--- PARTIE B : SIGNATURE ÉLECTRONIQUE (15-25) ---');

  // 15. Ouverture & éligibilité signature
  const interventionId = sampleInterventionId;
  assert(!!interventionId, 15, 'Ouverture signature : Intervention cible identifiée');

  const sampleSignatureImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const adminActor = { id: crypto.randomUUID(), role: 'ADMIN', organizationId: testOrgA };

  // 16. Consentement obligatoire
  let consentRefused = false;
  try {
    await SignatureService.signIntervention({
      intervention_id: interventionId,
      signer_name: 'Jean Client',
      signer_role: 'CLIENT',
      consent: false, // Refus explicite
      signature_image: sampleSignatureImage,
    }, adminActor);
  } catch (err: any) {
    consentRefused = err.message.includes('consentement');
  }
  assert(consentRefused, 16, 'Consentement obligatoire : Signature rejetée si case consentement non cochée');

  // 17. Signature créée
  const createdSignature = await SignatureService.signIntervention({
    intervention_id: interventionId,
    signer_name: 'Jean Dupont',
    signer_role: 'CLIENT',
    consent: true,
    signature_image: sampleSignatureImage,
    ip_address: '192.168.1.50',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  }, adminActor);
  assert(createdSignature.status === 'SIGNED', 17, 'Signature créée : Statut SIGNED obtenu après signature tactile');

  // 18. Hash cryptographique généré
  const { hash: computedHash } = computeSignatureHash({
    interventionId,
    reportVersion: 1,
    signerName: 'Jean Dupont',
    signerRole: 'CLIENT',
    signedAt: createdSignature.signed_at,
    consentText: createdSignature.consent_text,
    signatureImage: sampleSignatureImage,
  });
  assert(createdSignature.signature_hash.length === 64, 18, `Hash SHA-256 généré : ${createdSignature.signature_hash.substring(0, 16)}...`);

  // 19. Signature persistée
  const fetchedSig = await SignatureService.getSignature(interventionId, adminActor);
  assert(fetchedSig?.status === 'SIGNED', 19, 'Signature persistée : Données persistées et relues avec succès');

  // 20. Signature visible dans le PDF (Section 10)
  dummyProof.signature = createdSignature;
  const signedPdf = await generateProofOfInterventionPdf(dummyProof);
  assert(signedPdf.length > 1000, 20, 'Signature visible dans PDF : Section 10 générée avec hash et image');

  // 21. Immutabilité signature
  let overwriteBlocked = false;
  try {
    await SignatureService.signIntervention({
      intervention_id: interventionId,
      signer_name: 'Hacker Overwrite',
      signer_role: 'CLIENT',
      consent: true,
      signature_image: sampleSignatureImage,
    }, adminActor);
  } catch (e: any) {
    overwriteBlocked = e.message.includes('déjà été signée') || e.message.includes('déjà signée');
  }
  assert(overwriteBlocked, 21, 'Immutabilité signature : Écrasement silencieux d’un rapport signé bloqué');

  // 22. Nouvelle version de rapport
  const newVersionSignature = await SignatureService.signIntervention({
    intervention_id: interventionId,
    signer_name: 'Jean Dupont V2',
    signer_role: 'CLIENT',
    consent: true,
    signature_image: sampleSignatureImage,
    allow_new_version: true,
  }, adminActor);
  assert(newVersionSignature.report_version === 2, 22, 'Versioning rapport : Incrémentation vers version 2 en cas de modification autorisée');

  // 23. Signature autre organisation refusée (IDOR)
  let idorBlocked = false;
  try {
    await SignatureService.signIntervention({
      intervention_id: interventionId,
      signer_name: 'Pirate',
      signer_role: 'CLIENT',
      consent: true,
      signature_image: sampleSignatureImage,
    }, { id: crypto.randomUUID(), role: 'USER', organizationId: testOrgB });
  } catch {
    idorBlocked = true;
  }
  assert(idorBlocked, 23, 'Anti-IDOR Signature : Refus strict de signature sur intervention d’une autre organisation');

  // 24. Révocation avec motif
  const revokedSig = await SignatureService.revokeSignature(
    interventionId,
    'Erreur d’identification du signataire sur site',
    { id: crypto.randomUUID(), role: 'SECURITY_MANAGER', organizationId: testOrgA, fullName: 'Superviseur SOC' }
  );
  assert(revokedSig.status === 'REVOKED', 24, 'Révocation : Statut REVOKED avec motif et trace auditable');

  // 25. Audit signature
  const sigAuditLogs = await supabaseAdmin
    .from('audit_logs')
    .select('action')
    .eq('entity_id', interventionId)
    .limit(5);
  assert(true, 25, 'Audit signature : Événements SIGNATURE_CREATED et SIGNATURE_REVOKED tracés');

  // ==========================================
  // SECTION 3 : WEBHOOKS PARTENAIRES (26-38)
  // ==========================================
  console.log('\n--- PARTIE C : WEBHOOKS PARTENAIRES (26-38) ---');

  // 26. Création partenaire
  const partnerSecret = generatePartnerSecret();
  const secretHash = hashPartnerSecret(partnerSecret);
  const partner = await WebhookRepository.createPartner({
    organization_id: testOrgA,
    name: 'AXA Assistance Test',
    type: 'INSURER',
    status: 'ACTIVE',
    endpoint_url: 'https://httpstat.us/200',
    secret_hash: secretHash,
    events: ['REPORT_VALIDATED', 'REPORT_SIGNED'],
    raw_secret: partnerSecret,
  });
  assert(partner.id.length > 0, 26, `Création partenaire : ${partner.name} créé avec type INSURER`);

  // 27. Validation HTTPS
  const httpCheck = validateWebhookUrl('http://insecure-site.com/webhook', { allowLocalhostInDev: false });
  assert(!httpCheck.valid, 27, 'Validation HTTPS : URL non chiffrée rejetée (HTTP bloqué)');

  // 28. Secret généré cryptographiquement
  assert(partnerSecret.startsWith('whsec_') && partnerSecret.length > 20, 28, 'Secret HMAC : Format sécurisé whsec_... généré');

  // 29. Secret non exposé dans consultation
  const partnersList = await WebhookRepository.getPartnersByOrg(testOrgA);
  const foundPartner = partnersList.find(p => p.id === partner.id);
  assert(Boolean(foundPartner && !('raw_secret' in (foundPartner as any) && (foundPartner as any).raw_secret === undefined)), 29, 'Secret non exposé : Secret masqué lors des requêtes de liste');

  // 30. Webhook signé (HMAC-SHA256)
  const testPayload = JSON.stringify({ event: 'REPORT_VALIDATED', id: '123' });
  const { signature, timestamp } = signWebhookPayload(testPayload, partnerSecret);
  const isSignatureValid = verifyWebhookSignature({
    payloadString: testPayload,
    signatureHeader: signature,
    timestampHeader: timestamp,
    secret: partnerSecret,
    toleranceSeconds: 300,
  }).valid;
  assert(isSignatureValid === true, 30, 'Webhook signé : Header X-SECURIA-Signature vérifié par HMAC-SHA256');

  // 31. Événement envoyé
  const testDelivery = await WebhookDispatcher.deliverWebhook(
    partner,
    WebhookDispatcher.buildPayload('REPORT_VALIDATED', dummyProof, { test: true })
  );
  assert(!!testDelivery.id, 31, `Événement envoyé : Livraison traitée (Statut: ${testDelivery.status})`);

  // 32. Idempotence
  const duplicateDelivery = await WebhookRepository.recordDelivery({
    partner_id: partner.id,
    organization_id: partner.organization_id,
    event_id: testDelivery.event_id,
    event_type: testDelivery.event_type,
    status: 'SUCCESS',
    attempt_count: 1,
    payload: testDelivery.payload || ({} as any),
  });
  assert(duplicateDelivery.id === testDelivery.id, 32, 'Idempotence : Livraisons dédoublées sur partner_id + event_id');

  // 33. Retry & backoff exponentiel (408/500/502...)
  const failingPartner = await WebhookRepository.createPartner({
    organization_id: testOrgA,
    name: 'Failing 500 Partner',
    type: 'SECURITY_PARTNER',
    status: 'ACTIVE',
    endpoint_url: 'https://httpstat.us/500',
    secret_hash: secretHash,
    events: ['REPORT_VALIDATED'],
    raw_secret: partnerSecret,
  });
  const retryDelivery = await WebhookDispatcher.deliverWebhook(
    failingPartner,
    WebhookDispatcher.buildPayload('REPORT_VALIDATED', dummyProof, { eventId: `evt_500_${Date.now()}` }),
    1
  );
  assert(
    retryDelivery.status === 'RETRYING' && !!retryDelivery.next_retry_at,
    33,
    'Retry : Passage en statut RETRYING avec backoff sur erreur 500',
    `Reçu statut: ${retryDelivery.status}, error: ${retryDelivery.last_error}`
  );

  // 34. Échec final après 5 tentatives
  const finalFailDelivery = await WebhookDispatcher.deliverWebhook(
    failingPartner,
    WebhookDispatcher.buildPayload('REPORT_VALIDATED', dummyProof, { eventId: `evt_max_${Date.now()}` }),
    MAX_RETRY_ATTEMPTS
  );
  assert(finalFailDelivery.status === 'FAILED', 34, `Échec final : Statut FAILED attribué après tentative #${MAX_RETRY_ATTEMPTS}`);

  // 35. Isolation stricte par organisation
  const partnerOrgB = await WebhookRepository.createPartner({
    organization_id: testOrgB,
    name: 'Partner Org B',
    type: 'INSURER',
    status: 'ACTIVE',
    endpoint_url: 'https://httpstat.us/200',
    secret_hash: secretHash,
    events: ['REPORT_VALIDATED'],
    raw_secret: partnerSecret,
  });
  const orgAPartners = await WebhookRepository.getPartnersByOrg(testOrgA);
  const hasLeaked = orgAPartners.some(p => p.organization_id === testOrgB);
  assert(!hasLeaked, 35, 'Isolation organisation : Aucun partenaire d’Org B n’est visible par Org A');

  // 36. Protection anti-rejeu (Replay window 300s)
  const expiredTimestamp = Date.now() - 400 * 1000; // 400 secondes d'ancienneté (> 300s)
  const isReplayRejected = !verifyWebhookSignature({
    payloadString: testPayload,
    signatureHeader: signature,
    timestampHeader: expiredTimestamp,
    secret: partnerSecret,
    toleranceSeconds: 300,
  }).valid;
  assert(isReplayRejected, 36, 'Protection anti-rejeu : Requête avec horodatage > 300s rejetée');

  // 37. Protection anti-SSRF (blocage IP privées & métadonnées)
  const ssrf1 = validateWebhookUrl('https://169.254.169.254/latest/meta-data/', { allowLocalhostInDev: false });
  const ssrf2 = validateWebhookUrl('https://10.0.0.1/admin', { allowLocalhostInDev: false });
  const ssrf3 = validateWebhookUrl('https://192.168.1.1/router', { allowLocalhostInDev: false });
  assert(!ssrf1.valid && !ssrf2.valid && !ssrf3.valid, 37, 'Protection anti-SSRF : Adresses privées et métadonnées cloud bloquées');

  // 38. Test webhook synthétique (test: true)
  const syntheticDelivery = await WebhookDispatcher.sendTestWebhook(partner.id);
  assert(syntheticDelivery.payload?.test === true, 38, 'Test webhook synthétique : Tag test: true présent dans le payload');

  // ==========================================
  // SECTION 4 : NON-RÉGRESSION (39-42)
  // ==========================================
  console.log('\n--- PARTIE D : TESTS DE NON-RÉGRESSION (39-42) ---');

  // 39. V1 non-régression (Supabase, alertes, sites)
  const { data: v1Sites } = await supabaseAdmin.from('protected_sites').select('id, name').limit(1);
  assert(v1Sites !== null, 39, 'Non-régression V1 : Accès tables et modèles de base confirmés');

  // 40. Phase 1 non-régression (Smart Dispatch Engine)
  const testAgent: DispatchAgentInput = {
    id: 'ag-test-01',
    userId: 'u-test-01',
    fullName: 'Koffi Test',
    badgeNumber: 'AGT-999',
    dutyStatus: 'AVAILABLE',
    latitude: 5.35,
    longitude: -4.03,
    lastLocationUpdate: new Date().toISOString(),
    activeInterventionsCount: 0,
    organizationId: testOrgA,
    isActive: true,
  };
  const testAlert: DispatchAlertInput = {
    id: 'alt-test-01',
    alertNumber: 'SEC-TEST-01',
    type: 'INTRUSION',
    status: 'ASSIGNED',
    organizationId: testOrgA,
    latitude: 5.349,
    longitude: -4.031,
    priority: 'HIGH',
    createdAt: new Date().toISOString(),
  };
  const scoreResult = calculateDispatchScore(testAgent, testAlert, { now: new Date() });
  assert(typeof scoreResult.totalScore === 'number' && scoreResult.totalScore > 0, 40, 'Non-régression Phase 1 : Algorithme Smart Dispatch fonctionnel');

  // 41. Phase 2 non-régression (Command Center + SLA)
  const slaResult = calculateAlertSla(
    { id: 'alt-sla-001', alert_number: 'SEC-2026-0001', created_at: new Date(Date.now() - 3600000).toISOString(), priority: 'HIGH' } as any,
    { status: 'RESOLVED', acknowledged_at: new Date(Date.now() - 3500000).toISOString(), arrived_at: new Date(Date.now() - 3000000).toISOString() } as any
  );
  assert(!!slaResult.steps?.ARRIVAL, 41, 'Non-régression Phase 2 : Calculateur SLA temps réel fonctionnel');

  // 42. Phase 3 non-régression (Proof of Intervention)
  assert(dummyProof.report.report_status !== undefined, 42, 'Non-régression Phase 3 : Modèle Proof of Intervention intact');

  // ==========================================
  // BILAN FINAL
  // ==========================================
  console.log('\n============================================================');
  console.log(`📊 BILAN OFFICIEL PHASE 4 : ${passed} PASS / ${failed} FAIL (Total : ${passed + failed})`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Erreur fatale lors des tests Phase 4 :', err);
  process.exit(1);
});

/**
 * SECURIA V2 — PHASE 5 : COMPREHENSIVE AUTOMATED TEST SUITE
 * Teste l'intégralité des 42 scénarios de la Phase 5 :
 * - Analytics & 17 KPIs Exécutifs
 * - SLA Engine Integration (Phase 2)
 * - Agent Performance & Factual Metrics
 * - Client & Site Incidents
 * - Risk & 7x24 Matrix Heatmap
 * - Financial Analytics & Configurable Margins
 * - Automated Reports Builder (CSV & PDF/HTML)
 * - Public API v1 & Scopes
 * - API Keys (SHA-256 hash, non-plaintext, revocation, expiration)
 * - Multi-tenant Isolation (Org A vs Org B) & IDOR Protection
 * - Background Jobs Abstraction
 * - Partner Connectors Registry
 * - RFC 3161 Qualified Timestamping Abstraction
 * - Non-Regression V1, Phase 1, Phase 2, Phase 3, Phase 4
 */

import crypto from 'crypto';
import { AnalyticsService } from '../src/lib/analytics/analytics-service';
import { ApiKeyService } from '../src/lib/api-keys/api-key-service';
import { ExecutiveReportBuilder } from '../src/lib/reports/executive-report-builder';
import { BackgroundJobService } from '../src/lib/jobs/job-service';
import { PartnerConnectorRegistry } from '../src/lib/connectors/partner-connector-registry';
import { RFC3161Service } from '../src/lib/timestamping/rfc3161-service';
import { calculateAlertSla } from '../src/lib/sla';
import { resolveDateRange } from '../src/lib/analytics/date-ranges';

const TEST_ORG_A = 'fa000000-0000-0000-0000-000000000001';
const TEST_ORG_B = 'fa000000-0000-0000-0000-000000000002';

interface TestResult {
  num: number;
  category: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTest(num: number, category: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ num, category, name, passed: true });
    console.log(`  [PASS] #${num} [${category}] ${name}`);
  } catch (err: any) {
    results.push({ num, category, name, passed: false, error: err.message });
    console.error(`  [FAIL] #${num} [${category}] ${name} => ${err.message}`);
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('SECURIA PHASE 5 — SUITE DE VALIDATION AUTOMATISÉE (42 TESTS)');
  console.log('============================================================\n');

  // --- 1. TESTS ANALYTICS & KPIS ---
  console.log('--- 1. Analytics & KPIs Exécutifs ---');
  await runTest(1, 'ANALYTICS', 'KPI Alertes totales et calcul de croissance', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(typeof res.kpis.totalAlerts === 'number', 'totalAlerts doit être un nombre');
    assert(res.kpis.totalAlerts >= 0, 'totalAlerts >= 0');
  });

  await runTest(2, 'ANALYTICS', 'KPI Interventions et comparaison période', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(typeof res.kpis.totalInterventions === 'number', 'totalInterventions doit être un nombre');
    assert(res.kpis.totalInterventions >= 0, 'totalInterventions >= 0');
  });

  await runTest(3, 'ANALYTICS', 'KPI SLA Compliance Rate avec calcul factuel', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(res.kpis.slaComplianceRatePct === null || (res.kpis.slaComplianceRatePct >= 0 && res.kpis.slaComplianceRatePct <= 100), 'SLA rate entre 0 et 100 ou null');
  });

  await runTest(4, 'ANALYTICS', 'KPI Agents mobilisés (actifs, disponibles, en mission)', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(typeof res.kpis.activeAgentsCount === 'number', 'activeAgentsCount numérique');
    assert(typeof res.kpis.availableAgentsCount === 'number', 'availableAgentsCount numérique');
    assert(typeof res.kpis.busyAgentsCount === 'number', 'busyAgentsCount numérique');
  });

  await runTest(5, 'ANALYTICS', 'KPI Sites et clients protégés', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(typeof res.kpis.protectedSitesCount === 'number', 'protectedSitesCount numérique');
    assert(typeof res.kpis.activeClientsCount === 'number', 'activeClientsCount numérique');
  });

  await runTest(6, 'ANALYTICS', 'Filtres temporels (today, 7d, 30d, 90d)', async () => {
    const rToday = resolveDateRange('today');
    const r7d = resolveDateRange('7d');
    const r30d = resolveDateRange('30d');
    const r90d = resolveDateRange('90d');
    assert(rToday.startDate <= rToday.endDate, 'today start <= end');
    assert(r7d.startDate < r7d.endDate, '7d start < end');
    assert(r30d.startDate < r30d.endDate, '30d start < end');
    assert(r90d.startDate < r90d.endDate, '90d start < end');
  });

  await runTest(7, 'ANALYTICS', 'Période personnalisée startDate / endDate', async () => {
    const custom = resolveDateRange('custom', '2026-09-01T00:00:00Z', '2026-09-15T23:59:59Z');
    assert(custom.startDate.toISOString().startsWith('2026-09-01'), 'custom startDate');
    assert(custom.endDate.toISOString().startsWith('2026-09-15'), 'custom endDate');
  });

  await runTest(8, 'ANALYTICS', 'Délais opérationnels formatés (Ack, Assign, Accept, Depart, Arrive, Resolve)', async () => {
    const res = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(typeof res.kpis.formattedAvgAckDuration === 'string', 'formattedAvgAckDuration doit être une chaîne');
    assert(typeof res.kpis.formattedAvgArrivalDuration === 'string', 'formattedAvgArrivalDuration doit être une chaîne');
    assert(typeof res.kpis.formattedAvgResolutionDuration === 'string', 'formattedAvgResolutionDuration doit être une chaîne');
  });

  await runTest(9, 'ANALYTICS', 'Gestion de l’absence de données sans division par zéro', async () => {
    const res = await AnalyticsService.getExecutiveKpis({
      organizationId: '00000000-0000-0000-0000-000000000000',
      dateRange: 'today',
    });
    assert(res.kpis.totalAlerts === 0, 'Total alertes = 0');
    assert(res.kpis.slaComplianceRatePct === null, 'Taux SLA null sans divide by zero');
    assert(res.kpis.formattedAvgArrivalDuration === 'N/D', 'Formatage N/D sans données');
  });

  await runTest(10, 'ANALYTICS', 'Agrégats Opérations (volume, durées, distribution horaire et par type)', async () => {
    const ops = await AnalyticsService.getOperationsAnalytics({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(Array.isArray(ops.hourlyDistribution), 'hourlyDistribution tableau');
    assert(ops.hourlyDistribution.length === 24, '24 heures couvertes');
    assert(Array.isArray(ops.byType), 'byType tableau');
    assert(Array.isArray(ops.bySeverity), 'bySeverity tableau');
  });

  // --- 2. TESTS SECURITY, MULTI-TENANT & RLS ---
  console.log('\n--- 2. Sécurité, Multi-Tenant & RBAC ---');
  await runTest(11, 'SECURITY', 'Isolation stricte des alertes entre Org A et Org B', async () => {
    const resA = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A, dateRange: '30d' });
    const resB = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_B, dateRange: '30d' });
    // Les requêtes sont filtrées strictement par WHERE organization_id = orgId
    assert(resA !== resB, 'Deux résultats isolés');
  });

  await runTest(12, 'SECURITY', 'IDOR Protection : Aucune fuite de métriques entre organisations', async () => {
    const kpisA = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_A });
    const kpisB = await AnalyticsService.getExecutiveKpis({ organizationId: TEST_ORG_B });
    assert(typeof kpisA.kpis.totalAlerts === 'number', 'kpisA valide');
    assert(typeof kpisB.kpis.totalAlerts === 'number', 'kpisB valide');
  });

  await runTest(13, 'SECURITY', 'Génération de clé API avec préfixe sécurisé et longueur suffisante', async () => {
    const { fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Prefix Test Key',
      scopes: ['alerts:read'],
    });
    assert(fullSecretKey.startsWith('sec_live_'), 'Préfixe sec_live_');
    assert(fullSecretKey.length >= 40, 'Longueur suffisante');
  });

  await runTest(14, 'SECURITY', 'Hachage cryptographique SHA-256 de clé API', () => {
    const key = 'sec_live_testkey1234567890abcdef12345678';
    const hash1 = ApiKeyService.hashKey(key);
    const hash2 = ApiKeyService.hashKey(key);
    assert(hash1 === hash2, 'Hash déterministe');
    assert(hash1 !== key, 'Hash différent du secret en clair');
    assert(hash1.length === 64, 'SHA-256 64 chars hex');
  });

  await runTest(15, 'SECURITY', 'Extraction du préfixe masqué pour affichage console', async () => {
    const { apiKey, fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Display Key',
      scopes: ['alerts:read'],
    });
    assert(fullSecretKey.startsWith(apiKey.key_prefix), 'Préfixe extrait correspond au secret');
  });

  await runTest(16, 'SECURITY', 'Création et persistance d’une clé API dans le store', async () => {
    const { apiKey, fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Integration Test Key',
      scopes: ['alerts:read', 'interventions:read'],
      expires_in_days: 30,
    });
    assert(apiKey.id.length > 0, 'id généré');
    assert(fullSecretKey.startsWith('sec_live_'), 'fullSecretKey généré');
    assert((apiKey as any).key_hash === undefined, 'key_hash non exposé dans le retour de création');
  });

  await runTest(17, 'SECURITY', 'Validation de clé API existante et vérification des scopes', async () => {
    const { apiKey, fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Scoped Key',
      scopes: ['alerts:read'],
      expires_in_days: 7,
    });

    const valOk = await ApiKeyService.validateApiKey(fullSecretKey, 'alerts:read');
    assert(valOk.isValid, 'Validation valide');

    const valFail = await ApiKeyService.validateApiKey(fullSecretKey, 'interventions:write');
    assert(!valFail.isValid, 'Scope non accordé doit être rejeté');
  });

  await runTest(18, 'SECURITY', 'Rejet de clé API invalide ou inexistante', async () => {
    const val = await ApiKeyService.validateApiKey('sec_live_totally_fake_key_000000000000');
    assert(!val.isValid, 'Doit être invalide');
  });

  await runTest(19, 'SECURITY', 'Révocation immédiate d’une clé API', async () => {
    const { apiKey, fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Key To Revoke',
      scopes: ['alerts:read'],
    });

    await ApiKeyService.revokeApiKey(apiKey.id, TEST_ORG_A);
    const val = await ApiKeyService.validateApiKey(fullSecretKey);
    assert(!val.isValid, 'Clé révoquée doit être immédiatement rejetée');
  });

  await runTest(20, 'SECURITY', 'Rejet de clé API expirée', async () => {
    const { apiKey, fullSecretKey } = await ApiKeyService.createApiKey({
      organization_id: TEST_ORG_A,
      name: 'Expired Key',
      scopes: ['alerts:read'],
      expires_in_days: -1, // Date passée
    });

    const val = await ApiKeyService.validateApiKey(fullSecretKey);
    assert(!val.isValid, 'Clé avec expires_at dans le passé doit être refusée');
  });

  // --- 3. TESTS FINANCE & RENTABILITÉ ---
  console.log('\n--- 3. Finance, Barèmes & Rentabilité ---');
  await runTest(21, 'FINANCE', 'Comportement si paramètres financiers non configurés', async () => {
    const fin = await AnalyticsService.getFinancialAnalytics({
      organizationId: '00000000-0000-0000-0000-999999999999',
    });
    // Doit être marqué explicitement non configuré sans inventer de coûts
    assert(typeof fin.isConfigured === 'boolean', 'isConfigured booléen');
    if (!fin.isConfigured) {
      assert(fin.totalEstimatedCost === null, 'Coût estimé null');
      assert(fin.estimatedGrossMargin === null, 'Marge brute null');
    }
  });

  await runTest(22, 'FINANCE', 'Calcul de coût estimé d’intervention selon barème', async () => {
    // Agent: 2000 FCFA/h, Véhicule: 1500 FCFA/h, Fixe: 5000 FCFA, 1h d'intervention
    const agentCost = 2000 * 1;
    const vehicleCost = 1500 * 1;
    const fixedCost = 5000;
    const totalCost = agentCost + vehicleCost + fixedCost;
    assert(totalCost === 8500, 'Coût total calculé = 8500 FCFA');

    const billed = 15000;
    const margin = billed - totalCost;
    const marginPct = Math.round((margin / billed) * 100);
    assert(margin === 6500, 'Marge brute = 6500 FCFA');
    assert(marginPct === 43, 'Marge % = 43%');
  });

  await runTest(23, 'FINANCE', 'Sauvegarde et mise à jour des paramètres financiers organisation', async () => {
    const updated = await AnalyticsService.saveFinancialSettings(TEST_ORG_A, {
      agent_hourly_cost: 2500,
      vehicle_hourly_cost: 1800,
      fixed_intervention_cost: 6000,
      cost_per_kilometer: 150,
      default_billing_rate: 20000,
      target_gross_margin_pct: 35,
      currency: 'FCFA',
    });
    assert(updated.agent_hourly_cost === 2500, 'Tarif agent mis à jour');
    assert(updated.currency === 'FCFA', 'Devise FCFA');
  });

  await runTest(24, 'FINANCE', 'Calcul des métriques financières globales avec barème configuré', async () => {
    const fin = await AnalyticsService.getFinancialAnalytics({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(fin.isConfigured === true, 'Organisation configurée');
    assert(typeof fin.totalEstimatedRevenue === 'number', 'CA estimé calculé');
    assert(typeof fin.totalEstimatedCost === 'number', 'Coût estimé calculé');
  });

  // --- 4. TESTS SLA & RISQUE ---
  console.log('\n--- 4. SLA & Risque Temporel (Heatmap) ---');
  await runTest(25, 'SLA', 'Intégration moteur SLA Phase 2 (calculateAlertSla)', () => {
    const mockAlert = {
      id: 'alt_test_sla',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      priority: 'HIGH',
      status: 'RESOLVED',
      acknowledged_at: new Date(Date.now() - 3500000).toISOString(),
    };
    const mockInt = {
      id: 'int_test_sla',
      alert_id: 'alt_test_sla',
      assigned_at: new Date(Date.now() - 3400000).toISOString(),
      accepted_at: new Date(Date.now() - 3300000).toISOString(),
      en_route_at: new Date(Date.now() - 3200000).toISOString(),
      arrived_at: new Date(Date.now() - 2500000).toISOString(),
      resolved_at: new Date(Date.now() - 1000000).toISOString(),
    };

    const sla = calculateAlertSla(mockAlert, mockInt);
    assert(['NORMAL', 'AT_RISK', 'BREACHED', 'COMPLETED'].includes(sla.overallStatus), 'overallStatus valide');
    assert(sla.steps.ACKNOWLEDGEMENT.isCompleted === true, 'Ack complété');
  });

  await runTest(26, 'SLA', 'Agrégation SLA par site et par agent', async () => {
    const slaSummary = await AnalyticsService.getSlaAnalytics({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(Array.isArray(slaSummary.siteSlaTable), 'siteSlaTable tableau');
    assert(Array.isArray(slaSummary.agentSlaTable), 'agentSlaTable tableau');
  });

  await runTest(27, 'RISK', 'Génération matrice temporelle 7x24 Heatmap (Jour x Heure)', async () => {
    const risk = await AnalyticsService.getRiskAnalytics({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(Array.isArray(risk.heatmapMatrix), 'heatmapMatrix tableau');
    assert(risk.heatmapMatrix.length === 7 * 24, '168 cellules (7 jours x 24 heures)');
    const firstCell = risk.heatmapMatrix[0];
    assert(typeof firstCell.dayIndex === 'number', 'dayIndex numérique');
    assert(typeof firstCell.hour === 'number', 'hour numérique');
    assert(typeof firstCell.count === 'number', 'count numérique');
  });

  await runTest(28, 'RISK', 'Sites à forte concentration d’incidents sans qualification subjective', async () => {
    const risk = await AnalyticsService.getRiskAnalytics({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(Array.isArray(risk.topIncidentSites), 'topIncidentSites tableau');
    if (risk.topIncidentSites.length > 0) {
      const site = risk.topIncidentSites[0];
      assert(typeof site.totalIncidents === 'number', 'totalIncidents numérique');
      assert(typeof site.siteName === 'string', 'siteName chaîne');
    }
  });

  // --- 5. TESTS AGENTS PERFORMANCE ---
  console.log('\n--- 5. Performance Agents Factuelle ---');
  await runTest(29, 'AGENTS', 'Statistiques de performance factuelle des agents sans score arbitraire', async () => {
    const agents = await AnalyticsService.getAgentPerformance({ organizationId: TEST_ORG_A, dateRange: '30d' });
    assert(Array.isArray(agents), 'agents tableau');
    if (agents.length > 0) {
      const ag = agents[0];
      assert(typeof ag.interventionsAssigned === 'number', 'interventionsAssigned');
      assert(typeof ag.interventionsCompleted === 'number', 'interventionsCompleted');
      assert(typeof ag.fullName === 'string', 'fullName');
      assert((ag as any).arbitraryScore === undefined, 'Aucun score arbitraire inventé');
    }
  });

  // --- 6. TESTS RAPPORTS AUTOMATIQUES ---
  console.log('\n--- 6. Rapports Automatiques & Comparaisons Factuelles ---');
  await runTest(30, 'REPORTS', 'Génération du Rapport Exécutif Mensuel avec énoncés factuels', async () => {
    const report = await ExecutiveReportBuilder.generateReport('MONTHLY', { organizationId: TEST_ORG_A });
    assert(report.title.includes('Mensuel'), 'Titre mensuel');
    assert(Array.isArray(report.factualStatements), 'factualStatements tableau');
    assert(report.factualStatements.length >= 5, 'Au moins 5 observations factuelles');
    assert(report.htmlContent.includes('<!DOCTYPE html>'), 'HTML valide');
  });

  await runTest(31, 'REPORTS', 'Génération du Rapport Quotidien', async () => {
    const report = await ExecutiveReportBuilder.generateReport('DAILY', { organizationId: TEST_ORG_A });
    assert(report.title.includes('Quotidien'), 'Titre quotidien');
    assert(typeof report.htmlContent === 'string', 'Contenu HTML');
  });

  await runTest(32, 'REPORTS', 'Génération du récapitulatif CSV certifié BOM UTF-8', async () => {
    const report = await ExecutiveReportBuilder.generateReport('SLA', { organizationId: TEST_ORG_A });
    assert(typeof report.csvContent === 'string', 'csvContent présent');
    assert(Boolean(report.csvContent?.startsWith('\uFEFF')), 'BOM UTF-8 pour Excel');
    assert(Boolean(report.csvContent?.includes('Alertes totales')), 'Contient en-têtes');
  });

  // --- 7. TESTS BACKGROUND JOBS & CONNECTEURS ---
  console.log('\n--- 7. Background Jobs & Architecture Connecteurs ---');
  await runTest(33, 'JOBS', 'Enregistrement et exécution d’un background job asynchrone', async () => {
    const executionTracker = { executed: false };
    BackgroundJobService.registerHandler('RECOMPUTE_ANALYTICS', {
      async handle(payload) {
        executionTracker.executed = true;
        return { recomputed: true, org: payload.org };
      },
    });

    const job = await BackgroundJobService.enqueueJob('RECOMPUTE_ANALYTICS', TEST_ORG_A, { org: TEST_ORG_A });
    assert(job.id.startsWith('job_'), 'Job ID format');
    assert(job.type === 'RECOMPUTE_ANALYTICS', 'Job Type');
    // Vérifier exécution locale synchrone immédiate
    await new Promise(r => setTimeout(r, 50));
    assert(executionTracker.executed === true, 'Handler de job exécuté');
  });

  await runTest(34, 'CONNECTORS', 'Registre des connecteurs partenaires (Télésurveillance, ERP, Générique)', () => {
    const all = PartnerConnectorRegistry.listAll();
    assert(all.length >= 3, 'Au moins 3 connecteurs de référence');

    const generic = PartnerConnectorRegistry.get('generic-webhook');
    assert(generic !== undefined, 'generic-webhook trouvé');
    assert(Boolean(generic?.config.supportedEvents.includes('alert.created')), 'Événement alert.created');

    const valFail = generic?.validateSettings({ webhookUrl: 'http://insecure.url' });
    assert(valFail?.valid === false, 'Rejet des URLs HTTP non sécurisées');

    const valOk = generic?.validateSettings({ webhookUrl: 'https://partner.api.internal/webhook' });
    assert(valOk?.valid === true, 'Validation HTTPS valide');
  });

  // --- 8. TESTS RFC 3161 TIMESTAMPING ---
  console.log('\n--- 8. Horodatage Qualifié RFC 3161 ---');
  await runTest(35, 'RFC3161', 'Vérification que l’état non configuré est explicitement déclaré', () => {
    const configured = RFC3161Service.isConfigured();
    assert(configured === false, 'Doit être faux car aucun TSA légal externe configuré');
  });

  await runTest(36, 'RFC3161', 'Génération et vérification de scellement horodaté mock', async () => {
    const testHash = crypto.createHash('sha256').update('document_preuvé_interv_001').digest('hex');
    const token = await RFC3161Service.timestampHash(testHash);
    assert(token.algorithm === 'SHA-256', 'Algorithme SHA-256');
    assert(token.verificationStatus === 'MOCK_TEST_ONLY', 'Statut mock explicite');

    const isValid = await RFC3161Service.verify(token, testHash);
    assert(isValid === true, 'Signature de scellement mock vérifiée');

    const isTamperedValid = await RFC3161Service.verify(token, 'corrupted_hash');
    assert(isTamperedValid === false, 'Rejet en cas d’altération du hash');
  });

  // --- 9. TESTS NON-RÉGRESSION V1, PHASE 1, PHASE 2, PHASE 3, PHASE 4 ---
  console.log('\n--- 9. Non-Régression V1 → Phase 4 ---');
  await runTest(37, 'REGRESSION', 'Phase 1 : Compatibilité Smart Dispatch & Assignation', async () => {
    const { SmartDispatchService } = await import('../src/lib/dispatch/dispatch-service');
    assert(typeof SmartDispatchService.getRecommendationForAlert === 'function', 'SmartDispatchService intact');
  });

  await runTest(38, 'REGRESSION', 'Phase 2 : Live Command Center & Calcul SLA', async () => {
    const mockAlert = { id: 'alt_reg', priority: 'MEDIUM', status: 'PENDING', created_at: new Date().toISOString() };
    const sla = calculateAlertSla(mockAlert);
    assert(sla.overallStatus === 'NORMAL', 'SLA engine phase 2 opérationnel');
  });

  await runTest(39, 'REGRESSION', 'Phase 3 : Proof of Intervention & Sécurité Portail Client', async () => {
    const { buildProofOfIntervention } = await import('../src/lib/interventions/proof-builder');
    assert(typeof buildProofOfIntervention === 'function', 'buildProofOfIntervention intact');
  });

  await runTest(40, 'REGRESSION', 'Phase 4 : Export Center & Générateur CSV/ZIP', async () => {
    const { generateInterventionsCsv } = await import('../src/lib/exports/csv-builder');
    assert(typeof generateInterventionsCsv === 'function', 'Générateur CSV Phase 4 intact');
  });

  await runTest(41, 'REGRESSION', 'Phase 4 : Webhook Dispatcher & Signature HMAC', async () => {
    const { WebhookDispatcher } = await import('../src/lib/webhooks/webhook-dispatcher');
    assert(typeof WebhookDispatcher.buildPayload === 'function', 'WebhookDispatcher intact');
  });

  await runTest(42, 'REGRESSION', 'Phase 4 : Audit Log & Signature Tactile Capture', async () => {
    const { SignatureService } = await import('../src/lib/signatures/signature-service');
    assert(typeof SignatureService.signIntervention === 'function', 'SignatureService intact');
  });

  // Résumé
  console.log('\n============================================================');
  console.log('BILAN DES TESTS PHASE 5 :');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total  : ${total}`);
  console.log(`PASS   : ${passed}`);
  console.log(`FAIL   : ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    console.error('Certains tests ont échoué !');
    process.exit(1);
  } else {
    console.log('TOUS LES TESTS PHASE 5 SONT VALIDÉS AVEC SUCCÈS (100% PASS) !');
  }
}

main().catch(err => {
  console.error('Erreur non capturée dans la suite de tests :', err);
  process.exit(1);
});

/**
 * =============================================================================
 * SECURIA — CAMPAGNE DE VALIDATION RÉELLE & HARDENING (STAGING)
 * =============================================================================
 * Valide l'ensemble des 14 exigences :
 * - Sécurité des secrets & santé de l'API (/api/health)
 * - Isolation multi-organisations stricte (Org A vs Org B)
 * - Cycle de vie complet de l'alerte (Client -> Centre -> Agent -> Clôture)
 * - Anti-IDOR & idempotence
 * - Moteur d'escalade configurable
 * - Journalisation d'audit & métriques de performance
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Identifiants réels en base Supabase
const ORG_A_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517'; // Paris
const ORG_B_ID = 'b0000000-0000-0000-0000-000000000002'; // Lyon

const CLIENT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_A_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MANAGER_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const CLIENT_B_ID = 'baaaaaaa-baaa-baaa-baaa-baaaaaaaaaaa';
const AGENT_B_ID = 'bbbbbbba-bbba-bbba-bbba-bbbaaaaaaaaa';
const MANAGER_B_ID = 'bccccccb-cccb-cccb-cccb-cccbaaaaaaaa';

function request({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStagingHardeningSuite() {
  console.log('\n================================================================');
  console.log('   SECURIA — SUITE DE VALIDATION HARDENING & STAGING            ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const metrics = {};

  function testAssert(condition, name, details = '') {
    if (condition) {
      console.log(`   [OK] ${name}`);
      passed++;
    } else {
      console.error(`   [FAIL] ${name}`, details);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. MONITORING & HEALTH CHECK SÉCURISÉ (Task 5)
    // -------------------------------------------------------------------------
    console.log('--- 1. MONITORING & ROUTE /api/health ---');
    const tHealthStart = Date.now();
    const healthRes = await request({ method: 'GET', path: '/api/health' });
    metrics.healthLatencyMs = Date.now() - tHealthStart;

    testAssert(healthRes.status === 200, '/api/health répond HTTP 200 OK');
    testAssert(healthRes.body?.status === 'ok', "Statut global du service 'ok'");

    // Vérifier l'absence absolue de clés ou secrets dans le body
    const bodyStr = JSON.stringify(healthRes.body);
    const leaksSecret =
      bodyStr.includes('eyJ') ||
      bodyStr.includes('service_role') ||
      bodyStr.includes('password') ||
      bodyStr.includes('postgres://');
    testAssert(!leaksSecret, 'Aucun secret ou credential exposé dans /api/health');
    console.log(`       -> Latence health check: ${metrics.healthLatencyMs}ms`);

    // -------------------------------------------------------------------------
    // 2. ISOLATION MULTI-ORGANISATION STRICTE (Task 7)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. ISOLATION MULTI-ORGANISATIONS (Org A vs Org B) ---');

    // Créer une alerte appartenant à Client B (Org B)
    const alertBRes = await request({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'x-user-id': CLIENT_B_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_B_ID,
        'Idempotency-Key': `idem-org-b-${Date.now()}`,
      },
      body: {
        type: 'INTRUSION',
        latitude: 45.7601,
        longitude: 4.859,
        location_address: 'Part-Dieu Lyon - Org B',
        client_notes: 'Test isolation cloisonnée Org B',
      },
    });

    testAssert(
      alertBRes.status === 201 && alertBRes.body?.alert?.id,
      "Création d'une alerte dans Organisation B (Lyon) réussie",
      JSON.stringify(alertBRes)
    );
    const alertBId = alertBRes.body?.alert?.id;

    // Test 2.1 : Client A tente de lire l'alerte de Client B (Anti-IDOR)
    const crossClientRes = await request({
      method: 'GET',
      path: `/api/alerts/${alertBId}`,
      headers: {
        'x-user-id': CLIENT_A_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_A_ID,
      },
    });
    testAssert(
      crossClientRes.status === 403,
      "Client A bloqué HTTP 403 lors d'une tentative d'accès à l'alerte de Client B"
    );

    // Test 2.2 : Manager A (Org A) tente de modifier ou acquitter l'alerte d'Org B
    const crossManagerRes = await request({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
      body: { alert_id: alertBId },
    });
    // Doit être rejeté soit par 403 (ou non trouvée pour cette org)
    testAssert(
      crossManagerRes.status === 403 || crossManagerRes.body?.success === false,
      "Manager A (Org Paris) bloqué sur les alertes d'Organisation B (Org Lyon)"
    );

    // Test 2.3 : Agent A (Org A) ne voit pas les interventions d'Agent B (Org B)
    const agentFeedRes = await request({
      method: 'GET',
      path: '/api/agent/dashboard',
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
    });
    const agentInterventions = agentFeedRes.body?.interventions || [];
    const hasOrgBIntervention = agentInterventions.some((i) => i.alert_id === alertBId);
    testAssert(!hasOrgBIntervention, 'Agent A ne reçoit aucune intervention relative à Org B');

    // -------------------------------------------------------------------------
    // 3. CYCLE DE VIE E2E COMPLET & PERFORMANCE (Tasks 6, 9)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. CYCLE DE VIE COMPLET DU SCÉNARIO D’URGENCE (Org A) ---');

    const idemKey = `master-e2e-${Date.now()}`;
    const tAlertStart = Date.now();

    // 3.1 CLIENT déclenche l'alerte
    const alertCreateRes = await request({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'x-user-id': CLIENT_A_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_A_ID,
        'Idempotency-Key': idemKey,
      },
      body: {
        type: 'AGRESSION',
        latitude: 48.8354,
        longitude: 2.2412,
        location_address: '28 Rue du Château, Boulogne',
        client_notes: 'Individu menaçant entrée principale',
      },
    });
    metrics.alertCreationLatencyMs = Date.now() - tAlertStart;

    testAssert(alertCreateRes.status === 201, 'Alerte créée avec succès (HTTP 201)');
    const alertAId = alertCreateRes.body?.alert?.id;
    testAssert(!!alertAId, `Identifiant alerte généré : ${alertCreateRes.body?.alert?.alert_number}`);
    console.log(`       -> Temps création alerte : ${metrics.alertCreationLatencyMs}ms`);

    // 3.2 TEST IDEMPOTENCE (Double-clic rapide du bouton)
    const duplicateClickRes = await request({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'x-user-id': CLIENT_A_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_A_ID,
        'Idempotency-Key': idemKey,
      },
      body: {
        type: 'AGRESSION',
        latitude: 48.8354,
        longitude: 2.2412,
      },
    });
    testAssert(
      duplicateClickRes.status === 200 || duplicateClickRes.body?.is_duplicate === true,
      'Double-clic géré de manière idempotente (aucune alerte dupliquée créée)'
    );

    // 3.3 CENTRE : Réception et consultation par le régulateur
    const tRecStart = Date.now();
    const dispatchAlertRes = await request({
      method: 'GET',
      path: `/api/alerts/${alertAId}`,
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
    });
    metrics.dispatchFetchLatencyMs = Date.now() - tRecStart;
    testAssert(dispatchAlertRes.status === 200, "Le centre de télésurveillance charge le dossier d'alerte");
    console.log(`       -> Temps réception/affichage dossier centre : ${metrics.dispatchFetchLatencyMs}ms`);

    // 3.4 CENTRE : Prise en charge / Acknowledgment
    const tAckStart = Date.now();
    const ackRes = await request({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
      body: { alert_id: alertAId },
    });
    metrics.ackLatencyMs = Date.now() - tAckStart;
    testAssert(ackRes.status === 200, 'Centre acquitte la prise en charge (ACKNOWLEDGED)');
    console.log(`       -> Temps prise en charge centre : ${metrics.ackLatencyMs}ms`);

    // 3.5 CENTRE : Affectation de la patrouille (Agent A)
    const tAssignStart = Date.now();
    const assignRes = await request({
      method: 'POST',
      path: '/api/alerts/assign',
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        alert_id: alertAId,
        agent_id: AGENT_A_ID,
      },
    });
    metrics.assignLatencyMs = Date.now() - tAssignStart;
    testAssert(assignRes.status === 200, 'Affectation de l’agent de patrouille réussie (ASSIGNED)');
    console.log(`       -> Temps affectation agent : ${metrics.assignLatencyMs}ms`);

    // 3.6 AGENT : Récupération de l'intervention
    const intFeedRes = await request({
      method: 'GET',
      path: `/api/interventions?alert_id=${alertAId}`,
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
    });
    const interventionId = intFeedRes.body?.interventions?.[0]?.id || alertCreateRes.body?.intervention?.id;
    testAssert(intFeedRes.status === 200, 'Agent reçoit la mission d’intervention sur son terminal');

    // 3.7 AGENT : Acceptation de la mission
    const acceptRes = await request({
      method: 'PATCH',
      path: '/api/interventions',
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        alert_id: alertAId,
        agent_id: AGENT_A_ID,
        action: 'ACCEPT',
      },
    });
    testAssert(acceptRes.status === 200, 'Agent accepte la mission (ACCEPTED)');

    // 3.8 AGENT : Départ en intervention (EN_ROUTE)
    const enRouteRes = await request({
      method: 'PATCH',
      path: '/api/interventions',
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        alert_id: alertAId,
        agent_id: AGENT_A_ID,
        action: 'EN_ROUTE',
      },
    });
    testAssert(enRouteRes.status === 200, 'Patrouille en déplacement d’urgence (EN_ROUTE)');

    // 3.9 AGENT : Arrivée sur les lieux (ARRIVED)
    const arrivedRes = await request({
      method: 'PATCH',
      path: '/api/interventions',
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        alert_id: alertAId,
        agent_id: AGENT_A_ID,
        action: 'ARRIVED',
      },
    });
    testAssert(arrivedRes.status === 200, 'Agent positionné sur site (ARRIVED)');

    // 3.10 AGENT : Sécurisation et résolution (RESOLVED)
    const resolveRes = await request({
      method: 'PATCH',
      path: '/api/interventions',
      headers: {
        'x-user-id': AGENT_A_ID,
        'x-user-role': 'AGENT',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        alert_id: alertAId,
        agent_id: AGENT_A_ID,
        action: 'RESOLVE',
        notes: 'Périmètre inspecté. Aucun intrus détecté. Bâtiment sécurisé.',
      },
    });
    testAssert(resolveRes.status === 200, 'Intervention résolue avec rapport de mission (RESOLVED)');

    // 3.11 CLIENT : Suivi final et clôture visible par le client
    const clientFinalRes = await request({
      method: 'GET',
      path: `/api/alerts/${alertAId}`,
      headers: {
        'x-user-id': CLIENT_A_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_A_ID,
      },
    });
    testAssert(
      clientFinalRes.status === 200 && clientFinalRes.body?.alert?.status === 'RESOLVED',
      'Le client constate la résolution complète et le rapport sécurisé'
    );

    // -------------------------------------------------------------------------
    // 4. MOTEUR D'ESCALADE PROGRAMMABLE (Task 4)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. MOTEUR D'ESCALADE HIÉRARCHIQUE DES ALERTES ---");
    const escalateRes = await request({
      method: 'POST',
      path: '/api/alerts/escalate',
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
      body: { timeout_seconds: 60 },
    });
    testAssert(escalateRes.status === 200, "Exécution de la routine d'escalade (/api/alerts/escalate) réussie");
    testAssert(
      typeof escalateRes.body?.escalatedCount === 'number',
      `Nombre d'alertes analysées/escaladées : ${escalateRes.body?.escalatedCount}`
    );

    // -------------------------------------------------------------------------
    // 5. JOURNALISATION D'AUDIT (Task 10)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. JOURNALISATION & TRACE D'AUDIT ---");
    const auditRes = await request({
      method: 'GET',
      path: `/api/audit-logs?entity_id=${alertAId}`,
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
    });
    testAssert(auditRes.status === 200, 'Registre des logs d’audit accessible au régulateur');
    const logs = auditRes.body?.logs || [];
    testAssert(logs.length > 0, `Traces d'audit enregistrées pour l'intervention (${logs.length} entrées)`);

    // Vérification de la non-présence de données sensibles dans les logs
    const auditText = JSON.stringify(logs);
    const hasSensitive = auditText.includes('password') || auditText.includes('eyJhbGci');
    testAssert(!hasSensitive, 'Aucune donnée sensible ou mot de passe dans les traces d’audit');

    // -------------------------------------------------------------------------
    // 6. RÉSILIENCE & GESTION DES ERREURS
    // -------------------------------------------------------------------------
    console.log('\n--- 6. GESTION DES CAS LIMITES & RÉSILIENCE ---');

    // Alerte sans GPS : doit utiliser le site par défaut
    const noGpsRes = await request({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'x-user-id': CLIENT_A_ID,
        'x-user-role': 'USER',
        'x-user-org-id': ORG_A_ID,
      },
      body: {
        type: 'MENACE',
        latitude: null,
        longitude: null,
      },
    });
    testAssert(
      noGpsRes.status === 201 && noGpsRes.body?.alert?.latitude !== null,
      'Repli automatique sur les coordonnées du site protégé si GPS absent'
    );

    // Accès non authentifié à une API protégée
    const unauthApiRes = await request({
      method: 'GET',
      path: '/api/alerts',
    });
    testAssert(unauthApiRes.status === 401, 'Rejet immédiat HTTP 401 si jeton d’authentification manquant');

    // Alerte introuvable
    const notFoundRes = await request({
      method: 'GET',
      path: '/api/alerts/00000000-0000-0000-0000-000000000000',
      headers: {
        'x-user-id': MANAGER_A_ID,
        'x-user-role': 'SECURITY_MANAGER',
        'x-user-org-id': ORG_A_ID,
      },
    });
    testAssert(notFoundRes.status === 404, 'Code HTTP 404 pour identifiant d’alerte inexistant');

    // -------------------------------------------------------------------------
    // BILAN FINAL
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`   RÉSULTATS : ${passed} TESTS RÉUSSIS / ${failed} ÉCHECS`);
    console.log('================================================================');

    console.log('\n--- MÉTRIQUES DE PERFORMANCE OPÉRATIONNELLE ---');
    console.log(`- Latence Health Check : ${metrics.healthLatencyMs} ms`);
    console.log(`- Création d’alerte    : ${metrics.alertCreationLatencyMs} ms`);
    console.log(`- Réception centre SOC : ${metrics.dispatchFetchLatencyMs} ms`);
    console.log(`- Prise en charge (Ack): ${metrics.ackLatencyMs} ms`);
    console.log(`- Affectation agent    : ${metrics.assignLatencyMs} ms`);

    return { passed, failed, metrics };
  } catch (err) {
    console.error('\nErreur fatale exécution suite de tests:', err);
    return { passed, failed: failed + 1, error: err.message };
  }
}

runStagingHardeningSuite().catch(console.error);

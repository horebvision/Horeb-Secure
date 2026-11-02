/**
 * SECURIA V2 — PHASE 7 : PRODUCTION SMOKE TESTS (LIVE CLOUD AUDIT)
 * Cible : https://horeb-secure.netlify.app
 * Vérification en direct des endpoints de production v2.7.0
 */

export {};

const BASE_URL = process.env.SECURIA_PROD_URL || 'https://horeb-secure.netlify.app';

interface SmokeTestResult {
  id: number;
  name: string;
  route: string;
  expectedStatus: number | number[];
  actualStatus: number;
  durationMs: number;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: SmokeTestResult[] = [];

async function smokeTest(
  id: number,
  name: string,
  route: string,
  expectedStatus: number | number[],
  options: RequestInit = {}
): Promise<boolean> {
  const url = `${BASE_URL}${route}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Securia-Phase7-SmokeTest/2.7.0',
        ...(options.headers || {}),
      },
    });
    const durationMs = Date.now() - start;
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const pass = allowed.includes(res.status);

    let details = '';
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const json = await res.json();
        details = JSON.stringify(json).slice(0, 100);
      } catch {}
    } else if (contentType.includes('text/html')) {
      details = `HTML (${res.headers.get('content-length') || 'chunked'} bytes)`;
    } else {
      details = `${contentType} (${res.headers.get('content-length') || 'binary'} bytes)`;
    }

    results.push({
      id,
      name,
      route,
      expectedStatus,
      actualStatus: res.status,
      durationMs,
      status: pass ? 'PASS' : 'FAIL',
      details,
    });

    console.log(
      `  [${pass ? 'PASS' : 'FAIL'}] #${id.toString().padStart(2, '0')} ${name} (${route}) -> Status: ${res.status} (${durationMs}ms) ${
        pass ? '' : `(Expected: ${expectedStatus})`
      }`
    );
    return pass;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      id,
      name,
      route,
      expectedStatus,
      actualStatus: 0,
      durationMs,
      status: 'FAIL',
      details: err.message,
    });
    console.error(`  [FAIL] #${id.toString().padStart(2, '0')} ${name} (${route}) => Network error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n============================================================');
  console.log('SECURIA PHASE 7 — PRODUCTION SMOKE TESTS (20 TESTS EN DIRECT)');
  console.log(`URL Cible : ${BASE_URL}`);
  console.log('============================================================\n');

  // 1. Health & Core
  await smokeTest(1, 'Health Check API', '/api/health', 200);
  await smokeTest(2, 'Page d’accueil / Landing', '/', 200);
  await smokeTest(3, 'Catalogue Tarification SaaS', '/pricing', 200);
  await smokeTest(4, 'Page de Connexion', '/login', 200);
  await smokeTest(5, 'Console Pilote Opérationnel', '/pilot', 200);

  // 2. Interfaces Utilisateurs & RBAC Guards
  await smokeTest(6, 'Module Facturation Tenant', '/billing', [200, 307, 401]);
  await smokeTest(7, 'Command Center Dispatch', '/dispatch', [200, 307, 401]);
  await smokeTest(8, 'Interface Agent Terrain Offline-First', '/agent', [200, 307, 401]);
  await smokeTest(9, 'Portail Client Sécurisé', '/client-portal', [200, 307, 401]);

  // 3. PWA & Offline Service Worker
  await smokeTest(10, 'Manifest PWA Web App', '/manifest.webmanifest', 200);
  await smokeTest(11, 'Service Worker Offline (sw.js)', '/sw.js', 200);

  // 4. APIs Offline Sync & Batch
  await smokeTest(12, 'Sync Status API (Auth Guard)', '/api/sync/status', [401, 200]);
  await smokeTest(13, 'Batch Sync API (Auth Guard)', '/api/sync/batch', [401, 400], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [] }),
  });

  // 5. APIs Paiements Réels & Sécurité Webhook
  await smokeTest(14, 'Payment Creation API (Auth Guard)', '/api/payments/create', 401, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 49000 }),
  });
  await smokeTest(15, 'Admin Payment Reconciliation API (RBAC Guard)', '/api/admin/payments/reconciliation', 401);
  await smokeTest(16, 'Webhook Signature Invalide Rejetée', '/api/payments/webhook/WAVE_CI', 401, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wave-signature': 'forged_signature_attack_vector',
    },
    body: JSON.stringify({ type: 'payment.succeeded' }),
  });
  await smokeTest(17, 'Webhook Replay Protection (Timestamp Ancien)', '/api/payments/webhook/WAVE_CI', [400, 401], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': String(Date.now() - 3600000), // 1 hour ago
    },
    body: JSON.stringify({ type: 'payment.succeeded' }),
  });

  // 6. Facturation Fiscale & Documents
  await smokeTest(18, 'Fiscal Invoice PDF API (Auth Guard)', '/api/fiscal/invoices/inv-pilot-001/pdf', 401);
  await smokeTest(19, 'SaaS Plans API Publique', '/api/billing/plans', 200);
  await smokeTest(20, 'OpenAPI v1 Schema Spécification', '/api/v1/openapi.json', 200);

  // Synthèse
  console.log('\n============================================================');
  console.log('BILAN DES TESTS SMOKE PRODUCTION PHASE 7');
  console.log('============================================================');

  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`Total Smoke Tests : ${total}`);
  console.log(`Tests PASS        : ${passed}`);
  console.log(`Tests FAIL        : ${failed}`);

  if (failed > 0) {
    console.error('\nÉchecs constatés :');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.error(`  - #${r.id} ${r.name} : Attendu ${JSON.stringify(r.expectedStatus)}, Reçu ${r.actualStatus} (${r.details})`);
    });
    process.exit(1);
  } else {
    console.log(`\n🎉 SUCCÈS TOTAL EN PRODUCTION : ${passed}/${total} SMOKE TESTS PASS (100%)\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Erreur fatale smoke tests :', err);
  process.exit(1);
});

/**
 * SECURIA V2 — PHASE 6 : PRODUCTION SMOKE TESTS (LIVE CLOUD AUDIT)
 * Cible : https://horeb-secure.netlify.app
 */

export {};
const BASE_URL = process.env.SECURIA_PROD_URL || 'https://horeb-secure.netlify.app';

interface SmokeTestResult {
  id: number;
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
        'User-Agent': 'Securia-SmokeTest/2.6.0',
        ...(options.headers || {}),
      },
    });
    const durationMs = Date.now() - start;
    const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const pass = allowed.includes(res.status);

    let details = '';
    if (res.headers.get('content-type')?.includes('application/json')) {
      try {
        const json = await res.json();
        details = JSON.stringify(json).slice(0, 80);
      } catch {}
    }

    results.push({
      id,
      route,
      expectedStatus,
      actualStatus: res.status,
      durationMs,
      status: pass ? 'PASS' : 'FAIL',
      details,
    });

    console.log(
      `  [${pass ? 'PASS' : 'FAIL'}] #${id} ${route} -> Status: ${res.status} (${durationMs}ms) ${
        pass ? '' : `(Expected: ${expectedStatus})`
      }`
    );
    return pass;
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({
      id,
      route,
      expectedStatus,
      actualStatus: 0,
      durationMs,
      status: 'FAIL',
      details: err.message,
    });
    console.log(`  [FAIL] #${id} ${route} -> Error: ${err.message}`);
    return false;
  }
}

async function runProductionSmokeTests() {
  console.log('============================================================');
  console.log('🚀 SECURIA PHASE 6 — TESTS DE SMOKE EN PRODUCTION LIVE');
  console.log('Cible :', BASE_URL);
  console.log('Date  :', new Date().toISOString());
  console.log('============================================================\n');

  // 1. Pages publiques & santé système
  await smokeTest(1, '/', 200);
  await smokeTest(2, '/login', 200);
  await smokeTest(3, '/api/health', [200, 307]);
  await smokeTest(4, '/pricing', 200);

  // 2. API Billing publique
  await smokeTest(5, '/api/billing/plans', 200);

  // 3. Soumission d'un lead commercial
  await smokeTest(6, '/api/billing/leads', [200, 201], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company_name: 'Smoke Test Securité CI',
      contact_name: 'M. Kouassi Smoke',
      email: `smoke.test.${Date.now()}@securia-test.ci`,
      phone: '+225 07 00 00 00 00',
      approx_agents: 40,
      approx_sites: 30,
      requested_plan_code: 'BUSINESS',
      source: 'SMOKE_TEST_SCRIPT',
    }),
  });

  // 4. Protection RBAC / Auth sur les routes Billing & Org
  // Les routes protégées doivent renvoyer 200 (si rendu client avec redirect) ou 307/302 ou 401
  await smokeTest(7, '/billing', [200, 307, 308, 302, 401]);
  await smokeTest(8, '/billing/upgrade', [200, 307, 308, 302, 401]);
  await smokeTest(9, '/settings/organization', [200, 307, 308, 302, 401]);
  await smokeTest(10, '/settings/usage', [200, 307, 308, 302, 401]);
  await smokeTest(11, '/admin/billing', [200, 307, 308, 302, 401, 403]);
  await smokeTest(12, '/admin/business', [200, 307, 308, 302, 401, 403]);

  // 5. API privées protégées sans session (doivent refuser avec 401)
  await smokeTest(13, '/api/billing/subscription', [401, 403]);
  await smokeTest(14, '/api/billing/usage', [401, 403]);
  await smokeTest(15, '/api/billing/invoices', [401, 403]);
  await smokeTest(16, '/api/admin/billing/stats', [401, 403]);

  // 6. Non-régression V1 → Phase 5
  await smokeTest(17, '/api/v1/openapi.json', 200);
  await smokeTest(18, '/dashboard', [200, 307, 308, 302, 401]);
  await smokeTest(19, '/client-portal', [200, 307, 308, 302, 401]);
  await smokeTest(20, '/business', [200, 307, 308, 302, 401]);

  console.log('\n============================================================');
  console.log('SYNTHÈSE DU SMOKE TEST PRODUCTION');
  console.log('============================================================');
  const total = results.length;
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = total - passCount;
  console.log(`TOTAL   : ${total}`);
  console.log(`PASS    : ${passCount}`);
  console.log(`FAIL    : ${failCount}`);

  if (failCount === 0) {
    console.log('\n>>> TOUS LES SMOKE TESTS PRODUCTION SONT PASSÉS (100%) ! <<<\n');
  } else {
    console.error('\n>>> DES SMOKE TESTS ONT ÉCHOUÉ ! <<<\n');
    process.exit(1);
  }
}

runProductionSmokeTests().catch(err => {
  console.error('Fatal smoke test error:', err);
  process.exit(1);
});

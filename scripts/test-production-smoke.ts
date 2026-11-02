/**
 * SECURIA V2 — PRODUCTION SMOKE TESTS (PHASE 4)
 * Vérification en direct des endpoints et pages sur https://horeb-secure.netlify.app
 */

export {};
const BASE_URL = 'https://horeb-secure.netlify.app';

async function runSmokeTests() {
  console.log('\n============================================================');
  console.log('🌐 SECURIA V2 PHASE 4 : PRODUCTION SMOKE TESTS');
  console.log(`    URL CIBLE : ${BASE_URL}`);
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  async function checkEndpoint(path: string, expectedStatus: number | number[], description: string) {
    try {
      const url = `${BASE_URL}${path}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Securia-Smoke-Test/2.0' } });
      const allowed = Array.isArray(expectedStatus) ? expectedStatus.includes(res.status) : res.status === expectedStatus;

      if (allowed) {
        console.log(`  ✅ [PASS] ${res.status} : ${description} (${path})`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] Reçu ${res.status} (attendu ${expectedStatus}) : ${description} (${path})`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  ❌ [FAIL] Erreur réseau sur ${path} : ${err.message}`);
      failed++;
    }
  }

  // 1. Health check
  await checkEndpoint('/api/health', 200, 'API Health Check opérationnelle');

  // 2. Export Center Endpoints (Auth Guard check - 401 ou 200 selon headers)
  await checkEndpoint('/api/exports', [200, 401], 'API Export Center répond avec auth guard');

  // 3. Webhook Integrations Endpoints
  await checkEndpoint('/api/integrations', [200, 401], 'API Partenaires Webhook répond avec auth guard');

  // 4. UI Pages (HTML rendu ou redirection Auth)
  await checkEndpoint('/dispatch/exports', [200, 307, 308], 'Page UI Export Center disponible');
  await checkEndpoint('/dispatch/integrations', [200, 307, 308], 'Page UI Intégrations Partenaires disponible');
  await checkEndpoint('/client-portal/interventions', [200, 307, 308], 'Page UI Client Portal disponible');
  await checkEndpoint('/settings/integrations', [200, 307, 308], 'Redirection /settings/integrations active');

  console.log('\n============================================================');
  console.log(`📊 SMOKE TESTS PRODUCTION : ${passed} PASS / ${failed} FAIL`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch(console.error);

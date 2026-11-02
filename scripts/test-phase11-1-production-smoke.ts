// scripts/test-phase11-1-production-smoke.ts
// Test de vérification smoke sur l'environnement de production Netlify

export {};
const PROD_URL = 'https://horeb-secure.netlify.app';

interface SmokeTest {
  path: string;
  method: 'GET' | 'POST';
  expectedStatuses: number[];
  name: string;
  body?: any;
}

const tests: SmokeTest[] = [
  { path: '/', method: 'GET', expectedStatuses: [200], name: 'Page d’accueil publique' },
  { path: '/pricing', method: 'GET', expectedStatuses: [200], name: 'Page Tarifs / Forfaits' },
  { path: '/demo', method: 'GET', expectedStatuses: [200], name: 'Page Demande de Démonstration' },
  { path: '/login', method: 'GET', expectedStatuses: [200], name: 'Page de Connexion' },
  { path: '/register', method: 'GET', expectedStatuses: [200], name: 'Page d’Activation d’Invitation' },
  { path: '/api/health', method: 'GET', expectedStatuses: [200], name: 'Endpoint Health Check' },
  { path: '/dispatch/clients', method: 'GET', expectedStatuses: [200, 302, 307], name: 'Route Dispatch Clients' },
  { path: '/settings/organization', method: 'GET', expectedStatuses: [200, 302, 307], name: 'Route Paramètres Organisation' },
  { path: '/settings/users', method: 'GET', expectedStatuses: [200, 302, 307], name: 'Route Gestion Collaborateurs' },
  { path: '/client-portal', method: 'GET', expectedStatuses: [200, 302, 307], name: 'Route Client Portal' },
  
  // Endpoints API protégés sans session -> doivent renvoyer 401 Unauthorized
  { path: '/api/clients', method: 'GET', expectedStatuses: [401], name: 'API GET /api/clients (unauthenticated)' },
  { path: '/api/clients', method: 'POST', expectedStatuses: [401], name: 'API POST /api/clients (unauthenticated)', body: { name: 'Test' } },
  { path: '/api/clients/00000000-0000-0000-0000-000000000001', method: 'GET', expectedStatuses: [401], name: 'API GET /api/clients/:id (unauthenticated)' },
  { path: '/api/clients/00000000-0000-0000-0000-000000000001/users', method: 'GET', expectedStatuses: [401], name: 'API GET /api/clients/:id/users (unauthenticated)' },
  { path: '/api/clients/00000000-0000-0000-0000-000000000001/users', method: 'POST', expectedStatuses: [401], name: 'API POST /api/clients/:id/users (unauthenticated)', body: { email: 't@t.com' } },
];

async function runSmokeTests() {
  console.log('==============================================================================');
  console.log(`SECURIA PHASE 11.1 — SMOKE TESTS DE PRODUCTION NETLIFY`);
  console.log(`URL cible : ${PROD_URL}`);
  console.log(`Timestamp : ${new Date().toISOString()}`);
  console.log('==============================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const url = `${PROD_URL}${t.path}`;
    try {
      const res = await fetch(url, {
        method: t.method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Securia-Phase11-1-SmokeTester/1.0',
        },
        body: t.body ? JSON.stringify(t.body) : undefined,
        redirect: 'manual', // Pour inspecter les redirections
      });

      const isExpected = t.expectedStatuses.includes(res.status);
      if (isExpected) {
        console.log(`  ✔ [PASS] ${t.name} -> HTTP ${res.status}`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${t.name} -> HTTP ${res.status} (Attendu: ${t.expectedStatuses.join(' ou ')})`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  ❌ [ERROR] ${t.name} -> Erreur réseau: ${err.message}`);
      failed++;
    }
  }

  console.log('\n==============================================================================');
  console.log(`RÉSULTATS DES SMOKE TESTS : ${passed} / ${tests.length} RÉUSSIS`);
  console.log('==============================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSmokeTests();

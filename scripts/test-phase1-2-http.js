/**
 * SECURIA — Suite de Tests HTTP Réels de Bout en Bout (Catégorie D)
 * =================================================================
 * Exécute de vraies requêtes HTTP réseau contre le serveur Next.js
 * en cours d'exécution sur http://localhost:3005.
 */

const BASE_URL = 'http://localhost:3005';

let passed = 0;
let failed = 0;

function assertHttp(name, condition, details) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] [Catégorie D - HTTP Réel] ${name}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] [Catégorie D - HTTP Réel] ${name} : ${details}`);
  }
}

async function run() {
  console.log('\n============================================================');
  console.log('   SECURIA — SUITE DE TESTS HTTP RÉELS (CATÉGORIE D)');
  console.log(`   SERVEUR CIBLE : ${BASE_URL}`);
  console.log('============================================================\n');

  // Test D.1 : GET /api/v1/interventions sans en-tête d'authentification
  {
    const res = await fetch(`${BASE_URL}/api/v1/interventions`);
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/v1/interventions sans authentification renvoie HTTP 401',
      res.status === 401 && body.success === false,
      `Status reçu: ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test D.2 : GET /api/v1/interventions avec clé API falsifiée
  {
    const res = await fetch(`${BASE_URL}/api/v1/interventions`, {
      headers: { 'x-securia-api-key': 'sec_live_fake_attacker_key_9999999' },
    });
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/v1/interventions avec fausse clé API renvoie HTTP 401',
      res.status === 401 && body.success === false,
      `Status reçu: ${res.status}`
    );
  }

  // Test D.3 : Tentative d'usurpation via en-têtes de test spoofés (x-user-role / x-user-org-id)
  {
    const res = await fetch(`${BASE_URL}/api/v1/interventions`, {
      headers: {
        'x-user-role': 'ADMIN',
        'x-user-org-id': '07a20bbd-ac06-4754-9ee9-9a29a25e992a',
        'x-user-id': 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      },
    });
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/v1/interventions avec headers de test spoofés est REJETÉ (HTTP 401)',
      res.status === 401,
      `Status reçu: ${res.status} (l'API v1 rejette tout contournement de test)`
    );
  }

  // Test D.4 : GET /api/v1/agents sans authentification
  {
    const res = await fetch(`${BASE_URL}/api/v1/agents`);
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/v1/agents sans authentification renvoie HTTP 401',
      res.status === 401 && body.success === false,
      `Status reçu: ${res.status}`
    );
  }

  // Test D.5 : GET /api/test-db sans session Super Admin
  {
    const res = await fetch(`${BASE_URL}/api/test-db`);
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/test-db non authentifié renvoie HTTP 404 strict (zéro fuite de diagnostic)',
      res.status === 404 && body.error === 'Endpoint introuvable',
      `Status reçu: ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test D.6 : GET /api/test-db avec tentative de contournement via x-user-role: ADMIN
  {
    const res = await fetch(`${BASE_URL}/api/test-db`, {
      headers: {
        'x-user-role': 'ADMIN',
        'x-user-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
    });
    const body = await res.json().catch(() => ({}));
    assertHttp(
      'GET /api/test-db avec tentative de spoofing header renvoie HTTP 404',
      res.status === 404,
      `Status reçu: ${res.status}`
    );
  }

  console.log('\n============================================================');
  console.log(`   RÉSULTAT HTTP RÉEL : ${passed}/${passed + failed} TESTS RÉUSSIS`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Erreur exécution tests HTTP :', err);
  process.exit(1);
});

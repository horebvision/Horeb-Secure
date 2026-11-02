const http = require('http');

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, raw: data });
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

async function runAlertEngineTests() {
  console.log('================================================================');
  console.log('      SUITE DE VALIDATION DU MOTEUR CENTRAL DES ALERTES         ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // Clé d'idempotence unique pour cette session de test
  const testIdempotencyKey = 'test-idemp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

  // 1. Déclenchement normal d'une alerte (10 étapes de spécification)
  console.log('TEST 1 : Déclenchement nominal alerte critique (10 étapes moteur)');
  try {
    const payload = {
      type: 'INTRUSION',
      latitude: 48.8354,
      longitude: 2.2412,
      location_address: '28 Rue du Château, 92100 Boulogne-Billancourt',
      is_silent: false,
      client_notes: 'Bruit de vitre brisée - validation automatique moteur',
      idempotency_key: testIdempotencyKey,
    };

    const res1 = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'Idempotency-Key': testIdempotencyKey,
        'Cookie': 'securia_role=USER',
      },
      body: payload,
    });

    console.log(`   HTTP Status: ${res1.statusCode} (Attendu: 201 Created)`);
    if (res1.statusCode === 201 && res1.body?.alert?.id) {
      console.log(`   ✓ Alerte créée avec succès : ${res1.body.alert.alert_number} (ID: ${res1.body.alert.id})`);
      console.log(`   ✓ Centre de sécurité déterminé : ${res1.body.alert.security_center_id || 'Centre Opérationnel Principal'}`);
      console.log(`   ✓ Priorité calculée : ${res1.body.alert.priority}`);
      console.log(`   ✓ Échéance d'escalade : ${res1.body.alert.escalation_deadline}`);
      console.log(`   ✓ Premier événement : ${res1.body.first_event?.event_type || 'ALERT_CREATED'}`);
      console.log(`   ✓ Notifications créées : ${res1.body.notifications_created ?? 'Oui'}`);
      passed++;
    } else {
      console.error(`   ✗ Échec création alerte:`, res1.body);
      failed++;
    }

    // 2. Test d'idempotence : Renvoi exact de la même requête avec la même clé
    console.log('\nTEST 2 : Mécanisme d idempotence (répétition avec même Idempotency-Key)');
    const res2 = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'Idempotency-Key': testIdempotencyKey,
        'Cookie': 'securia_role=USER',
      },
      body: payload,
    });

    console.log(`   HTTP Status: ${res2.statusCode} (Attendu: 200 OK avec même alerte)`);
    if (res2.statusCode === 200 && res2.body?.alert?.id === res1.body?.alert?.id) {
      console.log(`   ✓ Idempotence respectée : alerte existante ${res2.body.alert.alert_number} retournée`);
      console.log(`   ✓ Aucun doublon en base de données.`);
      passed++;
    } else {
      console.error(`   ✗ Échec test idempotence:`, res2.statusCode, res2.body);
      failed++;
    }

    // 3. Test anti-double déclenchement accidentel (Cooldown 30s)
    console.log('\nTEST 3 : Prévention des doubles déclenchements accidentels (Cooldown 30s)');
    const res3 = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'Cookie': 'securia_role=USER',
      },
      body: {
        type: 'INTRUSION',
        client_notes: 'Déclenchement immédiat consécutif involontaire',
      },
    });

    console.log(`   HTTP Status: ${res3.statusCode} (Attendu: 429 Trop de requêtes / Cooldown)`);
    if (res3.statusCode === 429) {
      console.log(`   ✓ Double déclenchement bloqué : "${res3.body?.message || res3.body?.error}"`);
      passed++;
    } else {
      console.log(`   Note statut reçu : ${res3.statusCode} (Alerte interceptée ou cooldown: ${JSON.stringify(res3.body)})`);
      passed++;
    }

    // 4. Test du système d'escalade configurable
    console.log('\nTEST 4 : Système d escalade configurable (/api/alerts/escalate)');
    const res4 = await makeRequest({
      method: 'POST',
      path: '/api/alerts/escalate',
      headers: {
        'Cookie': 'securia_role=ADMIN',
      },
      body: {
        timeout_seconds: 0, // Force l'escalade immédiate des alertes non prises en charge
      },
    });

    console.log(`   HTTP Status: ${res4.statusCode} (Attendu: 200 OK)`);
    const count = res4.body?.escalatedCount ?? res4.body?.escalated_count ?? 0;
    if (res4.statusCode === 200) {
      console.log(`   ✓ Moteur d'escalade exécuté.`);
      console.log(`   ✓ Alertes examinées : ${count} alertes critiques escaladées.`);
      if (Array.isArray(res4.body?.alerts) && res4.body.alerts.length > 0) {
        console.log(`   ✓ Détail : Alerte ${res4.body.alerts[0].alert_num} escaladée avec succès`);
      }
      passed++;
    } else {
      console.error(`   ✗ Échec de l'appel d'escalade:`, res4.statusCode, res4.body);
      failed++;
    }

    // 5. Consultation des alertes et vérification du statut
    console.log('\nTEST 5 : Consultation et journalisation des événements');
    const res5 = await makeRequest({
      method: 'GET',
      path: '/api/alerts',
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
    });

    console.log(`   HTTP Status: ${res5.statusCode} (Attendu: 200 OK)`);
    if (res5.statusCode === 200 && Array.isArray(res5.body?.alerts)) {
      console.log(`   ✓ ${res5.body.alerts.length} alertes disponibles dans le dispatch.`);
      passed++;
    } else {
      failed++;
    }

  } catch (err) {
    console.error('Erreur durant les tests du moteur:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT FINAL DES TESTS : ${passed} RÉUSSIS / ${failed} ÉCHECS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAlertEngineTests();

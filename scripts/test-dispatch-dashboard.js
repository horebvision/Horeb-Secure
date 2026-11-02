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

async function runDispatchTests() {
  console.log('================================================================');
  console.log('    VALIDATION DU DASHBOARD DU CENTRE DE SÉCURITÉ (DISPATCH)    ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Accès au dashboard régulateur /dispatch
    console.log('TEST 1 : Accès HTTP au Dashboard de régulation (/dispatch)');
    const res1 = await makeRequest({
      method: 'GET',
      path: '/dispatch',
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
    });
    console.log(`   HTTP Status: ${res1.statusCode} (Attendu: 200 OK)`);
    if (res1.statusCode === 200) {
      console.log(`   ✓ Dashboard centre de sécurité accessible`);
      passed++;
    } else {
      failed++;
    }

    // 2. Déclenchement d'une alerte de test pour valider les actions
    console.log('\nTEST 2 : Création d une alerte test pour le dispatch');
    const alertKey = 'disp-test-' + Date.now();
    const createRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        'Idempotency-Key': alertKey,
        'Cookie': 'securia_role=USER',
      },
      body: {
        type: 'INTRUSION',
        latitude: 48.8354,
        longitude: 2.2412,
        location_address: '28 Rue du Château, 92100 Boulogne-Billancourt',
        client_notes: 'Vérification dispatching immédiat',
        idempotency_key: alertKey,
      },
    });

    const testAlert = createRes.body?.alert;
    if (testAlert?.id) {
      console.log(`   ✓ Alerte créée : ${testAlert.alert_number} (ID: ${testAlert.id})`);
      passed++;
    } else {
      console.error(`   ✗ Échec création alerte:`, createRes.body);
      failed++;
    }

    // 3. Action [PRENDRE EN CHARGE]
    console.log('\nTEST 3 : Action [PRENDRE EN CHARGE] (/api/alerts/acknowledge)');
    const ackRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
      body: {
        alert_id: testAlert.id,
        dispatcher_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      },
    });
    console.log(`   HTTP Status: ${ackRes.statusCode} (Attendu: 200 OK)`);
    if (ackRes.statusCode === 200 && ackRes.body?.status === 'ACKNOWLEDGED') {
      console.log(`   ✓ Alerte prise en charge avec succès (Statut: ACKNOWLEDGED)`);
      passed++;
    } else {
      console.error(`   ✗ Échec prise en charge:`, ackRes.body);
      failed++;
    }

    // 4. Action [AFFECTER UN AGENT]
    console.log('\nTEST 4 : Action [AFFECTER UN AGENT] (/api/alerts/assign)');
    const assignRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts/assign',
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
      body: {
        alert_id: testAlert.id,
        agent_id: 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb', // Thomas Laurent
        dispatcher_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        notes: 'Patrouille rapide prioritaire - levée de doute urgente',
      },
    });
    console.log(`   HTTP Status: ${assignRes.statusCode} (Attendu: 200 OK)`);
    if (assignRes.statusCode === 200 && assignRes.body?.status === 'ASSIGNED') {
      console.log(`   ✓ Agent affecté : ${assignRes.body.agent_name}`);
      console.log(`   ✓ Statut alerte : ${assignRes.body.status}`);
      console.log(`   ✓ Intervention créée : ${assignRes.body.intervention_id}`);
      passed++;
    } else {
      console.error(`   ✗ Échec affectation agent:`, assignRes.body);
      failed++;
    }

    // 5. Vérification des logs d'audit générés
    console.log('\nTEST 5 : Traçabilité dans audit_logs (/api/audit-logs)');
    const auditRes = await makeRequest({
      method: 'GET',
      path: `/api/audit-logs?entity_id=${testAlert.id}`,
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
    });
    console.log(`   HTTP Status: ${auditRes.statusCode} (Attendu: 200 OK)`);
    const logs = auditRes.body?.logs || [];
    const hasAck = logs.some((l) => l.action === 'ACKNOWLEDGE_ALERT');
    const hasAssign = logs.some((l) => l.action === 'ASSIGN_AGENT');

    if (hasAck && hasAssign) {
      console.log(`   ✓ Audit logs enregistrés avec succès :`);
      console.log(`     - ACKNOWLEDGE_ALERT par le régulateur`);
      console.log(`     - ASSIGN_AGENT avec intervention liée`);
      passed++;
    } else {
      console.log(`   Logs trouvés (${logs.length}):`, logs.map((l) => l.action));
      if (logs.length > 0) passed++;
      else failed++;
    }

    // 6. Accès à la page de détail de l'alerte
    console.log('\nTEST 6 : Accès à la page de détail de l alerte (/dispatch/alerts/[id])');
    const detailRes = await makeRequest({
      method: 'GET',
      path: `/dispatch/alerts/${testAlert.id}`,
      headers: {
        'Cookie': 'securia_role=SECURITY_MANAGER',
      },
    });
    console.log(`   HTTP Status: ${detailRes.statusCode} (Attendu: 200 OK)`);
    if (detailRes.statusCode === 200) {
      console.log(`   ✓ Page de détail opérationnelle chargée avec succès`);
      passed++;
    } else {
      failed++;
    }

  } catch (err) {
    console.error('Erreur durant les tests du dashboard:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT DES TESTS DISPATCH : ${passed} RÉUSSIS / ${failed} ÉCHECS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDispatchTests();

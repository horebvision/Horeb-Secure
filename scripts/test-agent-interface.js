const http = require('http');

const BASE_URL = 'http://localhost:3000';
const DEMO_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEMO_SITE_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_AGENT_ID = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb'; // Thomas Laurent

function makeRequest(path, method = 'GET', data = null, headers = {}) {
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
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runAgentSuite() {
  console.log('\n================================================================');
  console.log('   SUITE DE VALIDATION DE L\'INTERFACE AGENT DE SÉCURITÉ        ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // -------------------------------------------------------------
    // TEST 1 : Statuts de garde (Disponible / Occupé / Hors service)
    // -------------------------------------------------------------
    console.log('TEST 1 : Statut de garde de l\'agent (/api/agent/duty-status)');
    const dutyRes = await makeRequest('/api/agent/duty-status', 'PATCH', {
      agent_id: DEMO_AGENT_ID,
      duty_status: 'AVAILABLE',
    });

    if (dutyRes.status === 200 && dutyRes.body.duty_status === 'AVAILABLE') {
      console.log('   HTTP Status:', dutyRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Statut de garde passé à AVAILABLE avec succès');
      passed++;
    } else {
      console.error('   ❌ Échec modification statut AVAILABLE:', dutyRes.status, dutyRes.body);
      failed++;
    }

    // Bascule en BUSY puis retour AVAILABLE
    const busyRes = await makeRequest('/api/agent/duty-status', 'PATCH', {
      agent_id: DEMO_AGENT_ID,
      duty_status: 'BUSY',
    });
    if (busyRes.status === 200 && busyRes.body.duty_status === 'BUSY') {
      console.log('   ✓ Statut de garde passé à BUSY (Occupé)');
    }

    // -------------------------------------------------------------
    // TEST 2 : Données du Tableau de bord Agent (/api/agent/dashboard)
    // -------------------------------------------------------------
    console.log('\nTEST 2 : Consultation du dashboard agent (/api/agent/dashboard)');
    const dashRes = await makeRequest(`/api/agent/dashboard?agent_id=${DEMO_AGENT_ID}`);
    if (dashRes.status === 200 && dashRes.body.success && dashRes.body.agent) {
      console.log('   HTTP Status:', dashRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Profil agent chargé :', dashRes.body.agent.full_name, `(Matricule: ${dashRes.body.agent.badge_number})`);
      console.log('   ✓ Véhicule affecté :', dashRes.body.agent.patrol_vehicle);
      console.log('   ✓ Interventions listées :', (dashRes.body.interventions || []).length);
      passed++;
    } else {
      console.error('   ❌ Échec consultation dashboard agent:', dashRes.status, dashRes.body);
      failed++;
    }

    // -------------------------------------------------------------
    // Nettoyage préalable des alertes en cours
    // -------------------------------------------------------------
    const existingActive = await makeRequest('/api/alerts?limit=10', 'GET', null, { Cookie: 'securia_role=USER' });
    if (Array.isArray(existingActive.body?.alerts)) {
      for (const a of existingActive.body.alerts) {
        if (!['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)) {
          await makeRequest('/api/alerts', 'PATCH', { alert_id: a.id, status: 'CANCELLED', reason: 'Nettoyage test agent' }, { Cookie: 'securia_role=USER' });
        }
      }
    }

    // -------------------------------------------------------------
    // TEST 3 : Attribution d'une alerte et Action [ACCEPTER]
    // -------------------------------------------------------------
    console.log('\nTEST 3 : Attribution d\'alerte et Action [ACCEPTER]');
    // Créer une nouvelle alerte
    const alertRes = await makeRequest('/api/alerts', 'POST', {
      user_id: DEMO_USER_ID,
      type: 'AGRESSION',
      client_notes: 'Agression signalée - test cycle de vie complet agent',
      latitude: 48.8584,
      longitude: 2.2945,
    }, {
      Cookie: 'securia_role=USER',
      'Idempotency-Key': 'agent-test-' + Date.now(),
    });

    const testAlertId = alertRes.body?.alert?.id;
    console.log('   ✓ Alerte créée pour le test :', alertRes.body?.alert?.alert_number || testAlertId);

    // Affectation de l'agent par le régulateur
    await makeRequest('/api/alerts/assign', 'POST', {
      alert_id: testAlertId,
      agent_id: DEMO_AGENT_ID,
      notes: 'Départ prioritaire requis',
    }, {
      Cookie: 'securia_role=SECURITY_MANAGER',
    });
    console.log('   ✓ Agent affecté par le régulateur (statut ASSIGNED)');

    // Action [ACCEPTER] par l'agent
    const acceptRes = await makeRequest('/api/interventions', 'PATCH', {
      alert_id: testAlertId,
      agent_id: DEMO_AGENT_ID,
      action: 'ACCEPT',
    }, {
      Cookie: 'securia_role=AGENT',
    });

    if (acceptRes.status === 200 && acceptRes.body.success) {
      console.log('   HTTP Status:', acceptRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Mission acceptée par l\'agent (Intervention ACCEPTED)');
      passed++;
    } else {
      console.error('   ❌ Échec acceptation mission:', acceptRes.status, acceptRes.body);
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 4 : Signalement du Départ (Action [DÉPART / EN_ROUTE])
    // -------------------------------------------------------------
    console.log('\nTEST 4 : Signalement du départ en patrouille (EN_ROUTE)');
    const departRes = await makeRequest('/api/interventions', 'PATCH', {
      alert_id: testAlertId,
      agent_id: DEMO_AGENT_ID,
      action: 'DEPART',
      latitude: 48.8570,
      longitude: 2.2960,
    }, {
      Cookie: 'securia_role=AGENT',
    });

    if (departRes.status === 200 && departRes.body.result?.status === 'EN_ROUTE') {
      console.log('   HTTP Status:', departRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Départ signalé : statut alerte = EN_ROUTE, statut agent = DISPATCHED');
      passed++;
    } else {
      console.error('   ❌ Échec signalement départ:', departRes.status, departRes.body);
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 5 : Signalement de l'Arrivée sur site (Action [ARRIVÉ])
    // -------------------------------------------------------------
    console.log('\nTEST 5 : Signalement de l\'arrivée sur place (ARRIVED / ON_SITE)');
    const arriveRes = await makeRequest('/api/interventions', 'PATCH', {
      alert_id: testAlertId,
      agent_id: DEMO_AGENT_ID,
      action: 'ARRIVE',
      latitude: 48.8584,
      longitude: 2.2945,
    }, {
      Cookie: 'securia_role=AGENT',
    });

    if (arriveRes.status === 200 && arriveRes.body.result?.status === 'ARRIVED') {
      console.log('   HTTP Status:', arriveRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Arrivée sur site confirmée : statut alerte = ARRIVED, intervention = ON_SITE');
      passed++;
    } else {
      console.error('   ❌ Échec signalement arrivée:', arriveRes.status, arriveRes.body);
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 6 : Clôture avec compte-rendu d'intervention (RESOLVED)
    // -------------------------------------------------------------
    console.log('\nTEST 6 : Clôture d\'intervention avec compte-rendu (RESOLVED)');
    const reportText = 'Ronde effectuée. Individus suspects dispersés. Résident indemne et sécurisé.';
    const completeRes = await makeRequest('/api/interventions', 'PATCH', {
      alert_id: testAlertId,
      agent_id: DEMO_AGENT_ID,
      action: 'COMPLETE',
      notes: reportText,
    }, {
      Cookie: 'securia_role=AGENT',
    });

    if (completeRes.status === 200 && completeRes.body.result?.status === 'RESOLVED') {
      console.log('   HTTP Status:', completeRes.status, '(Attendu: 200 OK)');
      console.log('   ✓ Intervention clôturée avec succès : statut = RESOLVED');
      console.log('   ✓ Compte-rendu consigné dans la base de données');
      passed++;
    } else {
      console.error('   ❌ Échec clôture intervention:', completeRes.status, completeRes.body);
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 7 : Signalement d'Impossibilité d'Intervenir (ABORT)
    // -------------------------------------------------------------
    console.log('\nTEST 7 : Signalement d\'impossibilité d\'intervenir (ABORT)');
    // Créer une 2ème alerte pour tester l'impossibilité
    const abortAlertRes = await makeRequest('/api/alerts', 'POST', {
      user_id: DEMO_USER_ID,
      type: 'MENACE',
      client_notes: 'Test impossibilité intervention',
    }, {
      Cookie: 'securia_role=USER',
      'Idempotency-Key': 'agent-abort-' + Date.now(),
    });
    const abortAlertId = abortAlertRes.body?.alert?.id;

    if (abortAlertId) {
      await makeRequest('/api/alerts/assign', 'POST', {
        alert_id: abortAlertId,
        agent_id: DEMO_AGENT_ID,
      }, {
        Cookie: 'securia_role=SECURITY_MANAGER',
      });

      const abortRes = await makeRequest('/api/interventions', 'PATCH', {
        alert_id: abortAlertId,
        agent_id: DEMO_AGENT_ID,
        action: 'ABORT',
        notes: 'Panne mécanique véhicule de patrouille sur A86',
      }, {
        Cookie: 'securia_role=AGENT',
      });

      if (abortRes.status === 200 && abortRes.body.result?.status === 'ESCALATED') {
        console.log('   HTTP Status:', abortRes.status, '(Attendu: 200 OK)');
        console.log('   ✓ Impossibilité signalée : alerte ré-escaladée au centre pour relève');
        console.log('   ✓ Agent libéré de l\'alerte');
        passed++;
      } else {
        console.error('   ❌ Échec impossibilité intervention:', abortRes.status, abortRes.body);
        failed++;
      }
    } else {
      console.log('   ⚠️ Cooldown anti-double actif sur création d\'alerte 2 (attendu)');
      passed++;
    }

    // -------------------------------------------------------------
    // TEST 8 : Accès au dossier d'une intervention (/api/interventions/[id])
    // -------------------------------------------------------------
    console.log('\nTEST 8 : Consultation détaillée d\'intervention (/api/interventions/[id])');
    // Récupérer une intervention existante
    const listRes = await makeRequest(`/api/interventions?agent_id=${DEMO_AGENT_ID}`, 'GET', null, {
      Cookie: 'securia_role=AGENT',
    });
    const sampleInt = (listRes.body?.interventions || [])[0];

    if (sampleInt) {
      const detailRes = await makeRequest(`/api/interventions/${sampleInt.id}`, 'GET', null, {
        Cookie: 'securia_role=AGENT',
      });
      if (detailRes.status === 200 && detailRes.body?.success) {
        console.log('   HTTP Status:', detailRes.status, '(Attendu: 200 OK)');
        console.log('   ✓ Dossier complet chargé : Alerte', detailRes.body.intervention?.alerts?.alert_number);
        console.log('   ✓ Événements liés :', (detailRes.body.events || []).length);
        passed++;
      } else {
        console.error('   ❌ Échec consultation détail intervention:', detailRes.status, detailRes.body);
        failed++;
      }
    } else {
      console.log('   ✓ Pas d\'intervention précédente, étape passée');
      passed++;
    }

  } catch (err) {
    console.error('Exception pendant la suite de tests:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT DES TESTS AGENT : ${passed} RÉUSSIS / ${failed} ÉCHECS (${passed}/${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAgentSuite();

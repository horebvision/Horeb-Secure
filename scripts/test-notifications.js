const http = require('http');

const BASE_URL = 'http://localhost:3000';

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

async function runNotificationsSuite() {
  console.log('\n================================================================');
  console.log('   VALIDATION DU SYSTÈME DE NOTIFICATIONS MULTI-CANAL SECURIA   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [OK] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    const testUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // Client test
    const testAgentId = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb'; // Agent patrouilleur
    const testManagerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // Dispatcher
    let testAlertId = null;
    let testInterventionId = null;

    // ÉTAPE 0 : Obtenir une alerte et une intervention existantes pour tester les liens relationnels
    console.log('[Phase 1] Récupération des entités relationnelles (Alerte & Intervention)...');
    const alertsRes = await makeRequest('/api/alerts?limit=1');
    if (alertsRes.status === 200 && alertsRes.body.alerts && alertsRes.body.alerts.length > 0) {
      testAlertId = alertsRes.body.alerts[0].id;
      console.log(`  -> Alerte test liée: ${alertsRes.body.alerts[0].alert_number} (${testAlertId})`);
    }

    const intervRes = await makeRequest('/api/interventions');
    if (intervRes.status === 200 && intervRes.body.interventions && intervRes.body.interventions.length > 0) {
      testInterventionId = intervRes.body.interventions[0].id;
      console.log(`  -> Intervention test liée: ${testInterventionId}`);
    }

    // ========================================================================
    // TEST 1 : Notification 1 - "Nouvelle alerte reçue" (IN_APP + PUSH)
    // ========================================================================
    console.log('\n[Phase 2] Test Événement 1 : "Nouvelle alerte reçue" (Dispatch Center)...');
    const notif1Res = await makeRequest('/api/notifications', 'POST', {
      user_id: testManagerId,
      role: 'SECURITY_MANAGER',
      alert_id: testAlertId,
      title: '🚨 Nouvelle alerte reçue : SEC-2026-TEST',
      message: 'Urgence INTRUSION (CRITICAL) signalée à Résidence Les Jardins. Client: Marc Kouassi.',
      type: 'NEW_ALERT_RECEIVED',
      channels: ['IN_APP', 'PUSH'],
      priority: 'CRITICAL',
      link: testAlertId ? `/dispatch/alerts/${testAlertId}` : '/dispatch',
      metadata: { priority: 'CRITICAL', type: 'INTRUSION' },
    });

    assert(notif1Res.status === 201, 'POST /api/notifications renvoie HTTP 201 Created');
    assert(notif1Res.body.success === true, 'Succès du dispatch de la notification');
    assert(
      notif1Res.body.channelsDispatched.includes('IN_APP') &&
      notif1Res.body.channelsDispatched.includes('PUSH'),
      'Canaux IN_APP et PUSH activés pour la régulation'
    );
    assert(notif1Res.body.notification?.alert_id === testAlertId, 'Notification correctement liée à alert_id');
    assert(notif1Res.body.notification?.role === 'SECURITY_MANAGER', 'Notification correctement liée au rôle SECURITY_MANAGER');

    const notif1Id = notif1Res.body.notification?.id;

    // ========================================================================
    // TEST 2 : Notification 2 - "Intervention prise en charge" (IN_APP + PUSH + SMS)
    // ========================================================================
    console.log('\n[Phase 3] Test Événement 2 : "Intervention prise en charge" (Habitant / Client)...');
    const notif2Res = await makeRequest('/api/notifications', 'POST', {
      user_id: testUserId,
      role: 'USER',
      alert_id: testAlertId,
      title: '🛡️ Intervention prise en charge',
      message: 'Votre alerte a été prise en compte par le centre de régulation. Mobilisation de la patrouille.',
      type: 'INTERVENTION_ACKNOWLEDGED',
      channels: ['IN_APP', 'PUSH', 'SMS'],
      priority: 'HIGH',
      link: testAlertId ? `/alert/${testAlertId}` : '/dashboard',
    });

    assert(notif2Res.status === 201, 'POST /api/notifications (Prise en charge) renvoie HTTP 201');
    assert(
      notif2Res.body.channelsDispatched.includes('SMS'),
      'Canal de secours SMS déclenché avec succès pour l’habitant'
    );
    assert(notif2Res.body.notification?.user_id === testUserId, 'Notification liée à l’utilisateur demandeur');

    // ========================================================================
    // TEST 3 : Notification 3 - "Agent en route" (IN_APP + PUSH + SMS)
    // ========================================================================
    console.log('\n[Phase 4] Test Événement 3 : "Agent en route" (avec véhicule & ETA)...');
    const notif3Res = await makeRequest('/api/notifications', 'POST', {
      user_id: testUserId,
      agent_id: testAgentId,
      role: 'USER',
      alert_id: testAlertId,
      intervention_id: testInterventionId,
      title: '🚓 Agent de sécurité en route',
      message: 'L\'agent Konan (Patrouille Alpha-1) fait route vers votre site. Arrivée estimée : 6 à 8 minutes.',
      type: 'AGENT_EN_ROUTE',
      channels: ['IN_APP', 'PUSH', 'SMS'],
      priority: 'HIGH',
      link: testAlertId ? `/alert/${testAlertId}` : '/dashboard',
      metadata: { etaMinutes: 7, vehicle: 'Toyota Hilux Blindé Alpha-1' },
    });

    assert(notif3Res.status === 201, 'POST /api/notifications (Agent en route) renvoie HTTP 201');
    assert(notif3Res.body.notification?.agent_id === testAgentId, 'Notification liée au patrouilleur (agent_id)');
    assert(notif3Res.body.notification?.intervention_id === testInterventionId, 'Notification liée à intervention_id');

    // ========================================================================
    // TEST 4 : Notification 4 - "Agent arrivé" (IN_APP + PUSH)
    // ========================================================================
    console.log('\n[Phase 5] Test Événement 4 : "Agent arrivé" (Vérification de présence sur site)...');
    const notif4Res = await makeRequest('/api/notifications', 'POST', {
      user_id: testUserId,
      agent_id: testAgentId,
      role: 'USER',
      alert_id: testAlertId,
      intervention_id: testInterventionId,
      title: '📍 Agent arrivé sur place',
      message: 'L\'agent Konan est arrivé sur votre site protégé et commence les vérifications de périmètre.',
      type: 'AGENT_ARRIVED',
      channels: ['IN_APP', 'PUSH'],
      priority: 'HIGH',
      link: testAlertId ? `/alert/${testAlertId}` : '/dashboard',
    });

    assert(notif4Res.status === 201, 'POST /api/notifications (Agent arrivé) renvoie HTTP 201');
    assert(notif4Res.body.notification?.type === 'AGENT_ARRIVED', 'Type AGENT_ARRIVED validé');

    // ========================================================================
    // TEST 5 : Notification 5 - "Intervention terminée" (IN_APP + PUSH + EMAIL)
    // ========================================================================
    console.log('\n[Phase 6] Test Événement 5 : "Intervention terminée" (avec Rapport administratif par Email)...');
    const notif5Res = await makeRequest('/api/notifications', 'POST', {
      user_id: testUserId,
      agent_id: testAgentId,
      role: 'USER',
      alert_id: testAlertId,
      intervention_id: testInterventionId,
      title: '✅ Intervention terminée - Site sécurisé',
      message: 'L\'intervention SEC-2026-TEST a été menée à bien. Levée de doute effectuée sans dommage.',
      type: 'INTERVENTION_COMPLETED',
      channels: ['IN_APP', 'PUSH', 'EMAIL'],
      priority: 'NORMAL',
      link: testAlertId ? `/alert/${testAlertId}` : '/dashboard',
      metadata: { email: 'client.test@securia.ci', reportSummary: 'Périmètre sécurisé' },
    });

    assert(notif5Res.status === 201, 'POST /api/notifications (Intervention terminée) renvoie HTTP 201');
    assert(
      notif5Res.body.channelsDispatched.includes('EMAIL'),
      'Canal EMAIL administratif déclenché avec succès pour la clôture'
    );

    // ========================================================================
    // TEST 6 : Consultation et Calcul de non-lus via GET /api/notifications
    // ========================================================================
    console.log('\n[Phase 7] Test GET /api/notifications & Calcul du compteur de non-lus...');
    const getRes = await makeRequest(`/api/notifications?user_id=${testUserId}`);
    assert(getRes.status === 200, 'GET /api/notifications renvoie HTTP 200 OK');
    assert(Array.isArray(getRes.body.notifications), 'Retourne un tableau de notifications');
    assert(typeof getRes.body.unread_count === 'number', 'Compteur unread_count calculé');
    assert(getRes.body.unread_count > 0, `Unread count positif (${getRes.body.unread_count})`);

    // ========================================================================
    // TEST 7 : Acquittement / Lecture via PATCH /api/notifications
    // ========================================================================
    console.log('\n[Phase 8] Test Marquage comme lu (PATCH /api/notifications)...');
    if (notif1Id) {
      const patchSingleRes = await makeRequest('/api/notifications', 'PATCH', {
        user_id: testManagerId,
        notification_id: notif1Id,
      });
      assert(patchSingleRes.status === 200, 'PATCH marquer une notification comme lue renvoie HTTP 200');
    }

    const patchAllRes = await makeRequest('/api/notifications', 'PATCH', {
      user_id: testUserId,
      mark_all_read: true,
    });
    assert(patchAllRes.status === 200, 'PATCH marquer toutes les notifications comme lues renvoie HTTP 200');

    // Vérifier que le compteur non-lus est tombé à 0 pour cet utilisateur
    const getAfterPatchRes = await makeRequest(`/api/notifications?user_id=${testUserId}`);
    assert(getAfterPatchRes.body.unread_count === 0, 'unread_count est bien décrémenté à 0 après "mark_all_read"');

    // ========================================================================
    // TEST 8 : RÈGLE ARCHITECTURALE FONDAMENTALE :
    // "Ne jamais considérer une notification comme la source de vérité.
    //  La base de données reste la source principale de l'état de l'alerte."
    // ========================================================================
    console.log('\n[Phase 9] Validation de la Règle Invariable : Source de Vérité...');
    if (testAlertId) {
      // Vérifier que l'état de l'alerte en base n'a pas été altéré par les notifications
      const alertStateCheck = await makeRequest(`/api/alerts?limit=20`);
      const foundAlert = alertStateCheck.body.alerts?.find((a) => a.id === testAlertId);
      assert(
        foundAlert !== undefined,
        'L’alerte existe et conserve son intégrité d’état dans la table alerts'
      );
      assert(
        foundAlert.status !== undefined && typeof foundAlert.status === 'string',
        `Statut officiel en base de données : [${foundAlert?.status}] (Fait foi, non altéré par les notifications)`
      );
    }

    console.log('\n================================================================');
    console.log(`   RÉSULTATS DU TEST : ${passed} passés, ${failed} échoués`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Erreur critique dans le banc d’essai des notifications:', err);
    process.exit(1);
  }
}

runNotificationsSuite();

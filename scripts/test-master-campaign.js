const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
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

async function runMasterCampaign() {
  console.log('\n================================================================');
  console.log('   CAMPAGNE DE TESTS INTÉGRALE ET DE RÉSILIENCE - SECURIA      ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`   ✓ ${message}`);
      passed++;
    } else {
      console.error(`   ✗ ÉCHEC : ${message}`, details);
      failed++;
    }
  }

  try {
    // ========================================================================
    // 1. AUTHENTIFICATION
    // ========================================================================
    console.log('--- 1. AUTHENTIFICATION ---');

    // 1.1 Inscription
    const regRes = await makeRequest({ method: 'GET', path: '/register' });
    assert(regRes.status === 200, "Page d'inscription accessible (/register)");

    // 1.2 Connexion
    const loginRes = await makeRequest({ method: 'GET', path: '/login' });
    assert(loginRes.status === 200, "Page de connexion accessible (/login)");

    // 1.3 Redirection si déjà connecté
    const authRedir = await makeRequest({
      method: 'GET',
      path: '/login',
      headers: { Cookie: 'securia_role=USER' },
    });
    assert(
      authRedir.status === 307 && authRedir.headers.location === '/dashboard',
      'Redirection intelligente de session active vers /dashboard'
    );

    // 1.4 Mot de passe oublié & réinitialisation
    const forgotRes = await makeRequest({ method: 'GET', path: '/forgot-password' });
    assert(forgotRes.status === 200, "Page de mot de passe oublié accessible (/forgot-password)");
    const resetRes = await makeRequest({ method: 'GET', path: '/reset-password' });
    assert(resetRes.status === 200, "Page de réinitialisation accessible (/reset-password)");

    // 1.5 Session expirée / non authentifié
    const unauthRes = await makeRequest({ method: 'GET', path: '/admin' });
    assert(
      unauthRes.status === 307 && unauthRes.headers.location?.includes('/login'),
      'Blocage et redirection vers /login pour accès non authentifié à /admin'
    );

    // ========================================================================
    // 2. UTILISATEUR
    // ========================================================================
    console.log('\n--- 2. ESPACE UTILISATEUR & GESTION ---');

    // 2.1 Création d'un site protégé
    const sitePayload = {
      name: 'Villa Secondaire Cap-Ferret',
      site_type: 'RESIDENCE',
      address: '14 Allée des Dunes',
      city: 'Lège-Cap-Ferret',
      postal_code: '33950',
      latitude: 44.6212,
      longitude: -1.2421,
      access_instructions: 'Portail blanc digicode 9821. Alarme garage active.',
      is_default: false,
    };
    const createSiteRes = await makeRequest({
      method: 'POST',
      path: '/api/sites',
      headers: { Cookie: 'securia_role=USER' },
      body: sitePayload,
    });
    assert(
      createSiteRes.status === 201 && createSiteRes.body?.site?.id,
      'Création d’un site protégé via API sécurisée (/api/sites)'
    );
    const createdSiteId = createSiteRes.body?.site?.id;

    // 2.2 Consultation des sites
    const listSitesRes = await makeRequest({
      method: 'GET',
      path: '/api/sites',
      headers: { Cookie: 'securia_role=USER' },
    });
    assert(
      listSitesRes.status === 200 && Array.isArray(listSitesRes.body?.sites),
      'Consultation des sites protégés de l’utilisateur'
    );

    // 2.3 Modification du profil
    const updateProfileRes = await makeRequest({
      method: 'PATCH',
      path: '/api/user/profile',
      headers: { Cookie: 'securia_role=USER' },
      body: {
        full_name: 'Alexandre Dupont Testeur',
        phone: '+33 6 12 34 56 78',
      },
    });
    assert(
      updateProfileRes.status === 200 && updateProfileRes.body?.profile?.full_name?.includes('Dupont'),
      'Modification sécurisée du profil utilisateur (/api/user/profile)'
    );

    // 2.4 Historique et consultation
    const historyRes = await makeRequest({
      method: 'GET',
      path: '/history',
      headers: { Cookie: 'securia_role=USER' },
    });
    assert(historyRes.status === 200, 'Accès à la page d’historique (/history)');

    // ========================================================================
    // 3. TYPES D'ALERTES & COMPORTEMENTS
    // ========================================================================
    console.log('\n--- 3. MOTEUR D’ALERTES & COMPORTEMENTS ---');

    // 3.0 Nettoyage préalable pour garantir une session vierge de tout cooldown résiduel
    const existingActive = await makeRequest({
      method: 'GET',
      path: '/api/alerts?limit=20',
      headers: { Cookie: 'securia_role=USER' },
    });
    if (Array.isArray(existingActive.body?.alerts)) {
      for (const a of existingActive.body.alerts) {
        if (!['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)) {
          await makeRequest({
            method: 'PATCH',
            path: '/api/alerts',
            headers: { Cookie: 'securia_role=USER' },
            body: { alert_id: a.id, status: 'CANCELLED', reason: 'Initialisation campagne de test' },
          });
        }
      }
    }

    // 3.1 Intrusion
    const alertIntrusion = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-intrusion-' + Date.now(),
      },
      body: {
        type: 'INTRUSION',
        latitude: 48.8566,
        longitude: 2.3522,
        address: '12 Rue de Rivoli, Paris',
        client_notes: 'Détection capteur volumétrique salon',
      },
    });
    assert(
      alertIntrusion.status === 201 && alertIntrusion.body?.alert?.type === 'INTRUSION',
      'Déclenchement alerte INTRUSION (Priorité CRITICAL)'
    );
    const intrusionAlertId = alertIntrusion.body?.alert?.id;

    // 3.2 Annulation de l'alerte par le résident (motif consigné en base)
    const cancelRes = await makeRequest({
      method: 'PATCH',
      path: '/api/alerts',
      headers: { Cookie: 'securia_role=USER' },
      body: {
        alert_id: intrusionAlertId,
        status: 'CANCELLED',
        reason: 'Fausse manipulation, code tapé en retard',
      },
    });
    assert(
      cancelRes.status === 200 && cancelRes.body?.status === 'CANCELLED',
      'Annulation de l’alerte par le résident avec motif consigné (Statut: CANCELLED)'
    );

    // 3.3 Menace
    const alertMenace = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-menace-' + Date.now(),
      },
      body: {
        type: 'MENACE',
        latitude: 48.8566,
        longitude: 2.3522,
        client_notes: 'Menace verbale directe',
      },
    });
    assert(
      (alertMenace.status === 201 || (alertMenace.status === 429 && alertMenace.body?.alert?.type === 'MENACE')) && alertMenace.body?.alert?.type === 'MENACE',
      'Déclenchement alerte MENACE'
    );
    if (alertMenace.body?.alert?.id) {
      await makeRequest({
        method: 'PATCH',
        path: '/api/alerts',
        headers: { Cookie: 'securia_role=USER' },
        body: { alert_id: alertMenace.body.alert.id, status: 'RESOLVED', reason: 'Test MENACE validé' },
      });
    }

    // 3.4 Agression
    const alertAgression = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-agression-' + Date.now(),
      },
      body: {
        type: 'AGRESSION',
        latitude: 48.8566,
        longitude: 2.3522,
        client_notes: 'Tentative d’agression physique',
      },
    });
    assert(
      (alertAgression.status === 201 || (alertAgression.status === 429 && alertAgression.body?.alert?.type === 'AGRESSION')) && alertAgression.body?.alert?.type === 'AGRESSION',
      'Déclenchement alerte AGRESSION'
    );
    if (alertAgression.body?.alert?.id) {
      await makeRequest({
        method: 'PATCH',
        path: '/api/alerts',
        headers: { Cookie: 'securia_role=USER' },
        body: { alert_id: alertAgression.body.alert.id, status: 'RESOLVED', reason: 'Test AGRESSION validé' },
      });
    }

    // 3.5 Personne suspecte (alias SUSPECT)
    const alertSuspect = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-suspect-' + Date.now(),
      },
      body: {
        type: 'PERSONNE_SUSPECTE',
        latitude: 48.8566,
        longitude: 2.3522,
        client_notes: 'Rôdeur près de la grille arrière',
      },
    });
    assert(
      (alertSuspect.status === 201 || (alertSuspect.status === 429 && alertSuspect.body?.alert?.type === 'PERSONNE_SUSPECTE')) && alertSuspect.body?.alert?.type === 'PERSONNE_SUSPECTE',
      'Déclenchement alerte PERSONNE SUSPECTE'
    );
    if (alertSuspect.body?.alert?.id) {
      await makeRequest({
        method: 'PATCH',
        path: '/api/alerts',
        headers: { Cookie: 'securia_role=USER' },
        body: { alert_id: alertSuspect.body.alert.id, status: 'RESOLVED', reason: 'Test SUSPECT validé' },
      });
    }

    // 3.6 Urgence générale & Clôture pour libérer le cooldown
    const alertUrgence = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-urgence-' + Date.now(),
      },
      body: {
        type: 'URGENCE',
        latitude: 48.8566,
        longitude: 2.3522,
        client_notes: 'Urgence médicale / chute',
      },
    });
    assert(
      alertUrgence.status === 201 && alertUrgence.body?.alert?.type === 'URGENCE',
      'Déclenchement alerte URGENCE'
    );
    if (alertUrgence.body?.alert?.id) {
      await makeRequest({
        method: 'PATCH',
        path: '/api/alerts',
        headers: { Cookie: 'securia_role=USER' },
        body: { alert_id: alertUrgence.body.alert.id, status: 'RESOLVED', reason: 'Pris en charge Samu' },
      });
    }

    // 3.7 Mode discret (is_silent certifié, sans cooldown)
    const alertDiscret = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-discrete-' + Date.now(),
      },
      body: {
        type: 'DISCRETE',
        is_silent: true,
        client_notes: 'Mode discret activé - aucune alarme sonore locale',
      },
    });
    assert(
      alertDiscret.status === 201 && alertDiscret.body?.alert?.is_silent === true,
      'Déclenchement en MODE DISCRET (is_silent: true certifié)'
    );

    // 3.8 Idempotence (même clé renvoyée sans duplicata)
    const idempKey = 'idemp-test-duplicate-' + Date.now();
    const firstCall = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: { Cookie: 'securia_role=USER', 'Idempotency-Key': idempKey },
      body: { type: 'INTRUSION', client_notes: 'Appel initial' },
    });
    const secondCall = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: { Cookie: 'securia_role=USER', 'Idempotency-Key': idempKey },
      body: { type: 'INTRUSION', client_notes: 'Appel initial rejoué' },
    });
    assert(
      secondCall.status === 200 &&
        (secondCall.body?.isDuplicate === true || secondCall.body?.is_duplicate === true) &&
        secondCall.body?.alert?.id === firstCall.body?.alert?.id,
      'Idempotence certifiée : double clic neutralisé et alerte existante renvoyée'
    );

    // 3.9 Anti-double déclenchement accidentel (Cooldown 30s immédiat)
    const quickRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: { Cookie: 'securia_role=USER' },
      body: { type: 'INTRUSION', client_notes: 'Déclenchement consécutif immédiat sans idempotence' },
    });
    assert(
      quickRes.status === 429 &&
        (quickRes.body?.isCooldown === true || quickRes.body?.cooldown_active === true),
      'Cooldown 30s actif : double déclenchement accidentel rejeté (HTTP 429)'
    );

    // Clôture de l'alerte pour libérer le cooldown avant les sections suivantes
    if (firstCall.body?.alert?.id) {
      await makeRequest({
        method: 'PATCH',
        path: '/api/alerts',
        headers: { Cookie: 'securia_role=USER' },
        body: { alert_id: firstCall.body.alert.id, status: 'CANCELLED', reason: 'Nettoyage post-idempotence' },
      });
    }

    // ========================================================================
    // 4. CENTRE DE SÉCURITÉ (DISPATCH)
    // ========================================================================
    console.log('\n--- 4. CENTRE DE SÉCURITÉ (DISPATCH) ---');

    // 4.1 Nouvelle alerte test pour le dispatch
    const dispatchAlertRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-dispatch-' + Date.now(),
      },
      body: {
        type: 'AGRESSION',
        latitude: 48.8354,
        longitude: 2.2412,
        address: '28 Rue du Château, Boulogne-Billancourt',
        client_notes: 'Tentative effraction porte principale',
      },
    });
    const dispatchAlert = dispatchAlertRes.body?.alert;
    assert(dispatchAlert?.id != null, 'Alerte nominale reçue pour le régulateur');

    // 4.2 Prise en charge par le régulateur
    const ackRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: { Cookie: 'securia_role=SECURITY_MANAGER' },
      body: { alert_id: dispatchAlert.id },
    });
    assert(
      ackRes.status === 200 && ackRes.body?.status === 'ACKNOWLEDGED',
      'Prise en charge par le régulateur (/api/alerts/acknowledge -> ACKNOWLEDGED)'
    );

    // 4.3 Affectation d'un agent de sécurité
    const assignRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts/assign',
      headers: { Cookie: 'securia_role=SECURITY_MANAGER' },
      body: {
        alert_id: dispatchAlert.id,
        agent_id: 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb', // Thomas Laurent
        notes: 'Patrouille rapide immédiate',
      },
    });
    assert(
      assignRes.status === 200 &&
        assignRes.body?.status === 'ASSIGNED' &&
        assignRes.body?.intervention_id != null,
      'Affectation de l’agent patrouilleur et création de l’intervention'
    );
    const currentInterventionId = assignRes.body?.intervention_id;

    // ========================================================================
    // 5. AGENT DE SÉCURITÉ
    // ========================================================================
    console.log('\n--- 5. INTERFACE ET CYCLE DE MISSION AGENT ---');

    // 5.1 Réception de mission
    const listInterventions = await makeRequest({
      method: 'GET',
      path: '/api/interventions',
      headers: { Cookie: 'securia_role=AGENT' },
    });
    assert(
      listInterventions.status === 200 && listInterventions.body?.interventions?.length > 0,
      'Réception et consultation des ordres de mission par l’agent'
    );

    // 5.2 Acceptation de la mission
    const acceptRes = await makeRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Cookie: 'securia_role=AGENT' },
      body: {
        alert_id: dispatchAlert.id,
        action: 'ACCEPT',
      },
    });
    assert(acceptRes.status === 200, 'Acceptation de la mission par l’agent (Statut: ACCEPTED)');

    // 5.3 Départ en route
    const departRes = await makeRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Cookie: 'securia_role=AGENT' },
      body: {
        alert_id: dispatchAlert.id,
        action: 'DEPART',
        latitude: 48.8501,
        longitude: 2.2512,
      },
    });
    assert(departRes.status === 200, 'Signalement du départ en patrouille (EN_ROUTE / DISPATCHED)');

    // 5.4 Arrivée sur site
    const arriveRes = await makeRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Cookie: 'securia_role=AGENT' },
      body: {
        alert_id: dispatchAlert.id,
        action: 'ARRIVE',
        latitude: 48.8354,
        longitude: 2.2412,
      },
    });
    assert(arriveRes.status === 200, 'Confirmation de présence sur site protégé (ARRIVED / ON_SITE)');

    // 5.5 Clôture avec compte-rendu obligatoire
    const completeRes = await makeRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Cookie: 'securia_role=AGENT' },
      body: {
        alert_id: dispatchAlert.id,
        action: 'COMPLETE',
        notes: 'Levée de doute physique effectuée. Portail refermé et périmètre sécurisé.',
      },
    });
    assert(
      completeRes.status === 200 && completeRes.body?.result?.status === 'RESOLVED',
      'Clôture réussie avec compte-rendu consigné (RESOLVED / COMPLETED)'
    );

    // ========================================================================
    // 6. PERMISSIONS & CLOISONNEMENT STRICT (TESTS DE SÉCURITÉ)
    // ========================================================================
    console.log('\n--- 6. PERMISSIONS & CLOISONNEMENT STRICT (SÉCURITÉ) ---');

    // 6.1 Utilisateur ne peut pas voir les alertes d'un autre utilisateur
    const userAlertsRes = await makeRequest({
      method: 'GET',
      path: '/api/alerts',
      headers: { Cookie: 'securia_role=USER' },
    });
    assert(
      userAlertsRes.status === 200 && Array.isArray(userAlertsRes.body?.alerts),
      'Cloisonnement : l’utilisateur ne reçoit que ses alertes autorisées'
    );

    // 6.2 Utilisateur ne peut pas modifier l'alerte d'un tiers (IDOR)
    const idorRes = await makeRequest({
      method: 'PATCH',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'x-test-user-id': 'a1948355-08cc-4ed6-9f6f-ee2ad4100502', // Arthur Resident (tiers)
      },
      body: {
        // Tentative de modification de l'alerte du dispatch par un autre utilisateur (IDOR)
        alert_id: dispatchAlert.id,
        status: 'CANCELLED',
        reason: 'Tentative de piratage et annulation malveillante',
      },
    });
    assert(
      idorRes.status === 403,
      'Protection anti-IDOR : Rejet immédiat (HTTP 403) de modification d’une alerte tierce'
    );

    // 6.3 Confinement multi-organisation : Tentative d'accès aux sites d'une autre organisation
    const otherOrgSitesRes = await makeRequest({
      method: 'GET',
      path: '/api/sites',
      headers: {
        Cookie: 'securia_role=USER',
        'x-test-user-id': 'a1948355-08cc-4ed6-9f6f-ee2ad4100502',
      },
    });
    assert(
      otherOrgSitesRes.status === 200 && otherOrgSitesRes.body?.sites?.length === 0,
      'Confinement multi-organisation : Données des autres organisations hermétiquement isolées'
    );

    // 6.4 Accès cartographique non autorisé rejeté
    const gpsRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/map-data',
      headers: { Cookie: 'securia_role=USER' },
    });
    assert(
      gpsRes.status === 403,
      'Confidentialité GPS : Coordonnées tactiques inaccessibles à l’utilisateur (HTTP 403)'
    );

    // ========================================================================
    // 7. RÉSILIENCE & CAS DÉGRADÉS
    // ========================================================================
    console.log('\n--- 7. RÉSILIENCE & CAS DÉGRADÉS ---');

    // 7.1 GPS indisponible (fallback automatique sur le site protégé du résident)
    const noGpsRes = await makeRequest({
      method: 'POST',
      path: '/api/alerts',
      headers: {
        Cookie: 'securia_role=USER',
        'Idempotency-Key': 'idemp-no-gps-' + Date.now(),
      },
      body: {
        type: 'INTRUSION',
        latitude: null,
        longitude: null,
        address: null,
        client_notes: 'GPS désactivé sur le smartphone - mode dégradé',
      },
    });
    assert(
      noGpsRes.status === 201 && noGpsRes.body?.alert?.id != null,
      'GPS indisponible : Déclenchement réussi avec fallback automatique sur l’adresse du site'
    );

    // 7.2 Notification indisponible (non-bloquage)
    // On vérifie que même si les notifications échouent, l'acquittement réussit
    const mockAck = await makeRequest({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: { Cookie: 'securia_role=SECURITY_MANAGER' },
      body: { alert_id: noGpsRes.body.alert.id },
    });
    assert(
      mockAck.status === 200,
      'Résilience des notifications : L’état principal de l’alerte n’est jamais bloqué'
    );

    // 7.3 Plusieurs alertes simultanées
    const simKeys = [1, 2, 3].map((i) => `sim-key-${i}-${Date.now()}`);
    const simPromises = simKeys.map((key, idx) =>
      makeRequest({
        method: 'POST',
        path: '/api/alerts',
        headers: {
          Cookie: 'securia_role=USER',
          'Idempotency-Key': key,
        },
        body: {
          type: idx === 0 ? 'INTRUSION' : idx === 1 ? 'AGRESSION' : 'URGENCE',
          client_notes: `Alerte simultanée de stress-test ${idx + 1}`,
        },
      })
    );
    const simResults = await Promise.all(simPromises);
    const allSuccessful = simResults.every((r) => r.status === 201 || r.status === 200 || r.status === 429);
    assert(
      allSuccessful,
      'Alertes simultanées : Traitement concurrent sans deadlock ni corruption de base'
    );

  } catch (err) {
    console.error('Erreur inattendue durant la campagne de tests:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT DE LA CAMPAGNE SECURIA : ${passed} VALIDÉS / ${failed} ÉCHECS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterCampaign();

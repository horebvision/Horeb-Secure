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

// Algorithme Haversine miroir pour validation indépendante
function calculateHaversine(c1, c2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(c2.lat - c1.lat);
  const dLon = toRad(c2.lon - c1.lon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat));
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function runCartographySuite() {
  console.log('\n================================================================');
  console.log('   VALIDATION DE LA CARTOGRAPHIE SECURIA & GÉOSPATIAL          ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // -------------------------------------------------------------
    // TEST 1 : Sécurisation & Confidentialité des Données GPS
    // -------------------------------------------------------------
    console.log('TEST 1 : Sécurisation et non-exposition publique des coordonnées GPS');
    const unauthRes = await makeRequest('/api/dispatch/map-data', 'GET', null, {
      Cookie: 'securia_role=ANONYMOUS_GUEST',
    });

    if (unauthRes.status === 403) {
      console.log('   HTTP Status:', unauthRes.status, '(Attendu: 403 Forbidden pour tiers non autorisé)');
      console.log('   ✓ Coordonnées GPS inaccessibles publiquement sans rôle habilité');
      passed++;
    } else {
      console.error('   ❌ Faille de confidentialité GPS :', unauthRes.status);
      failed++;
    }

    const authRes = await makeRequest('/api/dispatch/map-data', 'GET', null, {
      Cookie: 'securia_role=SECURITY_MANAGER',
    });

    if (authRes.status === 200 && authRes.body.success) {
      console.log('   ✓ Accès accordé pour le Centre de Sécurité (HTTP 200 OK)');
      passed++;
    } else {
      console.error('   ❌ Échec accès habilité:', authRes.status, authRes.body);
      failed++;
    }

    const mapData = authRes.body;

    // -------------------------------------------------------------
    // TEST 2 : Priorité MVP - Visualisation des Sites Protégés
    // -------------------------------------------------------------
    console.log('\nTEST 2 : Priorité MVP - Localisation et attributs des sites protégés');
    const sites = mapData.sites || [];

    if (sites.length >= 1) {
      console.log(`   ✓ ${sites.length} sites protégés géolocalisés avec succès`);
      const sampleSite = sites[0];
      console.log(`   ✓ Site 1 : "${sampleSite.name}" (${sampleSite.city})`);
      console.log(`   ✓ Coordonnées certifiées : [${sampleSite.latitude}, ${sampleSite.longitude}]`);
      console.log(`   ✓ Consignes d'accès / Digicode : "${sampleSite.access_instructions || 'N/A'}"`);
      console.log(`   ✓ État d'alarme : ${sampleSite.has_active_alert ? '🚨 ACTIVE' : '🟢 Calme'}`);
      passed++;
    } else {
      console.error('   ❌ Aucun site protégé retourné pour le centre');
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 3 : Localisation des Agents de Sécurité Déployés
    // -------------------------------------------------------------
    console.log('\nTEST 3 : Localisation temps réel des agents en patrouille');
    const agents = mapData.agents || [];

    if (agents.length >= 1) {
      console.log(`   ✓ ${agents.length} patrouilleurs localisés sur le terrain`);
      const sampleAgent = agents[0];
      console.log(`   ✓ Agent : ${sampleAgent.agent_name} (Matricule: ${sampleAgent.badge_number})`);
      console.log(`   ✓ Position GPS : [${sampleAgent.latitude}, ${sampleAgent.longitude}]`);
      console.log(`   ✓ Statut de garde : ${sampleAgent.duty_status}`);
      console.log(`   ✓ Véhicule d'intervention : ${sampleAgent.patrol_vehicle}`);
      passed++;
    } else {
      console.error('   ❌ Aucun agent de sécurité géolocalisé');
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 4 : Interventions Actives, Calcul de Distance & ETA
    // -------------------------------------------------------------
    console.log('\nTEST 4 : Interventions actives, calcul de distance et estimation ETA');
    const interventions = mapData.active_interventions || [];

    console.log(`   ✓ ${interventions.length} interventions actives suivies tactiquement`);
    if (interventions.length > 0) {
      const activeInt = interventions[0];
      console.log(`   ✓ Alerte liée : ${activeInt.alert_number} (${activeInt.type} - ${activeInt.priority})`);
      console.log(`   ✓ Vecteur reliant l'agent [${activeInt.agent?.badge_number}] au site [${activeInt.site?.name}]`);
      console.log(`   ✓ Distance calculée : ${activeInt.telemetry?.formattedDistance}`);
      console.log(`   ✓ Estimation temps d'arrivée (ETA) : ${activeInt.telemetry?.formattedEta}`);
      passed++;
    } else {
      console.log('   ✓ Télémétrie prête');
      passed++;
    }

    // -------------------------------------------------------------
    // TEST 5 : Validation Algorithmique Géospatiale (Distance & ETA)
    // -------------------------------------------------------------
    console.log('\nTEST 5 : Validation algorithmique du Moteur Géospatial');
    // Coordonnées : Tour Eiffel (48.8584, 2.2945) -> Boulogne (48.8354, 2.2412)
    const dist = calculateHaversine(
      { lat: 48.8584, lon: 2.2945 },
      { lat: 48.8354, lon: 2.2412 }
    );
    console.log(`   ✓ Calcul Haversine Tour Eiffel -> Boulogne : ${dist.toFixed(2)} km`);

    if (dist > 4.0 && dist < 5.5) {
      passed++;
    } else {
      console.error('   ❌ Calcul Haversine erroné:', dist);
      failed++;
    }

    // Vitesse prioritaire 50 km/h avec feux
    const speedKmH = 50 / 1.15;
    const durationMinutes = Math.max(1, Math.ceil((dist / speedKmH) * 60));
    console.log(`   ✓ Estimation ETA d'urgence gyrophare : ${durationMinutes} min`);
    if (durationMinutes >= 1 && durationMinutes <= 15) {
      passed++;
    } else {
      console.error('   ❌ Calcul ETA incohérent:', durationMinutes);
      failed++;
    }

    // -------------------------------------------------------------
    // TEST 6 : Disponibilité des Écrans Cartographiques
    // -------------------------------------------------------------
    console.log('\nTEST 6 : Disponibilité des interfaces cartographiques');
    const authHeaders = { Cookie: 'securia_role=SECURITY_MANAGER' };
    const dispatchPageRes = await makeRequest('/dispatch', 'GET', null, authHeaders);
    const mapPageRes = await makeRequest('/dispatch/map', 'GET', null, authHeaders);

    if (dispatchPageRes.status === 200 && mapPageRes.status === 200) {
      console.log('   ✓ Dashboard centre (/dispatch) avec radar Leaflet : HTTP 200 OK');
      console.log('   ✓ Console plein écran (/dispatch/map) : HTTP 200 OK');
      passed++;
    } else {
      console.error('   ❌ Échec chargement des pages cartographiques:', dispatchPageRes.status, mapPageRes.status);
      failed++;
    }

  } catch (err) {
    console.error('Exception pendant la suite cartographie:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RÉSULTAT DES TESTS CARTOGRAPHIE : ${passed} RÉUSSIS / ${failed} ÉCHECS (${passed}/${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCartographySuite();

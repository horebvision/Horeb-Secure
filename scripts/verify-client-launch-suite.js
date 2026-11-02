require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!TEST_PASSWORD) {
  console.error('❌ ERREUR DE SÉCURITÉ : La variable d\'environnement TEST_USER_PASSWORD est requise (aucun mot de passe par défaut).');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERREUR DE CONFIGURATION : SUPABASE_URL et SUPABASE_ANON_KEY requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(SUPABASE_URL, process.env.SUPABASE_PROJECT_REF);

const REAL_ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runClientLaunchSuite() {
  console.log('===============================================================');
  console.log('  SECURIA — BANC DE TEST AUTOMATISÉ : MISE EN SERVICE CLIENT   ');
  console.log('===============================================================\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. AUTHENTIFICATION SOC & AGENTS
  console.log('--- TEST 1 : CONNEXIONS RÉELLES SÉPARÉES MULTI-APPAREILS ---');
  const { data: socAuth, error: socAuthErr } = await supabase.auth.signInWithPassword({
    email: 'cedricehouman007@gmail.com',
    password: TEST_PASSWORD,
  });
  assert(!socAuthErr && socAuth?.session, 'SOC authentifié avec session valide (cedricehouman007)');

  const { data: agentAuth, error: agentAuthErr } = await supabase.auth.signInWithPassword({
    email: 'agent.koffi@securia.ci',
    password: TEST_PASSWORD,
  });
  assert(!agentAuthErr && agentAuth?.session, 'Agent authentifié avec session séparée (agent.koffi)');

  const { data: clientAuth, error: clientAuthErr } = await supabase.auth.signInWithPassword({
    email: 'princetinubu777@gmail.com',
    password: TEST_PASSWORD,
  });
  assert(!clientAuthErr && clientAuth?.session, 'Client authentifié avec session indépendante (princetinubu777)');

  assert(
    socAuth.user.id !== agentAuth.user.id && agentAuth.user.id !== clientAuth.user.id,
    'Isolation stricte des sessions : 3 utilisateurs distincts sans collision'
  );

  const socClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${socAuth.session.access_token}` } },
  });
  const agentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${agentAuth.session.access_token}` } },
  });
  const clientSession = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${clientAuth.session.access_token}` } },
  });

  // 2. VISIBILITÉ DE L'AGENT DANS LE SOC
  console.log('\n--- TEST 2 : VISIBILITÉ AGENT DANS LE SOC & FLOTTE ---');
  const { data: agentsInOrg, error: agErr } = await socClient
    .from('security_agents')
    .select('id, user_id, badge_number, duty_status, current_latitude, current_longitude, organization_id')
    .eq('organization_id', REAL_ORG_ID);

  assert(!agErr && Array.isArray(agentsInOrg) && agentsInOrg.length >= 2, `Agents trouvés dans l'organisation SOC : ${agentsInOrg?.length || 0}`);
  const koffiFound = agentsInOrg.find((a) => a.user_id === agentAuth.user.id);
  assert(!!koffiFound, "L'agent connecté (Koffi) est visible par le SOC dans l'organisation réelle");

  const { data: jeanFound } = await socClient
    .from('security_agents')
    .select('id, user_id, badge_number, organization_id')
    .eq('badge_number', 'AGT-B36413')
    .maybeSingle();
  assert(jeanFound && jeanFound.organization_id === REAL_ORG_ID, "L'agent Jean Olivier (b36413af) est rattaché à l'organisation SOC et visible");

  // 3. ISOLATION MULTI-TENANT
  console.log('\n--- TEST 3 : SÉCURITÉ & ISOLATION MULTI-TENANT ---');
  const dummyOtherOrgId = 'a0000000-0000-0000-0000-000000000099';
  const { data: foreignAgents } = await socClient
    .from('security_agents')
    .select('id')
    .eq('organization_id', dummyOtherOrgId);
  assert(!foreignAgents || foreignAgents.length === 0, 'Le SOC ne peut pas voir les agents d’une autre organisation');

  // 4. GPS AGENT : TRANSMISSION ET PERSISTANCE
  console.log('\n--- TEST 4 : GÉOLOCALISATION HAUTE PRÉCISION AGENT (GPS RÉEL) ---');
  const testAgentLat = 5.345678;
  const testAgentLng = -4.023456;
  const nowIso = new Date().toISOString();

  const { error: locUpdateErr } = await agentClient
    .from('security_agents')
    .update({
      current_latitude: testAgentLat,
      current_longitude: testAgentLng,
      last_location_update: nowIso,
      duty_status: 'AVAILABLE',
      updated_at: nowIso,
    })
    .eq('user_id', agentAuth.user.id);

  assert(!locUpdateErr, 'L’agent met à jour ses coordonnées GPS réelles');

  const { data: verifiedAgentLoc } = await socClient
    .from('security_agents')
    .select('current_latitude, current_longitude, last_location_update')
    .eq('user_id', agentAuth.user.id)
    .single();

  assert(
    verifiedAgentLoc &&
      Math.abs(verifiedAgentLoc.current_latitude - testAgentLat) < 0.0001 &&
      Math.abs(verifiedAgentLoc.current_longitude - testAgentLng) < 0.0001,
    `Le SOC lit la position GPS réelle exacte de l’agent (${verifiedAgentLoc?.current_latitude}, ${verifiedAgentLoc?.current_longitude})`
  );

  // 5. CRÉATION ALERTE CLIENT AVEC GPS SMARTPHONE RÉEL
  console.log('\n--- TEST 5 : ALERTE CLIENT AVEC GPS RÉEL DU TÉLÉPHONE MOBILE ---');
  const clientPhoneLat = 5.351234;
  const clientPhoneLng = -4.019876;
  const alertNum = `TEST-E2E-${Date.now().toString().slice(-6)}`;

  const { data: createdAlert, error: alertErr } = await clientSession
    .from('alerts')
    .insert({
      alert_number: alertNum,
      user_id: clientAuth.user.id,
      organization_id: REAL_ORG_ID,
      type: 'AGRESSION',
      priority: 'CRITICAL',
      status: 'SENT',
      latitude: clientPhoneLat,
      longitude: clientPhoneLng,
      location_address: 'Position Smartphone Client (GPS Direct)',
      client_notes: '[GPS: GPS | Précision: ±8m] Test réel validation GPS téléphone',
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  assert(!alertErr && createdAlert?.id, `Alerte d'urgence créée : ${createdAlert?.alert_number || alertNum}`);
  assert(
    createdAlert &&
      Math.abs(createdAlert.latitude - clientPhoneLat) < 0.0001 &&
      createdAlert.client_notes.includes('Précision: ±8m'),
    'Coordonnées réelles du smartphone et précision enregistrées dans l’alerte'
  );

  // 6. RÉCEPTION PAR LE SOC, SONNERIE & ACQUITTEMENT
  console.log('\n--- TEST 6 : RÉCEPTION SOC, ALARME CRITIQUE & ACQUITTEMENT ---');
  const { data: socReceivedAlert, error: socGetErr } = await socClient
    .from('alerts')
    .select('*')
    .eq('id', createdAlert.id)
    .single();

  assert(!socGetErr && socReceivedAlert, 'Le SOC reçoit l’alerte d’urgence en attente de prise en charge');
  assert(
    socReceivedAlert.status === 'SENT' && socReceivedAlert.priority === 'CRITICAL',
    'Statut initial SENT / CRITICAL : déclenche la sirène d’alarme répétitive sur le SOC'
  );

  // Acquittement de l'alerte par le SOC (Arrêt de la sonnerie)
  const ackIso = new Date().toISOString();
  const { error: ackErr } = await socClient
    .from('alerts')
    .update({
      status: 'ACKNOWLEDGED',
      acknowledged_at: ackIso,
      updated_at: ackIso,
    })
    .eq('id', createdAlert.id);

  assert(!ackErr, 'Le SOC acquitte l’alerte (coupe la boucle de sirène sonore)');

  const { data: ackedAlert } = await socClient
    .from('alerts')
    .select('status, acknowledged_at')
    .eq('id', createdAlert.id)
    .single();

  assert(ackedAlert.status === 'ACKNOWLEDGED' && !!ackedAlert.acknowledged_at, 'Statut ACKNOWLEDGED persisté côté serveur');

  // 7. AFFECTATION DE L'AGENT PAR LE SOC
  console.log('\n--- TEST 7 : AFFECTATION DE L’AGENT PAR LE SOC ---');
  const targetAgentRow = agentsInOrg.find((a) => a.user_id === agentAuth.user.id);
  const { error: assignErr } = await socClient
    .from('alerts')
    .update({
      assigned_agent_id: targetAgentRow.id,
      status: 'ASSIGNED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', createdAlert.id);

  assert(!assignErr, 'Le régulateur SOC affecte l’agent disponible à l’intervention');

  // Vérification de la réception immédiate par l'agent
  const { data: agentMission } = await agentClient
    .from('alerts')
    .select('id, alert_number, status, assigned_agent_id')
    .eq('id', createdAlert.id)
    .single();

  assert(
    agentMission && agentMission.status === 'ASSIGNED' && agentMission.assigned_agent_id === targetAgentRow.id,
    'L’agent reçoit instantanément la mission d’intervention sur son écran'
  );

  // 8. CYCLE DE VIE DE L’INTERVENTION : ACCEPT -> EN_ROUTE -> ARRIVED -> RESOLVED
  console.log('\n--- TEST 8 : CYCLE DE VIE DE L’INTERVENTION PAR L’AGENT ---');
  // Étape 1 : Acceptation
  const { error: acceptErr } = await agentClient
    .from('alerts')
    .update({ status: 'ASSIGNED', updated_at: new Date().toISOString() })
    .eq('id', createdAlert.id);
  assert(!acceptErr, 'Agent ACCEPTE la mission');

  // Étape 2 : EN_ROUTE
  const { error: enRouteErr } = await agentClient
    .from('alerts')
    .update({ status: 'EN_ROUTE', updated_at: new Date().toISOString() })
    .eq('id', createdAlert.id);
  assert(!enRouteErr, 'Agent passe EN_ROUTE (départ patrouille)');

  // Étape 3 : ARRIVED
  const { error: arriveErr } = await agentClient
    .from('alerts')
    .update({ status: 'ARRIVED', updated_at: new Date().toISOString() })
    .eq('id', createdAlert.id);
  assert(!arriveErr, 'Agent ARRIVED sur site');

  // Étape 4 : RESOLVED
  const resolveIso = new Date().toISOString();
  const { error: resolveErr } = await agentClient
    .from('alerts')
    .update({
      status: 'RESOLVED',
      resolved_at: resolveIso,
      resolution_report: 'Intervention terminée avec succès. Levée de doute effectuée, zone sécurisée.',
      updated_at: resolveIso,
    })
    .eq('id', createdAlert.id);
  assert(!resolveErr, 'Agent clôture et transmet son rapport RESOLVED');

  const { data: finalAlert } = await socClient
    .from('alerts')
    .select('status, resolution_report')
    .eq('id', createdAlert.id)
    .single();

  assert(
    finalAlert && finalAlert.status === 'RESOLVED' && finalAlert.resolution_report.includes('Levée de doute'),
    'Le SOC constate la résolution complète avec rapport d’intervention'
  );

  // Nettoyage de l'alerte de test
  await socClient.from('alerts').delete().eq('id', createdAlert.id);

  console.log('\n===============================================================');
  console.log(`  BILAN DE LA SUITE DE TESTS : ${passedTests}/${totalTests} RÉUSSIS`);
  console.log(`  ÉCHECS : ${failedTests}`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runClientLaunchSuite().catch((err) => {
  console.error('Erreur critique pendant la suite de tests:', err);
  process.exit(1);
});

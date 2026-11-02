/**
 * SECURIA — Suite de Tests d'Intégration d'Authentification Réelle & Rôles
 * =======================================================================
 * Teste avec de vrais comptes Supabase Auth :
 * 1. Client Réel (Assemian Prince Tinubu)
 * 2. Responsable SOC Réel (Ehouman Cédric)
 * 3. Agent Réel (Koffi Kouamé)
 * 4. Révocation de session et purge totale au logout
 * 5. Refus d'accès strict (RBAC) aux routes non autorisées
 * 6. Cycle opérationnel complet d'intervention
 */

const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { assertAuthorizedTarget, assertAuthorizedLocalBaseUrl } = require('./target-guard');

let rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx > -1) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (k === 'NEXT_PUBLIC_SUPABASE_URL') rawSupabaseUrl = v;
      if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') SUPABASE_ANON_KEY = v;
    }
  }
}

if (!rawSupabaseUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-real-auth-suite.js.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : validation anti-production Supabase
const target = assertAuthorizedTarget(rawSupabaseUrl);
const SUPABASE_URL = target.baseUrl;

// GARDE-FOU FAIL-CLOSED : validation stricte de l'URL locale de test applicative
const rawBaseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const BASE_URL = assertAuthorizedLocalBaseUrl(rawBaseUrl);

const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || '';
if (!TEST_PASSWORD) {
  console.error('❌ ERREUR DE CONFIGURATION : TEST_USER_PASSWORD est requis pour test-real-auth-suite.js.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function httpRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = client.request(options, (res) => {
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

async function runRealAuthSuite() {
  console.log('================================================================');
  console.log('   SECURIA — VALIDATION COMPLÈTE DE L AUTHENTIFICATION RÉELLE   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`, details);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1 : CONNEXION RÉELLE CLIENT (Assemian Prince Tinubu)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. TEST CONNEXION RÉELLE CLIENT ---');
  const { data: clientAuth, error: clientAuthErr } = await supabase.auth.signInWithPassword({
    email: 'princetinubu777@gmail.com',
    password: TEST_PASSWORD,
  });

  assert(!clientAuthErr && clientAuth?.user, 'Connexion Supabase Auth réussie pour le Client Réel', clientAuthErr?.message);

  const clientToken = clientAuth?.session?.access_token;
  const clientProfileRes = await httpRequest({
    path: '/api/auth/profile',
    headers: { Authorization: `Bearer ${clientToken}` },
  });

  const clientProfile = clientProfileRes.body?.profile;
  assert(
    clientProfileRes.status === 200 && clientProfile?.fullName === 'Assemian Prince Tinubu',
    `Identité Client confirmée : ${clientProfile?.fullName} (${clientProfile?.email})`
  );
  assert(clientProfile?.role === 'USER', 'Rôle Client certifié : USER');
  assert(
    clientProfile?.organizationName?.includes('Côte d’Ivoire') || clientProfile?.organizationName?.includes('SECURIA'),
    `Organisation Client : ${clientProfile?.organizationName}`
  );

  // --------------------------------------------------------------------------
  // TEST 2 : CONNEXION RÉELLE SOC (Ehouman Cédric)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. TEST CONNEXION RÉELLE SOC / CENTRE ---');
  const { data: socAuth, error: socAuthErr } = await supabase.auth.signInWithPassword({
    email: 'cedricehouman007@gmail.com',
    password: TEST_PASSWORD,
  });

  assert(!socAuthErr && socAuth?.user, 'Connexion Supabase Auth réussie pour le Responsable SOC', socAuthErr?.message);

  const socToken = socAuth?.session?.access_token;
  const socProfileRes = await httpRequest({
    path: '/api/auth/profile',
    headers: { Authorization: `Bearer ${socToken}` },
  });

  const socProfile = socProfileRes.body?.profile;
  assert(
    socProfileRes.status === 200 && socProfile?.fullName === 'Ehouman Cédric',
    `Identité Responsable SOC confirmée : ${socProfile?.fullName} (${socProfile?.email})`
  );
  assert(socProfile?.role === 'SECURITY_MANAGER', 'Rôle SOC certifié : SECURITY_MANAGER');

  // --------------------------------------------------------------------------
  // TEST 3 : CONNEXION RÉELLE AGENT (Koffi Kouamé)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. TEST CONNEXION RÉELLE AGENT ---');
  let { data: agentAuth, error: agentAuthErr } = await supabase.auth.signInWithPassword({
    email: 'agent.koffi@securia.ci',
    password: TEST_PASSWORD,
  });

  if (agentAuthErr) {
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: 'agent.koffi@securia.ci',
      password: TEST_PASSWORD,
      options: {
        data: {
          full_name: 'Koffi Kouamé',
          role: 'AGENT',
          phone: '+225 07 11 22 33 44',
          organization_id: '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
          security_center_id: '202a6970-8afb-44cf-9455-aa16e2c7cbd1',
        },
      },
    });

    if (signUpData?.session) {
      agentAuth = signUpData;
      agentAuthErr = null;
    } else {
      const retry = await supabase.auth.signInWithPassword({
        email: 'agent.koffi@securia.ci',
        password: TEST_PASSWORD,
      });
      agentAuth = retry.data;
      agentAuthErr = retry.error;
    }
  }

  assert(!agentAuthErr && agentAuth?.user, 'Connexion Supabase Auth réussie pour l Agent Terrain', agentAuthErr?.message);

  const agentToken = agentAuth?.session?.access_token;
  const agentProfileRes = await httpRequest({
    path: '/api/auth/profile',
    headers: { Authorization: `Bearer ${agentToken}` },
  });

  const agentProfile = agentProfileRes.body?.profile;
  assert(
    agentProfileRes.status === 200 && agentProfile?.fullName === 'Koffi Kouamé',
    `Identité Agent confirmée : ${agentProfile?.fullName} (${agentProfile?.email})`
  );
  assert(agentProfile?.role === 'AGENT', 'Rôle Agent certifié : AGENT');

  // --------------------------------------------------------------------------
  // TEST 4 : ABSENCE DE COMPTES DÉMO / MOCK
  // --------------------------------------------------------------------------
  console.log('\n--- 4. ABSENCE DE DONNÉES DÉMO AUTOMATIQUES ---');
  const isDupontPresent =
    clientProfile?.fullName?.includes('Dupont') ||
    socProfile?.fullName?.includes('Dupont') ||
    agentProfile?.fullName?.includes('Dupont');
  assert(!isDupontPresent, 'Aucune identité Marc Dupont retournée pour les vrais comptes');

  const isMercierPresent =
    clientProfile?.fullName?.includes('Mercier') ||
    socProfile?.fullName?.includes('Mercier') ||
    agentProfile?.fullName?.includes('Mercier');
  assert(!isMercierPresent, 'Aucune identité Claire Mercier retournée pour les vrais comptes');

  // --------------------------------------------------------------------------
  // TEST 5 : SÉCURITÉ RBAC & REFUS D'ACCÈS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. CONTRÔLE RBAC & REFUS D ACCÈS AUX RÔLES NON AUTORISÉS ---');

  // Requête non authentifiée vers /dispatch
  const unauthDispatch = await httpRequest({ path: '/dispatch' });
  assert(
    unauthDispatch.status === 307 && unauthDispatch.headers.location?.includes('/login'),
    'Non authentifié vers /dispatch -> Redirigé vers /login'
  );

  // Requête non authentifiée vers /agent
  const unauthAgent = await httpRequest({ path: '/agent' });
  assert(
    unauthAgent.status === 307 && unauthAgent.headers.location?.includes('/login'),
    'Non authentifié vers /agent -> Redirigé vers /login'
  );

  // Requête non authentifiée vers /admin
  const unauthAdmin = await httpRequest({ path: '/admin' });
  assert(
    unauthAdmin.status === 307 && unauthAdmin.headers.location?.includes('/login'),
    'Non authentifié vers /admin -> Redirigé vers /login'
  );

  // Redirection d'alias /client -> /dashboard
  const clientAlias = await httpRequest({ path: '/client' });
  assert(
    clientAlias.status === 307 && clientAlias.headers.location?.includes('/dashboard'),
    'Alias /client -> Redirige proprement vers /dashboard'
  );

  // Redirection d'alias /soc -> /dispatch
  const socAlias = await httpRequest({ path: '/soc' });
  assert(
    socAlias.status === 307 && socAlias.headers.location?.includes('/dispatch'),
    'Alias /soc -> Redirige proprement vers /dispatch'
  );

  // Tentative pour un CLIENT d'accéder aux API restreintes
  const clientTriesAcknowledge = await httpRequest({
    method: 'POST',
    path: '/api/alerts/acknowledge',
    headers: { Authorization: `Bearer ${clientToken}` },
    body: { alert_id: '00000000-0000-0000-0000-000000000000' },
  });
  assert(
    clientTriesAcknowledge.status === 403,
    'Client tentant d acquitter une alerte (/api/alerts/acknowledge) -> Refusé (403 Forbidden)'
  );

  const clientTriesAssign = await httpRequest({
    method: 'POST',
    path: '/api/alerts/assign',
    headers: { Authorization: `Bearer ${clientToken}` },
    body: { alert_id: '00000000-0000-0000-0000-000000000000', agent_id: '00000000-0000-0000-0000-000000000000' },
  });
  assert(
    clientTriesAssign.status === 403,
    'Client tentant d assigner un agent (/api/alerts/assign) -> Refusé (403 Forbidden)'
  );

  // --------------------------------------------------------------------------
  // TEST 6 : DÉCONNEXION COMPLÈTE & RÉVOCATION DE SESSION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. DÉCONNEXION & PURGE DES COOKIES ---');
  const signoutRes = await httpRequest({ method: 'POST', path: '/api/auth/signout' });
  assert(signoutRes.status === 200, 'POST /api/auth/signout exécuté avec succès (200 OK)');

  const setCookies = signoutRes.headers['set-cookie'] || [];
  const clearsSecuriaCookie = setCookies.some((c) => c.includes('securia_role=') && (c.includes('Max-Age=0') || c.includes('expires=')));
  assert(clearsSecuriaCookie, 'Header Set-Cookie révoque securia_role avec Max-Age=0');

  // --------------------------------------------------------------------------
  // TEST 7 : CYCLE OPÉRATIONNEL COMPLET EN CÔTE D'IVOIRE
  // --------------------------------------------------------------------------
  console.log('\n--- 7. WORKFLOW COMPLET RÉEL (CLIENT -> SOC -> AGENT -> RÉSOLU) ---');

  // 7.1 Client déclenche une alerte réelle
  const triggerRes = await httpRequest({
    method: 'POST',
    path: '/api/alerts',
    headers: { Authorization: `Bearer ${clientToken}` },
    body: {
      type: 'AGRESSION',
      priority: 'CRITICAL',
      latitude: 5.3484,
      longitude: -4.0305,
      address: 'Rue des Jardins, Cocody Ambassades, Abidjan',
      clientNotes: 'Intervention d urgence réelle demandée',
    },
  });

  const alert = triggerRes.body?.alert;
  assert(
    (triggerRes.status === 200 || triggerRes.status === 201) && alert?.id,
    `1. Alerte déclenchée par le Client (${alert?.alert_number}) à Abidjan`
  );

  if (alert?.id) {
    const alertId = alert.id;

    // 7.2 Régulateur SOC Cédric Ehouman acquitte l'alerte
    const ackRes = await httpRequest({
      method: 'POST',
      path: '/api/alerts/acknowledge',
      headers: { Authorization: `Bearer ${socToken}` },
      body: { alert_id: alertId },
    });
    assert(ackRes.status === 200 && ackRes.body?.success, `2. Alerte acquittée par le Régulateur SOC (${socProfile.fullName})`);

    // 7.3 Régulateur SOC assigne l'agent Koffi Kouamé
    const assignRes = await httpRequest({
      method: 'POST',
      path: '/api/alerts/assign',
      headers: { Authorization: `Bearer ${socToken}` },
      body: {
        alert_id: alertId,
        agent_id: agentProfile.id,
        notes: 'Patrouille immédiate Cocody',
      },
    });
    assert(assignRes.status === 200 && assignRes.body?.success, `3. Alerte assignée à l Agent Terrain (${agentProfile.fullName})`);

    // 7.4 Agent accepte la mission
    const acceptRes = await httpRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        alert_id: alertId,
        action: 'ACCEPT',
        latitude: 5.3484,
        longitude: -4.0305,
      },
    });
    assert(acceptRes.status === 200 && acceptRes.body?.success, '4. Agent accepte la mission (statut: ACCEPTED)');

    // 7.5 Agent part en mission
    const departRes = await httpRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        alert_id: alertId,
        action: 'DEPART',
        latitude: 5.3484,
        longitude: -4.0305,
      },
    });
    assert(departRes.status === 200 && departRes.body?.success, '5. Agent en route vers le site (statut: EN_ROUTE)');

    // 7.6 Agent arrive sur place
    const arriveRes = await httpRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        alert_id: alertId,
        action: 'ARRIVE',
        latitude: 5.3484,
        longitude: -4.0305,
      },
    });
    assert(arriveRes.status === 200 && arriveRes.body?.success, '6. Agent arrivé sur les lieux (statut: ARRIVED)');

    // 7.7 Clôture par l'agent
    const resolveRes = await httpRequest({
      method: 'PATCH',
      path: '/api/interventions',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: {
        alert_id: alertId,
        action: 'COMPLETE',
        notes: 'Zone sécurisée, client indemne.',
        latitude: 5.3484,
        longitude: -4.0305,
      },
    });
    assert(resolveRes.status === 200 && resolveRes.body?.success, '7. Mission résolue et clôturée (statut: RESOLVED)');

    // 7.8 Consultation du statut final de l'alerte par le client
    const clientCheckRes = await httpRequest({
      path: `/api/alerts/${alertId}`,
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert(
      clientCheckRes.status === 200 && clientCheckRes.body?.alert?.status === 'RESOLVED',
      `8. Alerte vérifiée par le client comme étant résolue (${clientCheckRes.body?.alert?.status})`
    );
  }

  // --------------------------------------------------------------------------
  // BILAN FINAL
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`   RÉSULTATS DE LA SUITE : ${passed + failed} tests exécutés`);
  console.log(`   SUCCÈS : ${passed} PASS`);
  console.log(`   ÉCHECS : ${failed} FAIL`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRealAuthSuite().catch((err) => {
  console.error('Erreur inattendue:', err);
  process.exit(1);
});

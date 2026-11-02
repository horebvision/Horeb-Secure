/**
 * =============================================================================
 * SECURIA SaaS — SUITE DE VALIDATION E2E SÉCURITÉ STAGING v2 (PHASE 2.5)
 * Fichier : scripts/test-phase2-2-staging-e2e-v2.js
 * =============================================================================
 * 
 * OBJECTIF :
 * Valider l'étanchéité multi-tenant, l'absence de régression 42P17, la protection des
 * preuves, l'immuabilité dual-tenant directe et indirecte, la protection de created_by et
 * organization_id, et le cloisonnement RLS (y compris l'isolation agent sur RPC) sur Staging.
 * 
 * RÈGLES DEVSECOPS STRICTES :
 * 1. Zéro secret ou mot de passe codé en dur.
 * 2. Mode réel STRICTEMENT IMPOSSIBLE sans STAGING_PROJECT_REF explicite et vérification
 *    stricte de l'URL Supabase. Refus par défaut de toute cible inconnue ou ambiguë.
 * 3. Mode déclaratif local sans AUCUN appel réseau ni effet distant.
 * 4. Pré-vol d'authentification : vérification de chaque JWT via /auth/v1/user.
 * 5. Contrôles positifs systématiques démontrant qu'un accès autorisé fonctionne.
 * 6. Assertions négatives précises : distinction formelle entre refus attendu (400 P0001,
 *    403 42501, 200 []), erreur de configuration (404), erreur auth (401), erreur schéma (42703) et erreur serveur (5xx).
 *    Aucun échec HTTP générique n'est comptabilisé comme un succès de sécurité.
 * 7. Contrôle de l'état persistant des données après chaque tentative interdite (directe ou indirecte).
 * 8. Échec immédiat du processus (process.exit(1)) en cas d'anomalie de sécurité.
 * 9. Traçabilité stricte : aucune affirmation d'exécution PostgreSQL sans connexion effective.
 * =============================================================================
 */

const { URL } = require('url');

/**
 * LISTE BLANCHE DES RÉFÉRENCES DE PROJET DE STAGING APPROUVÉES INDÉPENDAMMENT
 * RÈGLE SÉCURITÉ : Le mode réel (STAGING_EXECUTE_LIVE=true) est STRICTEMENT INTERDIT
 * si la référence fournie ne figure pas dans cette liste immuable.
 * En l'absence de projet de staging dédié audité, cette liste DOIT rester vide [].
 * Le mode réel est alors verrouillé par défaut (Fail-Safe / Secure by Default).
 */
const APPROVED_STAGING_PROJECT_REFS = Object.freeze([
  // Aucune référence n'est pré-approuvée dans le dépôt à ce jour.
  // Toute référence de staging doit être formellement auditée et ajoutée ici.
  // Exemple : 'securia-staging-isolated-x89f'
]);

/**
 * LISTE NOIRE FORMELLE DES IDENTIFIANTS DE PRODUCTION CONNUS (DÉFENSE EN PROFONDEUR)
 */
const KNOWN_PRODUCTION_REFS = Object.freeze([
  'gwxchazcuosajziampvk' // Référence de production documentée de SECURIA
]);

const rawLiveFlag = (process.env.STAGING_EXECUTE_LIVE || '').trim().toLowerCase() === 'true';
const rawUrl = (process.env.STAGING_SUPABASE_URL || '').trim();
const rawProjectRef = (process.env.STAGING_PROJECT_REF || '').trim();
const rawAnonKey = (process.env.STAGING_SUPABASE_ANON_KEY || '').trim();

let isLiveMode = false;
let validatedBaseUrl = '';
let validatedProjectRef = '';

// Si le mode réel est demandé, validation stricte obligatoire
if (rawLiveFlag) {
  // 1. STAGING_PROJECT_REF obligatoire
  if (!rawProjectRef) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Le mode réel (STAGING_EXECUTE_LIVE=true) exige une référence STAGING_PROJECT_REF.');
    process.exit(1);
  }

  const cleanProjectRef = rawProjectRef.toLowerCase();

  // 2. Défense en profondeur : refus absolu des références de production connues ou suspectes
  if (KNOWN_PRODUCTION_REFS.includes(cleanProjectRef) || cleanProjectRef.includes('prod') || cleanProjectRef.includes('live')) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Référence de projet "${rawProjectRef}" INTERDITE (environnement de production identifié ou suspecté).`);
    process.exit(1);
  }

  // 3. Format technique de la référence
  if (!/^[a-z0-9_-]{3,64}$/.test(cleanProjectRef)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format de référence de projet non valide ("${rawProjectRef}").`);
    process.exit(1);
  }

  // 4. Verrou d'autorisation par liste blanche (Secure-by-Default)
  if (APPROVED_STAGING_PROJECT_REFS.length === 0) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Aucune référence de projet de staging n\'est enregistrée dans APPROVED_STAGING_PROJECT_REFS.');
    console.error('   Le mode réel est BLOQUÉ par défaut pour protéger les environnements de production.');
    console.error('   Veuillez soumettre la référence de votre projet de staging dédié pour approbation formelle.');
    process.exit(1);
  }

  if (!APPROVED_STAGING_PROJECT_REFS.includes(cleanProjectRef)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : La référence "${rawProjectRef}" n'est pas approuvée.`);
    console.error('   Elle ne figure pas dans la liste blanche APPROVED_STAGING_PROJECT_REFS.');
    console.error('   Une variable d\'environnement opérateur ne constitue pas une autorisation suffisante.');
    process.exit(1);
  }

  // 5. STAGING_SUPABASE_URL et STAGING_SUPABASE_ANON_KEY obligatoires
  if (!rawUrl) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : STAGING_SUPABASE_URL est manquante en mode réel.');
    process.exit(1);
  }
  if (!rawAnonKey) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : STAGING_SUPABASE_ANON_KEY est manquante en mode réel.');
    process.exit(1);
  }

  // 6. Analyse WHATWG URL et vérification stricte anti-ambiguïté
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format d'URL Supabase invalide ("${rawUrl}") : ${err.message}`);
    process.exit(1);
  }

  // Rejet de tout vecteur d'ambiguïté (userinfo, search, hash, path non racine, port anormal)
  if (parsedUrl.username || parsedUrl.password) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Présence d\'identifiants utilisateur (userinfo) interdite dans l\'URL.');
    process.exit(1);
  }
  if (parsedUrl.search || parsedUrl.hash) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Les paramètres de requête (?) et fragments (#) sont interdits dans l\'URL.');
    process.exit(1);
  }
  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Chemin d'URL non racine interdit ("${parsedUrl.pathname}").`);
    process.exit(1);
  }
  if (parsedUrl.port && parsedUrl.port !== '443') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Port non standard détecté ("${parsedUrl.port}"). Seul le port HTTPS 443 est autorisé pour le Cloud.`);
    process.exit(1);
  }

  // Protocole HTTPS obligatoire
  if (parsedUrl.protocol !== 'https:') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole non sécurisé ("${parsedUrl.protocol}"). HTTPS obligatoire pour tout projet distant.`);
    process.exit(1);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Refus absolu de tout hôte de production ou domaine applicatif
  if (hostname.includes('production') || hostname.includes('app.securia.com') || hostname === 'securia.com') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte de production interdit ("${hostname}"). Arrêt immédiat.`);
    process.exit(1);
  }

  // Correspondance exacte absolue avec la référence approuvée
  const expectedCloudHost = `${cleanProjectRef}.supabase.co`;
  if (hostname !== expectedCloudHost) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Cible non conforme ("${hostname}"). L'hôte doit correspondre exactement à "${expectedCloudHost}".`);
    process.exit(1);
  }

  isLiveMode = true;
  validatedBaseUrl = parsedUrl.origin;
  validatedProjectRef = cleanProjectRef;
}

const CONFIG = {
  baseUrl: validatedBaseUrl,
  projectRef: validatedProjectRef,
  anonKey: rawAnonKey,
  isLive: isLiveMode,
  
  // Fixtures identiques à supabase/seed_staging_isolated_fixtures_v2.sql
  fixtures: {
    orgClientA: '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
    orgClientB: '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
    orgProvider1: '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf',
    orgProvider2: '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae',
    interventionDualId: '11111111-1111-1111-1111-111111111111',
    interventionBId: '22222222-2222-2222-2222-222222222222',
    alertAId: 'f1111111-1111-4000-8000-111111111111',
    alertBId: 'f2222222-2222-4000-8000-222222222222',
    agent1Id: 'a1111111-1111-1111-1111-111111111111',
    agent2Id: 'a2222222-2222-2222-2222-222222222222',
    centerP1Id: 'c1111111-1111-4000-8000-111111111111',
    centerP2Id: 'c2222222-2222-4000-8000-222222222222',
    invoiceAId: 'fa111111-1111-4000-8000-111111111111',
    subAId: '0b111111-1111-4000-8000-111111111111',
  },

  // Identifiants d'utilisateurs attendus pour chaque jeton
  expectedUserIds: {
    clientA: '11111111-aaaa-4000-8000-111111111111',
    clientB: '22222222-bbbb-4000-8000-222222222222',
    provider1: '33333333-cccc-4000-8000-333333333333',
    provider2: '44444444-dddd-4000-8000-444444444444',
    agent1: '55555555-eeee-4000-8000-555555555555',
    superAdmin: '99999999-ffff-4000-8000-999999999999',
  },

  tokens: {
    clientA: process.env.STAGING_JWT_CLIENT_A || '',
    clientB: process.env.STAGING_JWT_CLIENT_B || '',
    provider1: process.env.STAGING_JWT_PROVIDER_1 || '',
    provider2: process.env.STAGING_JWT_PROVIDER_2 || '',
    agent1: process.env.STAGING_JWT_AGENT_1 || '',
    superAdmin: process.env.STAGING_JWT_SUPERADMIN || '',
  }
};

const results = {
  passed: 0,
  failed: 0,
  configError: 0,
  authError: 0,
  serverError: 0,
  skipped: 0,
};

function logResult(category, title, details = '') {
  switch (category) {
    case 'PASS':
      console.log(`  ✅ [SUCCÈS DÉMONTRÉ] ${title}`);
      results.passed++;
      break;
    case 'FAIL':
      console.error(`  ❌ [ÉCHEC SÉCURITÉ] ${title} : ${details}`);
      results.failed++;
      break;
    case 'CONFIG_ERROR':
      console.error(`  ⚠️ [ERREUR CONFIG/CIBLE] ${title} : ${details}`);
      results.configError++;
      break;
    case 'AUTH_ERROR':
      console.error(`  🔑 [ERREUR AUTHENTIFICATION] ${title} : ${details}`);
      results.authError++;
      break;
    case 'SERVER_ERROR':
      console.error(`  💥 [ERREUR SERVEUR] ${title} : ${details}`);
      results.serverError++;
      break;
    case 'SKIP':
    default:
      console.log(`  ⏸️ [NON EXÉCUTÉ - STAGING REQUIS] ${title}`);
      results.skipped++;
      break;
  }
}

async function apiRequest(endpoint, method = 'GET', token = '', body = null) {
  if (!CONFIG.isLive) {
    throw new Error('SÉCURITÉ DEVSECOPS : Aucun appel réseau n\'est autorisé en mode déclaratif local.');
  }
  const url = `${CONFIG.baseUrl.replace(/\/+$/, '')}${endpoint}`;
  const headers = {
    'apikey': CONFIG.anonKey,
    'Authorization': `Bearer ${token || CONFIG.anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, error: err.message, isNetworkError: true };
  }
}

async function verifyJwtPreflight(roleName, token, expectedId) {
  if (!token) return { valid: false, reason: 'Jeton absent' };
  try {
    const res = await apiRequest('/auth/v1/user', 'GET', token);
    if (!res.ok || !res.data || !res.data.id) {
      return { valid: false, reason: `Échec /auth/v1/user (HTTP ${res.status})` };
    }
    if (res.data.id !== expectedId) {
      return { valid: false, reason: `Inadéquation UUID : attendu ${expectedId}, obtenu ${res.data.id}` };
    }
    return { valid: true, user: res.data };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

async function runStagingTestSuiteV2() {
  console.log('======================================================================');
  console.log('🛡️ SECURIA PHASE 2.5 — HARNAIS DE TESTS SÉCURITÉ STAGING AUDITABLE v2');
  console.log(`📡 URL Cible : ${CONFIG.baseUrl || '(Mode déclaratif local)'}`);
  console.log(`🔒 Mode Réel : ${CONFIG.isLive ? 'ACTIF' : 'INACTIF'}`);
  console.log('======================================================================\n');

  if (!CONFIG.isLive) {
    console.log('ℹ️ NOTICE DEVSECOPS : STAGING_SUPABASE_URL et STAGING_EXECUTE_LIVE=true ne sont pas armés.');
    console.log('   Exécution du contrôle statique et structurel du protocole.');
    console.log("   ⚠️ ATTENTION : Ces tests N'ONT PAS été exécutés contre PostgreSQL.");
    console.log('   Aucun test distant ne sera marqué réussi sans exécution HTTP/PostgreSQL certifiée.\n');
  }

  // ---------------------------------------------------------------------------
  // ÉTAPE 0 : VÉRIFICATION DE PRÉ-VOL DES JETONS D'AUTHENTIFICATION
  // ---------------------------------------------------------------------------
  console.log('--- ÉTAPE 0 : Contrôle de pré-vol des identités et sessions de test ---');
  let authReady = true;
  if (CONFIG.isLive) {
    for (const [roleName, token] of Object.entries(CONFIG.tokens)) {
      const expId = CONFIG.expectedUserIds[roleName];
      const check = await verifyJwtPreflight(roleName, token, expId);
      if (!check.valid) {
        logResult('AUTH_ERROR', `Vérification JWT pour ${roleName}`, check.reason);
        authReady = false;
      } else {
        console.log(`  🔑 [AUTH OK] ${roleName} authentifié avec succès (${check.user.email})`);
      }
    }
    if (!authReady) {
      console.error('\n❌ Échec du pré-vol d\'authentification : arrêt des tests de sécurité.');
      process.exit(1);
    }
  } else {
    logResult('SKIP', 'Contrôle de pré-vol /auth/v1/user');
  }

  // ---------------------------------------------------------------------------
  // TEST 1 : ANTI-AUTO-PROMOTION & ANTI-AUTO-RATTACHEMENT (public.users)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1 : Absence d\'auto-promotion et d\'auto-rattachement (Anti-Privilege Escalation) ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 1.0 Contrôle positif préalable : Client A peut lire son profil
      const resProfile = await apiRequest(`/rest/v1/users?id=eq.${CONFIG.expectedUserIds.clientA}`, 'GET', CONFIG.tokens.clientA);
      if (!resProfile.ok || !resProfile.data || resProfile.data.length !== 1) {
        logResult('CONFIG_ERROR', 'Lecture profil initial Client A', `Statut: ${resProfile.status}`);
      } else {
        // 1.1 Tentative d'auto-promotion ADMIN (Attendu : rejet trigger HTTP 400 P0001)
        const resRole = await apiRequest(`/rest/v1/users?id=eq.${CONFIG.expectedUserIds.clientA}`, 'PATCH', CONFIG.tokens.clientA, { role: 'ADMIN' });
        const roleBlocked = resRole.status === 400 && resRole.data && resRole.data.message && resRole.data.message.includes('Action interdite');
        
        // Vérification état persistant : relecture du profil
        const resCheckRole = await apiRequest(`/rest/v1/users?id=eq.${CONFIG.expectedUserIds.clientA}&select=role`, 'GET', CONFIG.tokens.clientA);
        const roleUnchanged = resCheckRole.ok && resCheckRole.data[0]?.role === 'USER';

        if (roleBlocked && roleUnchanged) {
          logResult('PASS', 'Trigger v4.2 bloque le rôle ADMIN et l\'état persistant reste USER');
        } else if (resRole.status >= 500) {
          logResult('SERVER_ERROR', 'Blocage auto-promotion', `Erreur serveur HTTP ${resRole.status}`);
        } else {
          logResult('FAIL', 'Blocage auto-promotion', `Statut: ${resRole.status}, Persistance: ${resCheckRole.data?.[0]?.role}`);
        }

        // 1.2 Tentative d'auto-rattachement organisation (Attendu : rejet trigger HTTP 400 P0001)
        const resOrg = await apiRequest(`/rest/v1/users?id=eq.${CONFIG.expectedUserIds.clientA}`, 'PATCH', CONFIG.tokens.clientA, { organization_id: CONFIG.fixtures.orgProvider1 });
        const orgBlocked = resOrg.status === 400 && resOrg.data && resOrg.data.message && resOrg.data.message.includes('Action interdite');
        
        const resCheckOrg = await apiRequest(`/rest/v1/users?id=eq.${CONFIG.expectedUserIds.clientA}&select=organization_id`, 'GET', CONFIG.tokens.clientA);
        const orgUnchanged = resCheckOrg.ok && resCheckOrg.data[0]?.organization_id === CONFIG.fixtures.orgClientA;

        if (orgBlocked && orgUnchanged) {
          logResult('PASS', 'Trigger v4.2 bloque le changement d\'org et l\'organisation reste Client A');
        } else if (resOrg.status >= 500) {
          logResult('SERVER_ERROR', 'Blocage auto-rattachement', `Erreur serveur HTTP ${resOrg.status}`);
        } else {
          logResult('FAIL', 'Blocage auto-rattachement', `Statut: ${resOrg.status}, Persistance: ${resCheckOrg.data?.[0]?.organization_id}`);
        }
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test anti-auto-promotion', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /users { role: "ADMIN" } et { organization_id }');
  }

  // ---------------------------------------------------------------------------
  // TEST 2 : ISOLATION CLIENT A VS CLIENT B (Alertes & Interventions)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2 : Cloisonnement strict Client A vs Client B ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 2.1 Contrôle positif : Client A voit son alerte A
      const resA = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'GET', CONFIG.tokens.clientA);
      const clientAHasRow = resA.ok && Array.isArray(resA.data) && resA.data.length === 1;

      // 2.2 Contrôle positif : Client B voit son alerte B
      const resB_own = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertBId}`, 'GET', CONFIG.tokens.clientB);
      const clientBHasRow = resB_own.ok && Array.isArray(resB_own.data) && resB_own.data.length === 1;

      // 2.3 Contrôle négatif : Client B ne voit PAS l'alerte du Client A (RLS filtering : HTTP 200 avec [])
      const resB_cross = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'GET', CONFIG.tokens.clientB);
      const clientBBlocked = resB_cross.ok && Array.isArray(resB_cross.data) && resB_cross.data.length === 0;

      // 2.4 Contrôle d'absence de fuite transversale
      const resAllB = await apiRequest('/rest/v1/alerts?select=id,organization_id', 'GET', CONFIG.tokens.clientB);
      const leaks = (resAllB.data || []).filter(r => r.organization_id === CONFIG.fixtures.orgClientA);

      if (clientAHasRow && clientBHasRow && clientBBlocked && leaks.length === 0) {
        logResult('PASS', 'Client A accède à son alerte, Client B accède à la sienne et ne voit rien du Client A');
      } else if (!clientAHasRow || !clientBHasRow) {
        logResult('CONFIG_ERROR', 'Préexistence des alertes cibles', `Alert A: ${clientAHasRow}, Alert B: ${clientBHasRow}`);
      } else {
        logResult('FAIL', 'Isolation Client A vs B', `B bloqué: ${clientBBlocked}, Fuites A dans B: ${leaks.length}`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test isolation Client A vs B', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /alerts croisé Client A et Client B');
  }

  // ---------------------------------------------------------------------------
  // TEST 3 : ISOLATION PRESTATAIRE 1 VS PRESTATAIRE 2 (Agents de sécurité)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3 : Cloisonnement strict Prestataire 1 vs Prestataire 2 (Agents) ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 3.1 Contrôle positif P1 : voit ses agents
      const resAgentsP1 = await apiRequest('/rest/v1/security_agents?select=id,organization_id', 'GET', CONFIG.tokens.provider1);
      const rowsP1 = resAgentsP1.data || [];
      const hasAgent1 = rowsP1.some(a => a.id === CONFIG.fixtures.agent1Id);
      const hasAgent2LeakInP1 = rowsP1.some(a => a.organization_id === CONFIG.fixtures.orgProvider2);

      // 3.2 Contrôle positif P2 : voit ses agents
      const resAgentsP2 = await apiRequest('/rest/v1/security_agents?select=id,organization_id', 'GET', CONFIG.tokens.provider2);
      const rowsP2 = resAgentsP2.data || [];
      const hasAgent2 = rowsP2.some(a => a.id === CONFIG.fixtures.agent2Id);
      const hasAgent1LeakInP2 = rowsP2.some(a => a.organization_id === CONFIG.fixtures.orgProvider1);

      if (resAgentsP1.ok && resAgentsP2.ok && hasAgent1 && hasAgent2 && !hasAgent2LeakInP1 && !hasAgent1LeakInP2) {
        logResult('PASS', 'Prestataire 1 et Prestataire 2 voient exclusivement leurs propres agents');
      } else if (!hasAgent1 || !hasAgent2) {
        logResult('CONFIG_ERROR', 'Agents de test cibles introuvables', `Agent 1: ${hasAgent1}, Agent 2: ${hasAgent2}`);
      } else {
        logResult('FAIL', 'Cloisonnement agents P1 vs P2', `Fuite P2 dans P1: ${hasAgent2LeakInP1}, Fuite P1 dans P2: ${hasAgent1LeakInP2}`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test agents P1 vs P2', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /security_agents par Prestataire 1 et Prestataire 2');
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // TEST 4 : ACCÈS DUAL-TENANT PARTAGÉ & IMMUABILITÉ DIRECTE ET INDIRECTE À L'UPDATE
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4 : Accès dual-tenant légitime et immuabilité directe et indirecte ---');
  if (CONFIG.isLive && authReady) {
    try {
      const q = `/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`;
      const resCli = await apiRequest(q, 'GET', CONFIG.tokens.clientA);
      const resP1 = await apiRequest(q, 'GET', CONFIG.tokens.provider1);
      const resP2 = await apiRequest(q, 'GET', CONFIG.tokens.provider2);

      const cliOk = resCli.ok && resCli.data?.length === 1;
      const p1Ok = resP1.ok && resP1.data?.length === 1;
      const p2Blocked = resP2.ok && resP2.data?.length === 0;

      // 4.1 Tentative de détournement direct du client de l'intervention par P1
      const resTamperClient = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        client_organization_id: CONFIG.fixtures.orgClientB
      });
      const tamperClientBlocked = resTamperClient.status === 400 && (
        resTamperClient.data?.message?.includes('immuable') ||
        resTamperClient.data?.message?.includes('Action interdite')
      );

      // 4.2 Tentative de détournement direct du prestataire de l'intervention par P1
      const resTamperProvider = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        provider_organization_id: CONFIG.fixtures.orgProvider2
      });
      const tamperProviderBlocked = resTamperProvider.status === 400 && (
        resTamperProvider.data?.message?.includes('immuable') ||
        resTamperProvider.data?.message?.includes('Action interdite')
      );

      // 4.3 Tentative de détournement indirect du prestataire via security_center_id (assignation centre P2)
      const resTamperCenter = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        security_center_id: CONFIG.fixtures.centerP2Id
      });
      const tamperCenterBlocked = resTamperCenter.status === 400 && (
        resTamperCenter.data?.message?.includes('Action interdite') ||
        resTamperCenter.data?.message?.includes('Incohérence multi-tenant') ||
        resTamperCenter.data?.message?.includes('différent du prestataire') ||
        resTamperCenter.data?.message?.includes('immuable')
      );

      // 4.4 Tentative de détournement indirect du prestataire via agent_id (assignation agent P2)
      const resTamperAgent = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        agent_id: CONFIG.fixtures.agent2Id
      });
      const tamperAgentBlocked = resTamperAgent.status === 400 && (
        resTamperAgent.data?.message?.includes('Action interdite') ||
        resTamperAgent.data?.message?.includes('Incohérence multi-tenant') ||
        resTamperAgent.data?.message?.includes('différent du prestataire') ||
        resTamperAgent.data?.message?.includes('immuable')
      );

      // 4.1.bis Tentative de falsification de created_by par P1
      const resTamperCreatedBy = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        created_by: CONFIG.expectedUserIds.clientB
      });
      const tamperCreatedByBlocked = resTamperCreatedBy.status === 400 && (
        resTamperCreatedBy.data?.message?.includes('immuable') ||
        resTamperCreatedBy.data?.message?.includes('Action interdite')
      );

      // 4.1.ter Tentative de détournement direct de organization_id par P1
      const resTamperOrg = await apiRequest(q, 'PATCH', CONFIG.tokens.provider1, {
        organization_id: CONFIG.fixtures.orgClientB
      });
      const tamperOrgBlocked = resTamperOrg.status === 400 && (
        resTamperOrg.data?.message?.includes('immuable') ||
        resTamperOrg.data?.message?.includes('Action interdite') ||
        resTamperOrg.data?.message?.includes('Incohérence multi-tenant')
      );

      // 4.5 Contrôle strict de l'état persistant complet après tentatives interdites
      const resCheckDual = await apiRequest(q, 'GET', CONFIG.tokens.clientA);
      const rowPersisted = resCheckDual.ok && resCheckDual.data?.[0];
      const clientOrgPersisted = rowPersisted?.client_organization_id === CONFIG.fixtures.orgClientA;
      const providerOrgPersisted = rowPersisted?.provider_organization_id === CONFIG.fixtures.orgProvider1;
      const centerPersisted = rowPersisted?.security_center_id === CONFIG.fixtures.centerP1Id;
      const agentPersisted = rowPersisted?.agent_id === CONFIG.fixtures.agent1Id;
      const alertPersisted = rowPersisted?.alert_id === CONFIG.fixtures.alertAId;
      const createdByPersisted = !rowPersisted?.created_by || rowPersisted?.created_by === CONFIG.expectedUserIds.clientA;
      const orgIdPersisted = rowPersisted?.organization_id === CONFIG.fixtures.orgClientA;

      const stateIntact = clientOrgPersisted && providerOrgPersisted && centerPersisted && agentPersisted && alertPersisted && createdByPersisted && orgIdPersisted;

      if (cliOk && p1Ok && p2Blocked && tamperClientBlocked && tamperProviderBlocked && tamperCenterBlocked && tamperAgentBlocked && tamperCreatedByBlocked && tamperOrgBlocked && stateIntact) {
        logResult('PASS', 'Accès conjoint validé, P2 exclu, immuabilité directe/indirecte (centre/agent/created_by/organization_id) respectée avec état persistant intact');
      } else if (!cliOk || !p1Ok) {
        logResult('CONFIG_ERROR', 'Intervention dual-tenant cible introuvable', `Cli: ${cliOk}, P1: ${p1Ok}`);
      } else {
        logResult('FAIL', 'Dual-tenant et immuabilité directe/indirecte', 
          `P2 exclu: ${p2Blocked}, Tamper client: ${tamperClientBlocked}, Tamper prestataire: ${tamperProviderBlocked}, Tamper centre: ${tamperCenterBlocked}, Tamper agent: ${tamperAgentBlocked}, Tamper created_by: ${tamperCreatedByBlocked}, Tamper org: ${tamperOrgBlocked}, État persistant intact: ${stateIntact}`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test dual-tenant et immuabilité directe/indirecte', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel accès dual-tenant et tentatives de détournement direct et indirect (centre/agent)');
  }

  // ---------------------------------------------------------------------------
  // TEST 5 : VERROUILLAGE DES ALERTES CONTRE L'AFFECTATION ARBITRAIRE
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5 : Verrouillage des alertes (Anti-tampering résident) ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 5.0 Contrôle positif préalable : l'alerte existe et est assignée à Agent 1
      const resPreAlert = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'GET', CONFIG.tokens.clientA);
      const preAlertOk = resPreAlert.ok && resPreAlert.data?.[0]?.assigned_agent_id === CONFIG.fixtures.agent1Id;

      if (!preAlertOk) {
        logResult('CONFIG_ERROR', 'Alerte A initiale introuvable ou mal configurée');
      } else {
        // Résident tente de modifier l'agent assigné de son alerte
        const resTamperAlert = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'PATCH', CONFIG.tokens.clientA, {
          assigned_agent_id: CONFIG.fixtures.agent2Id // Agent de P2
        });
        // Attendu précis : HTTP 400 avec message "Action interdite"
        const alertTamperBlocked = resTamperAlert.status === 400 && resTamperAlert.data?.message?.includes('Action interdite');

        // Vérifier persistance : agent assigné reste Agent 1
        const resCheckAlert = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}&select=assigned_agent_id`, 'GET', CONFIG.tokens.clientA);
        const alertAgentUnchanged = resCheckAlert.ok && resCheckAlert.data[0]?.assigned_agent_id === CONFIG.fixtures.agent1Id;

        if (alertTamperBlocked && alertAgentUnchanged) {
          logResult('PASS', 'Trigger v4.2 bloque la falsification d\'agent par le résident et l\'assignation reste intacte');
        } else {
          logResult('FAIL', 'Protection alerte agent', `Rejet 400: ${alertTamperBlocked}, Persistance: ${resCheckAlert.data?.[0]?.assigned_agent_id}`);
        }
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test protection alerte', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /alerts assignation agent non autorisée');
  }

  // ---------------------------------------------------------------------------
  // TEST 6 : FACTURES ET ABONNEMENTS (INTERDICTION D'ÉCRITURE PAR RÔLE ORDINAIRE)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6 : Protection des factures et abonnements (Lecture seule pour résidents/agents) ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 6.0 Contrôle positif préalable : SuperAdmin peut lire la facture
      const resCheckInitial = await apiRequest(`/rest/v1/invoices?id=eq.${CONFIG.fixtures.invoiceAId}`, 'GET', CONFIG.tokens.superAdmin);
      const invoiceExists = resCheckInitial.ok && resCheckInitial.data?.length === 1;

      if (!invoiceExists) {
        logResult('CONFIG_ERROR', 'Facture de test initiale introuvable');
      } else {
        const initialTotal = resCheckInitial.data[0].total;

        // 6.1 Tentative d'UPDATE d'une facture par Client A (rôle USER)
        const resInvoicePatch = await apiRequest(`/rest/v1/invoices?id=eq.${CONFIG.fixtures.invoiceAId}`, 'PATCH', CONFIG.tokens.clientA, {
          status: 'PAID', total: 0
        });
        // Attendu précis : HTTP 403 / 401 (Permission Denied SQL 42501) ou HTTP 200 [] (RLS write scoping)
        const isPermissionDenied = resInvoicePatch.status === 403 || (resInvoicePatch.status === 400 && resInvoicePatch.data?.code === '42501');
        const isRlsEmpty = resInvoicePatch.ok && Array.isArray(resInvoicePatch.data) && resInvoicePatch.data.length === 0;
        const invoiceWriteBlocked = isPermissionDenied || isRlsEmpty;

        // Relecture persistance par SuperAdmin
        const resCheckPost = await apiRequest(`/rest/v1/invoices?id=eq.${CONFIG.fixtures.invoiceAId}`, 'GET', CONFIG.tokens.superAdmin);
        const invoiceUnmodified = resCheckPost.ok && resCheckPost.data?.[0]?.total === initialTotal;

        // 6.2 Tentative d'UPDATE d'un abonnement par Client A (rôle USER)
        const resSubPatch = await apiRequest(`/rest/v1/subscriptions?id=eq.${CONFIG.fixtures.subAId}`, 'PATCH', CONFIG.tokens.clientA, {
          status: 'EXPIRED'
        });
        const subWriteBlocked = resSubPatch.status === 403 || (resSubPatch.ok && Array.isArray(resSubPatch.data) && resSubPatch.data.length === 0);

        if (invoiceWriteBlocked && invoiceUnmodified && subWriteBlocked) {
          logResult('PASS', 'Écritures sur factures et abonnements strictement bloquées pour utilisateurs ordinaires (état persistant intact)');
        } else if (resInvoicePatch.status >= 500 || resSubPatch.status >= 500) {
          logResult('SERVER_ERROR', 'Protection factures/abonnements', `Erreur serveur HTTP ${resInvoicePatch.status}/${resSubPatch.status}`);
        } else {
          logResult('FAIL', 'Protection factures/abonnements', `Invoice bloqué: ${invoiceWriteBlocked}, Inchangé: ${invoiceUnmodified}, Sub bloqué: ${subWriteBlocked}`);
        }
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test facturation', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /invoices et PATCH /subscriptions');
  }

  // ---------------------------------------------------------------------------
  // TEST 7 : ISOLATION DES CLÉS D'API & NON-EXPOSITION DE KEY_HASH
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7 : Protection des clés d\'API et non-exposition de key_hash ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 7.0 Contrôle positif : Admin B peut lire ses clés d'API autorisées (sans key_hash)
      const resAdminB = await apiRequest('/rest/v1/api_keys?select=id,organization_id,key_prefix', 'GET', CONFIG.tokens.clientB);
      const keysB = resAdminB.data || [];
      const adminBOk = resAdminB.ok && keysB.length > 0 && keysB.every(k => k.organization_id === CONFIG.fixtures.orgClientB);

      // 7.1 Lecture par rôle anon (Attendu précis : HTTP 401 ou 403)
      const resAnon = await apiRequest('/rest/v1/api_keys', 'GET', '');
      const anonBlocked = resAnon.status === 401 || resAnon.status === 403;

      // 7.2 Tentative de projection de la colonne sensible key_hash
      // Distinction formelle exigée : refus de permission (42501), erreur de schéma (42703), erreur de configuration (404)
      const resHashAttempt = await apiRequest('/rest/v1/api_keys?select=id,key_hash', 'GET', CONFIG.tokens.clientB);
      
      let hashPermissionBlocked = false;
      let hashFailureDetail = '';

      if (resHashAttempt.status === 404) {
        logResult('CONFIG_ERROR', 'Protection key_hash : endpoint ou table /api_keys introuvable (HTTP 404)');
      } else if (
        resHashAttempt.data?.code === '42703' ||
        resHashAttempt.data?.message?.toLowerCase().includes('does not exist') ||
        resHashAttempt.data?.message?.toLowerCase().includes('could not find')
      ) {
        hashFailureDetail = `Erreur de schéma détectée (colonne key_hash inexistante code 42703) au lieu d'un refus de permission SQL (42501) : ${resHashAttempt.data?.message}`;
        logResult('FAIL', 'Protection key_hash (Erreur Schéma)', hashFailureDetail);
      } else if (
        (resHashAttempt.status === 403 || resHashAttempt.status === 400) &&
        (resHashAttempt.data?.code === '42501' || resHashAttempt.data?.message?.toLowerCase().includes('permission denied'))
      ) {
        // Refus de permission SQL attendu et certifié
        hashPermissionBlocked = true;
      } else if (resHashAttempt.ok) {
        hashFailureDetail = `Fuite critique de sécurité : la colonne sensible key_hash a été projetée avec succès (HTTP ${resHashAttempt.status})`;
        logResult('FAIL', 'Protection key_hash (Fuite)', hashFailureDetail);
      } else {
        hashFailureDetail = `Réponse inattendue non certifiée comme refus de permission SQL (Statut: ${resHashAttempt.status}, Code: ${resHashAttempt.data?.code}, Message: ${resHashAttempt.data?.message})`;
        logResult('FAIL', 'Protection key_hash (Indéterminé)', hashFailureDetail);
      }

      if (adminBOk && anonBlocked && hashPermissionBlocked) {
        logResult('PASS', 'Clés d\'API accessibles légitimement, bloquées pour anon, et projection key_hash refusée par permission SQL 42501');
      } else if (!adminBOk) {
        logResult('CONFIG_ERROR', 'Clés d\'API du Client B introuvables');
      } else if (!anonBlocked) {
        logResult('FAIL', 'Protection clés d\'API', `Accès anonyme non bloqué (Statut HTTP ${resAnon.status})`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test clés d\'API', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /api_keys par anon et vérification permission restrictive sur key_hash');
  }

  // ---------------------------------------------------------------------------
  // TEST 8 : PROTECTION DES PREUVES (ON DELETE RESTRICT SUR ALERTE & INTERVENTION)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8 : Protection des preuves historiques contre suppression en cascade ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 8.0 Contrôle positif préalable : l'alerte A et l'intervention liée existent
      const resPreA = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'GET', CONFIG.tokens.superAdmin);
      const resPreI = await apiRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`, 'GET', CONFIG.tokens.superAdmin);
      const preExists = resPreA.ok && resPreA.data?.length === 1 && resPreI.ok && resPreI.data?.length === 1;

      if (!preExists) {
        logResult('CONFIG_ERROR', 'Alerte A ou intervention liée introuvable avant test DELETE');
      } else {
        // Tenter de supprimer l'alerte A alors qu'une intervention y est liée
        const resDelAlert = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'DELETE', CONFIG.tokens.superAdmin);
        // Attendu précis : HTTP 400 ou 409 avec message contenant "foreign key constraint" ou "fk_interventions_alert" (Code 23503)
        const isFkViolation = (resDelAlert.status === 400 || resDelAlert.status === 409) && 
                              (resDelAlert.data?.message?.includes('foreign key') || resDelAlert.data?.message?.includes('fk_interventions_alert') || resDelAlert.data?.code === '23503');

        // Vérification persistance : l'alerte et l'intervention liée existent toujours intactes
        const resPostA = await apiRequest(`/rest/v1/alerts?id=eq.${CONFIG.fixtures.alertAId}`, 'GET', CONFIG.tokens.superAdmin);
        const resPostI = await apiRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`, 'GET', CONFIG.tokens.superAdmin);
        const alertPreserved = resPostA.ok && resPostA.data?.length === 1;
        const interventionPreserved = resPostI.ok && resPostI.data?.length === 1;

        if (isFkViolation && alertPreserved && interventionPreserved) {
          logResult('PASS', 'Contrainte fk_interventions_alert RESTRICT protège l\'alerte et l\'intervention contre la suppression');
        } else if (resDelAlert.status >= 500) {
          logResult('SERVER_ERROR', 'Protection des preuves', `Erreur serveur HTTP ${resDelAlert.status}`);
        } else {
          logResult('FAIL', 'Protection des preuves historiques', `FK violation (23503): ${isFkViolation}, Alerte préservée: ${alertPreserved}, Intervention préservée: ${interventionPreserved}`);
        }
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test protection preuves', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel DELETE /alerts et conservation intervention liée');
  }

  // ---------------------------------------------------------------------------
  // TEST 9 : PROCÉDURE RPC (Contrôle positif, alignement RLS et isolation Agent)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9 : Procédure RPC get_scoped_interventions_feed (Accès légitime, alignement RLS et isolation Agent) ---');
  if (CONFIG.isLive && authReady) {
    try {
      // 9.0 Contrôle positif : Client A appelle la RPC pour son organisation
      const resRpcClientA = await apiRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.clientA, {
        p_org_id: CONFIG.fixtures.orgClientA
      });
      const rpcClientAOk = resRpcClientA.ok && Array.isArray(resRpcClientA.data);

      // 9.1 Contrôle positif : Manager P1 appelle la RPC pour son organisation (accès complet au feed du prestataire)
      const resRpcManagerP1 = await apiRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.provider1, {
        p_org_id: CONFIG.fixtures.orgProvider1
      });
      const rpcManagerP1Ok = resRpcManagerP1.ok && Array.isArray(resRpcManagerP1.data);

      // 9.2 Contrôle positif : Agent 1 appelle la RPC pour son prestataire (doit recevoir ses interventions assignées)
      const resRpcAgent1 = await apiRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.agent1, {
        p_org_id: CONFIG.fixtures.orgProvider1
      });
      const rpcAgent1Ok = resRpcAgent1.ok && Array.isArray(resRpcAgent1.data);

      // 9.3 Contrôle négatif d'étanchéité Agent : l'Agent ne doit PAS voir les interventions non assignées ou d'autres agents
      let agentLeakedInterventions = false;
      let agentAssignedCount = 0;
      if (rpcAgent1Ok) {
        for (const itv of resRpcAgent1.data) {
          if (itv.agent_id !== CONFIG.fixtures.agent1Id) {
            agentLeakedInterventions = true;
          } else {
            agentAssignedCount++;
          }
        }
      }

      // 9.4 Contrôle négatif cross-tenant : Client A tente d'accéder au feed de Client B
      const resRpcCrossClient = await apiRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.clientA, {
        p_org_id: CONFIG.fixtures.orgClientB
      });
      const rpcCrossClientBlocked = resRpcCrossClient.status === 400 && 
        (resRpcCrossClient.data?.message?.includes('Accès refusé') || resRpcCrossClient.data?.code === 'P0001');

      // 9.5 Contrôle négatif cross-provider : Manager P1 tente d'accéder au feed de Prestataire 2
      const resRpcCrossProvider = await apiRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.provider1, {
        p_org_id: CONFIG.fixtures.orgProvider2
      });
      const rpcCrossProviderBlocked = resRpcCrossProvider.status === 400 && 
        (resRpcCrossProvider.data?.message?.includes('Accès refusé') || resRpcCrossProvider.data?.code === 'P0001');

      const allChecksPass = rpcClientAOk && rpcManagerP1Ok && rpcAgent1Ok && 
                            !agentLeakedInterventions && rpcCrossClientBlocked && rpcCrossProviderBlocked;

      if (allChecksPass) {
        logResult('PASS', `RPC get_scoped_interventions_feed : exécutions légitimes (Client, Manager P1, Agent P1 [${agentAssignedCount} assignée(s)]) validées, isolation agent étanche (zéro fuite) et rejets cross-tenant/cross-provider certifiés (P0001)`);
      } else if (agentLeakedInterventions) {
        logResult('FAIL', 'Alignement RLS Agent sur RPC', 'Fuite détectée : l\'Agent 1 a reçu des interventions qui ne lui sont pas assignées !');
      } else if (!rpcCrossClientBlocked || !rpcCrossProviderBlocked) {
        logResult('FAIL', 'Cloisonnement RPC cross-tenant', `Cross-client bloqué: ${rpcCrossClientBlocked}, Cross-provider bloqué: ${rpcCrossProviderBlocked}`);
      } else {
        logResult('FAIL', 'RPC feed', `ClientA: ${rpcClientAOk}, ManagerP1: ${rpcManagerP1Ok}, Agent1: ${rpcAgent1Ok}`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test RPC feed', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel POST /rest/v1/rpc/get_scoped_interventions_feed avec contrôles agent et cross-tenant');
  }

  // ---------------------------------------------------------------------------
  // TEST 10 : SUPER-ADMINISTRATEUR DE PLATEFORME ET CONTRÔLE SANS RÉCURSION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10 : Super-Administrateur de Plateforme et absence d\'erreur 42P17 ---');
  if (CONFIG.isLive && authReady) {
    try {
      const resSuper = await apiRequest('/rest/v1/interventions?select=id,client_organization_id,provider_organization_id', 'GET', CONFIG.tokens.superAdmin);
      const isRecursionFree = resSuper.status !== 500 && !(resSuper.data?.message?.includes('infinite recursion') || resSuper.data?.code === '42P17');
      const hasAllInterventions = resSuper.ok && Array.isArray(resSuper.data) && resSuper.data.length >= 2;

      if (isRecursionFree && hasAllInterventions) {
        logResult('PASS', 'Super-Administrateur certifié sans récursion RLS 42P17 et accès multi-org validé');
      } else {
        logResult('FAIL', 'Super-Administrateur', `Statut: ${resSuper.status}, 42P17 free: ${isRecursionFree}, Lignes: ${resSuper.data?.length}`);
      }
    } catch (err) {
      logResult('SERVER_ERROR', 'Test Super-Administrateur', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /interventions par Super-Admin et test non-récursion');
  }

  // ---------------------------------------------------------------------------
  // BILAN FINAL PAR CATÉGORIES
  // ---------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('📊 BILAN GLOBAL DU HARNAIS STAGING v2 (PHASE 2.5) :');
  console.log(`   - Succès de sécurité démontrés : ${results.passed}`);
  console.log(`   - Échecs de sécurité : ${results.failed}`);
  console.log(`   - Erreurs serveur (5xx / réseau) : ${results.serverError}`);
  console.log(`   - Erreurs de configuration : ${results.configError}`);
  console.log(`   - Erreurs d'authentification : ${results.authError}`);
  console.log(`   - Tests non exécutés (attente staging armé) : ${results.skipped}`);
  console.log('======================================================================');
  if (!CONFIG.isLive) {
    console.log('ℹ️ ÉTAT DU PROTOCOLE : Contrôle local déclaratif complété avec succès.');
    console.log("⚠️ AVERTISSEMENT : Ces tests N'ONT PAS été exécutés contre une base PostgreSQL active.");
    console.log('   La validation dynamique finale doit impérativement être menée sur PostgreSQL Staging.\n');
  }

  if (CONFIG.isLive) {
    if (results.failed > 0 || results.serverError > 0 || results.authError > 0 || results.configError > 0) {
      console.error('❌ ÉCHEC DU HARNAIS : Une ou plusieurs anomalies de sécurité ou erreurs ont été constatées.');
      process.exit(1);
    }
  }
}

runStagingTestSuiteV2().catch((err) => {
  console.error('❌ EXCEPTION CRITIQUE INATTENDUE DANS LE HARNAIS :', err.message);
  process.exit(1);
});

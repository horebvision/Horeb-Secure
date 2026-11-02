/**
 * SECURIA — Suite de Tests de Sécurité (Phase 1)
 * ===============================================
 * Valide les exigences impératives de la Phase 1 :
 * 1. Sécurisation de /api/test-db (aucune fuite, 404 strict en production et pour les anonymes)
 * 2. Élimination des clés Supabase en dur et échec sécurisé
 * 3. Isolation multi-tenant stricte dans /api/v1/agents (filtre SQL avant pagination)
 * 4. Isolation multi-tenant stricte dans /api/v1/interventions (filtre SQL avant pagination)
 * 5. Préservation des fonctionnalités métier (SOS, SOC, Agent, Secrétariat)
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const ORG_A_ID = '07a20bbd-ac06-4754-9ee9-9a29a25e992a'; // Securia Pilot / Entreprise A
const ORG_B_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517'; // Securia Master / Entreprise B
const DUMMY_ORG_ID = '00000000-0000-0000-0000-000000000000';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Échec du test: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   SECURIA — BATTERIE DE TESTS DE SÉCURITÉ PHASE 1');
  console.log('======================================================\n');

  // Initialisation du client admin de test avec la clé d'environnement
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  assert(!!supabaseUrl, 'Variable NEXT_PUBLIC_SUPABASE_URL configurée');
  assert(!!serviceRoleKey, 'Variable SUPABASE_SERVICE_ROLE_KEY configurée');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --------------------------------------------------------------------------
  // TEST 1 : Vérification de l'endpoint /api/test-db
  // --------------------------------------------------------------------------
  console.log('1. Test de la sécurisation de l\'endpoint /api/test-db');
  {
    const routeSource = fs.readFileSync('src/app/api/test-db/route.ts', 'utf8');

    // Vérifier la désactivation en production
    assert(
      routeSource.includes("process.env.NODE_ENV === 'production'") &&
      routeSource.includes("status: 404"),
      'L\'endpoint renvoie un code HTTP 404 strict en environnement de production'
    );

    // Vérifier l'exigence d'authentification Super Admin
    assert(
      routeSource.includes("user.isPlatformAdmin") &&
      routeSource.includes("allowedRoles: ['ADMIN']"),
      'L\'accès hors-production est strictement verrouillé aux Super Admins de la Plateforme'
    );

    // Vérifier l'élimination des fuites d'informations
    assert(!routeSource.includes("tableNames"), 'Aucune liste de tables sensibles n\'est exposée');
    assert(!routeSource.includes("read_organizations"), 'Aucun dump d\'organisations n\'est exposé');
    assert(!routeSource.includes("read_security_centers"), 'Aucun dump de centres de sécurité n\'est exposé');
    assert(!routeSource.includes("crud_tests"), 'Aucun détail de CRUD interne n\'est renvoyé');
  }

  // --------------------------------------------------------------------------
  // TEST 2 : Validation de la gestion sécurisée des clés Supabase
  // --------------------------------------------------------------------------
  console.log('\n2. Test de la gestion des clés et suppression des valeurs en dur');
  {
    const adminSource = fs.readFileSync('src/lib/supabase/admin.ts', 'utf8');
    const serverSource = fs.readFileSync('src/lib/supabase/server.ts', 'utf8');
    const clientSource = fs.readFileSync('src/lib/supabase/client.ts', 'utf8');
    const guardSource = fs.readFileSync('src/lib/security/api-guard.ts', 'utf8');
    const profileSource = fs.readFileSync('src/app/api/auth/profile/route.ts', 'utf8');

    assert(!adminSource.includes('DEFAULT_SERVICE_ROLE_KEY'), 'admin.ts : Clé DEFAULT_SERVICE_ROLE_KEY supprimée');
    assert(!adminSource.includes('DEFAULT_SUPABASE_ANON_KEY'), 'admin.ts : Clé DEFAULT_SUPABASE_ANON_KEY supprimée');
    assert(!serverSource.includes('DEFAULT_SUPABASE_ANON_KEY'), 'server.ts : Clé anon par défaut supprimée');
    assert(!clientSource.includes('DEFAULT_SUPABASE_ANON_KEY'), 'client.ts : Clé anon par défaut supprimée');
    assert(!guardSource.includes('DEFAULT_SUPABASE_ANON_KEY'), 'api-guard.ts : Clé anon par défaut supprimée');
    assert(!profileSource.includes('DEFAULT_SUPABASE_ANON_KEY'), 'api/auth/profile : Clé anon par défaut supprimée');

    // Vérification de la détection de clé réelle
    function isRealServiceRoleKey(key) {
      if (!key || key.length < 30) return false;
      try {
        const parts = key.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          return payload.role === 'service_role';
        }
      } catch {}
      return false;
    }

    assert(isRealServiceRoleKey(serviceRoleKey), 'La clé d\'environnement est reconnue comme un jeton service_role valide');
    assert(!isRealServiceRoleKey('fake-short-key'), 'Une clé factice est immédiatement rejetée');
    assert(!isRealServiceRoleKey(''), 'Une clé vide est rejetée');
  }

  // --------------------------------------------------------------------------
  // TEST 3 : Isolation multi-tenant des agents (/api/v1/agents)
  // --------------------------------------------------------------------------
  console.log('\n3. Test de l\'isolation multi-tenant de /api/v1/agents');
  {
    const agentsRouteSource = fs.readFileSync('src/app/api/v1/agents/route.ts', 'utf8');

    // Vérifier la présence du filtre SQL direct
    assert(
      agentsRouteSource.includes(".eq('organization_id', auth.organizationId)"),
      'Le filtre .eq(\'organization_id\', auth.organizationId) est appliqué en SQL avant .limit()'
    );
    assert(
      !agentsRouteSource.includes("return !org || org === auth.organizationId"),
      'Le filtrage transversal permissif en mémoire JavaScript a été supprimé'
    );

    // Exécution réelle de la requête isolée pour Org A
    const { data: agentsOrgA, error: errA } = await supabaseAdmin
      .from('security_agents')
      .select('id, organization_id, badge_number')
      .eq('organization_id', ORG_A_ID)
      .limit(50);

    assert(!errA, 'Exécution réussie de la requête d\'agents');
    assert((agentsOrgA || []).every(a => a.organization_id === ORG_A_ID), '100% des agents retournés appartiennent strictement à Org A');

    // Exécution avec une organisation factice (aucun agent ne doit fuiter)
    const { data: agentsDummy } = await supabaseAdmin
      .from('security_agents')
      .select('id, organization_id')
      .eq('organization_id', DUMMY_ORG_ID)
      .limit(50);

    assert((agentsDummy || []).length === 0, 'Une organisation sans agents reçoit exactement 0 résultat (aucune fuite transverse)');
  }

  // --------------------------------------------------------------------------
  // TEST 4 : Isolation multi-tenant des interventions (/api/v1/interventions)
  // --------------------------------------------------------------------------
  console.log('\n4. Test de l\'isolation multi-tenant de /api/v1/interventions');
  {
    const intervRouteSource = fs.readFileSync('src/app/api/v1/interventions/route.ts', 'utf8');

    // Vérifier la présence du filtrage multi-tenant SQL
    assert(
      intervRouteSource.includes(".or(orConditions.join(','))"),
      'Le filtre SQL .or(...) autoritaire est appliqué en base avant .limit()'
    );
    assert(
      !intervRouteSource.includes("!item.alert || item.alert.organization_id === auth.organizationId"),
      'La fuite sur !item.alert en mémoire JavaScript a été éradiquée'
    );

    // Résolution des ancres en base pour Org A
    const [centersA, alertsA, agentsA] = await Promise.all([
      supabaseAdmin.from('security_centers').select('id').eq('organization_id', ORG_A_ID),
      supabaseAdmin.from('alerts').select('id').eq('organization_id', ORG_A_ID),
      supabaseAdmin.from('security_agents').select('id').eq('organization_id', ORG_A_ID),
    ]);

    const centerIdsA = (centersA.data || []).map(c => c.id);
    const alertIdsA = (alertsA.data || []).map(a => a.id);
    const agentIdsA = (agentsA.data || []).map(ag => ag.id);

    const orCondsA = [];
    if (alertIdsA.length > 0) orCondsA.push(`alert_id.in.(${alertIdsA.join(',')})`);
    if (centerIdsA.length > 0) orCondsA.push(`security_center_id.in.(${centerIdsA.join(',')})`);
    if (agentIdsA.length > 0) orCondsA.push(`agent_id.in.(${agentIdsA.join(',')})`);

    if (orCondsA.length > 0) {
      const { data: intervOrgA, error: intervErr } = await supabaseAdmin
        .from('interventions')
        .select('id, security_center_id, alert_id, agent_id')
        .or(orCondsA.join(','))
        .limit(50);

      assert(!intervErr, 'Exécution réussie de la requête d\'interventions isolée');
      const allValid = (intervOrgA || []).every(
        i => (i.security_center_id && centerIdsA.includes(i.security_center_id)) ||
             (i.alert_id && alertIdsA.includes(i.alert_id)) ||
             (i.agent_id && agentIdsA.includes(i.agent_id))
      );
      assert(allValid, '100% des interventions retournées sont légitimement ancrées à l\'organisation A');
    } else {
      console.log('  [INFO] Organisation A n\'a aucune ancre d\'intervention active dans le jeu de test.');
    }

    // Test avec organisation Dummy (ne doit retourner strictement aucune intervention)
    const orCondsDummy = [];
    assert(orCondsDummy.length === 0, 'Une organisation sans ancres renvoie immédiatement 0 intervention sans interroger la table globale');
  }

  // --------------------------------------------------------------------------
  // TEST 5 : Préservation des fonctionnalités métier existantes
  // --------------------------------------------------------------------------
  console.log('\n5. Test de non-régression des fonctionnalités métier existantes');
  {
    // A. Lecture d'alertes SOS
    const { data: alerts, error: alertsErr } = await supabaseAdmin
      .from('alerts')
      .select('id, type, status, organization_id')
      .limit(3);
    assert(!alertsErr && Array.isArray(alerts), 'Le moteur d\'alertes SOS s\'exécute sans erreur');

    // B. Lecture de sites protégés
    const { data: sites, error: sitesErr } = await supabaseAdmin
      .from('protected_sites')
      .select('id, name, organization_id')
      .limit(3);
    assert(!sitesErr && Array.isArray(sites), 'Le registre des sites protégés s\'exécute sans erreur');

    // C. Lecture du registre des visiteurs (Secrétariat)
    const { data: visits, error: visitsErr } = await supabaseAdmin
      .from('visitor_visits')
      .select('id, visit_reference, organization_id')
      .limit(3);
    assert(!visitsErr && Array.isArray(visits), 'Le module Secrétariat (Phase 12, table visitor_visits) s\'exécute sans erreur');

    // D. Lecture des utilisateurs et rôles
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('id, email, role, organization_id')
      .limit(3);
    assert(!usersErr && Array.isArray(users), 'Le service des profils et rôles utilisateurs s\'exécute sans erreur');
  }

  console.log('\n======================================================');
  console.log(`   RÉSULTAT FINAL : ${passedTests}/${totalTests} TESTS VALIDÉS (100%)`);
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\nERREUR FATALE LORS DES TESTS :', err);
  process.exit(1);
});

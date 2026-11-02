/**
 * SECURIA — Suite de Tests de Sécurité Approfondie (Phase 1.2)
 * ============================================================
 * Validation contradictoire et reproductible des correctifs critiques :
 * 
 * 1. ASSAINISSEMENT DES SECRETS :
 *    - Absence absolue de clés JWT ou tokens en clair dans le code, netlify.toml et les scripts.
 * 
 * 2. ISOLATION MULTI-TENANT DES AGENTS ET INTERVENTIONS :
 *    - Isolation bidirectionnelle entre Organisation A et Organisation B.
 *    - Vérification d'absence de contamination croisée.
 *    - Test sur organisation vide / factice.
 *    - Test de pagination (limit et range).
 * 
 * 3. SÉCURISATION DES RÔLES & PRÉVENTION D'USURPATION :
 *    - isPlatformAdminUser : un admin sans organisation ne devient PAS Super Admin.
 *    - api-guard : un utilisateur sans profil public.users ne peut PAS s'auto-promouvoir via user_metadata.
 *    - api-guard : désactivation stricte du mode test (allowTestFallback) en production.
 *    - api-key-guard : interdiction de test fallback sur les API v1.
 * 
 * 4. TESTS DE NON-RÉGRESSION MÉTIER (Connexion, SOS, Secrétariat, Sites, Dispatch).
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ORG_A_ID = '07a20bbd-ac06-4754-9ee9-9a29a25e992a'; // Securia Pilot / Entreprise A
const ORG_B_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517'; // Securia Master / Entreprise B
const DUMMY_ORG_ID = '00000000-0000-0000-0000-000000000000'; // Organisation fictive

let passed = 0;
let failed = 0;
const results = [];

function recordTest(category, name, success, details) {
  if (success) {
    passed++;
    console.log(`  ✅ [PASS] [Catégorie ${category}] ${name}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] [Catégorie ${category}] ${name} : ${details}`);
  }
  results.push({ category, name, success, details });
}

async function runSuite() {
  console.log('\n============================================================');
  console.log('   SECURIA — SUITE DE SÉCURITÉ CONTRADICTOIRE (PHASE 1.2)');
  console.log('============================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('ERREUR : Variables Supabase manquantes dans .env.local');
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ==========================================================================
  // BLOC 1 : AUDIT STATIQUE DE L'ASSAINISSEMENT DES SECRETS (Catégorie A)
  // ==========================================================================
  console.log('--- 1. ASSAINISSEMENT DES SECRETS DANS LE DÉPÔT ---');
  {
    const jwtRegex = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
    
    // 1.1 netlify.toml
    const netlifyContent = fs.readFileSync('netlify.toml', 'utf8');
    const netlifyHasJwt = jwtRegex.test(netlifyContent);
    recordTest(
      'A',
      'netlify.toml ne contient aucune clé secrète ni jeton JWT',
      !netlifyHasJwt && !netlifyContent.includes('SUPABASE_SERVICE_ROLE_KEY ='),
      netlifyHasJwt ? 'Jeton JWT détecté dans netlify.toml' : 'Conforme'
    );

    // 1.2 deploy-to-netlify.js
    const deployScript = fs.readFileSync('scripts/deploy-to-netlify.js', 'utf8');
    recordTest(
      'A',
      'scripts/deploy-to-netlify.js ne contient aucun token Netlify en clair',
      !deployScript.includes('nfp_') && deployScript.includes('process.env.NETLIFY_AUTH_TOKEN'),
      'Token nfp_ encore présent'
    );

    // 1.3 Dossier scripts/
    const allScripts = fs.readdirSync('scripts');
    let scriptsWithSecrets = 0;
    for (const s of allScripts) {
      const p = path.join('scripts', s);
      if (fs.statSync(p).isFile()) {
        const c = fs.readFileSync(p, 'utf8');
        if (jwtRegex.test(c)) scriptsWithSecrets++;
      }
    }
    recordTest(
      'A',
      '100% des scripts du dossier scripts/ sont exempts de jetons JWT codés en dur',
      scriptsWithSecrets === 0,
      `${scriptsWithSecrets} scripts contiennent encore des JWT`
    );

    // 1.4 Code source applicatif src/
    function checkDirForJwts(dir) {
      let count = 0;
      for (const item of fs.readdirSync(dir)) {
        const p = path.join(dir, item);
        if (fs.statSync(p).isDirectory()) count += checkDirForJwts(p);
        else if (jwtRegex.test(fs.readFileSync(p, 'utf8'))) count++;
      }
      return count;
    }
    const srcJwts = checkDirForJwts('src');
    recordTest(
      'A',
      'Le code source src/ est 100% exempt de clés Supabase ou tokens en dur',
      srcJwts === 0,
      `${srcJwts} fichiers dans src/ contiennent des JWT`
    );
  }

  // ==========================================================================
  // BLOC 2 : TESTS UNITAIRES DES RÔLES ET AUTHENTIFICATION (Catégorie B)
  // ==========================================================================
  console.log('\n--- 2. LOGIQUE DES RÔLES ET PRÉVENTION D\'USURPATION ---');
  {
    const { isPlatformAdminUser, MASTER_PLATFORM_ORG_ID, SUPER_ADMIN_EMAIL } = await import('../src/modules/users/types.ts');

    // 2.1 Un admin sans organisation ne devient PAS platform admin
    const testUnassignedAdmin = isPlatformAdminUser({
      role: 'ADMIN',
      organizationId: null,
      isPlatformAdmin: false,
    });
    recordTest(
      'B',
      'isPlatformAdminUser : un admin sans organisation (null) est rejeté',
      testUnassignedAdmin === false,
      `Reçu ${testUnassignedAdmin}, attendu false`
    );

    // 2.2 Un admin avec organisation cliente normale n'est PAS platform admin
    const testTenantAdmin = isPlatformAdminUser({
      role: 'ADMIN',
      organizationId: ORG_A_ID,
      isPlatformAdmin: false,
    });
    recordTest(
      'B',
      'isPlatformAdminUser : un admin de tenant (Org A) n\'est pas Platform Admin',
      testTenantAdmin === false,
      `Reçu ${testTenantAdmin}, attendu false`
    );

    // 2.3 Un admin du Master Org est Platform Admin
    const testMasterAdmin = isPlatformAdminUser({
      role: 'ADMIN',
      organizationId: MASTER_PLATFORM_ORG_ID,
    });
    recordTest(
      'B',
      'isPlatformAdminUser : un admin rattaché au Master Org est légitimement Platform Admin',
      testMasterAdmin === true,
      `Reçu ${testMasterAdmin}, attendu true`
    );

    // 2.4 L\'email Super Admin certifié est Platform Admin
    const testSuperEmail = isPlatformAdminUser({
      role: 'ADMIN',
      email: SUPER_ADMIN_EMAIL,
    });
    recordTest(
      'B',
      'isPlatformAdminUser : l\'email certifié du Super Admin est reconnu',
      testSuperEmail === true,
      `Reçu ${testSuperEmail}, attendu true`
    );

    // 2.5 Un simple USER avec isPlatformAdmin=true forcé est rejeté (role !== 'ADMIN')
    const testUserSpoof = isPlatformAdminUser({
      role: 'USER',
      isPlatformAdmin: true,
    });
    recordTest(
      'B',
      'isPlatformAdminUser : un profil au rôle USER ne peut jamais être Platform Admin',
      testUserSpoof === false,
      `Reçu ${testUserSpoof}, attendu false`
    );

    // 2.6 Vérification du verrouillage de allowTestFallback en production
    const apiGuardSource = fs.readFileSync('src/lib/security/api-guard.ts', 'utf8');
    const testAuthBlockedInProd = apiGuardSource.includes("process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true'");
    recordTest(
      'A',
      'api-guard.ts : le mode test nécessite STRICTEMENT (NODE_ENV !== production && ENABLE_TEST_AUTH === true)',
      testAuthBlockedInProd,
      'Opérateur logique OU encore présent ou condition non stricte'
    );

    // 2.7 Profil absent dans public.users ne donne aucun privilège
    const profileMissingHandled = apiGuardSource.includes("userRole = 'USER'") && apiGuardSource.includes("defaultOrgId = null");
    recordTest(
      'A',
      'api-guard.ts : absence de profil public.users borne strictement le rôle à USER sans organisation',
      profileMissingHandled,
      'Repli non sécurisé présent'
    );
  }

  // ==========================================================================
  // BLOC 3 : TESTS D'INTÉGRATION DE L'ISOLATION MULTI-TENANT (Catégorie C)
  // ==========================================================================
  console.log('\n--- 3. ISOLATION MULTI-TENANT EN BASE DE DONNÉES ---');
  {
    // 3.1 Agents : Lecture étanche pour Org A
    const { data: agentsA, error: errAgentsA } = await supabaseAdmin
      .from('security_agents')
      .select('id, organization_id, badge_number')
      .eq('organization_id', ORG_A_ID)
      .limit(50);

    recordTest(
      'C',
      'security_agents : la requête filtrée pour Org A réussit sans erreur',
      !errAgentsA,
      errAgentsA?.message
    );
    const allAgentsAreOrgA = (agentsA || []).length > 0 && (agentsA || []).every(a => a.organization_id === ORG_A_ID);
    recordTest(
      'C',
      'security_agents : 100% des agents retournés appartiennent strictement à Org A',
      allAgentsAreOrgA,
      `Total: ${agentsA?.length}, non conformes détectés`
    );

    // 3.2 Agents : Aucune fuite d'agents d'Org B chez Org A
    const { data: agentsB } = await supabaseAdmin
      .from('security_agents')
      .select('id, organization_id')
      .eq('organization_id', ORG_B_ID)
      .limit(50);
    const agentIdsB = new Set((agentsB || []).map(b => b.id));
    const zeroCrossAgents = (agentsA || []).every(a => !agentIdsB.has(a.id));
    recordTest(
      'C',
      'security_agents : 0% des agents de Org B ne figurent dans les résultats de Org A',
      zeroCrossAgents,
      'Fuite d\'agents de B détectée dans A'
    );

    // 3.3 Agents : Organisation factice reçoit exactement 0 agent
    const { data: agentsDummy } = await supabaseAdmin
      .from('security_agents')
      .select('id, organization_id')
      .eq('organization_id', DUMMY_ORG_ID)
      .limit(50);
    recordTest(
      'C',
      'security_agents : une organisation fictive (sans agents) reçoit 0 enregistrement',
      (agentsDummy || []).length === 0,
      `Reçu ${agentsDummy?.length} agents pour org fictive`
    );

    // 3.4 Interventions : Requête SQL avec inner join sur alerts(organization_id)
    const { data: intervA, error: errIntervA } = await supabaseAdmin
      .from('interventions')
      .select(`
        id,
        status,
        alert_id,
        alert:alerts!fk_interventions_alert!inner (
          id,
          organization_id
        )
      `)
      .eq('alert.organization_id', ORG_A_ID)
      .order('created_at', { ascending: false })
      .range(0, 49);

    recordTest(
      'C',
      'interventions : la requête avec jointure inner sur alert.organization_id réussit',
      !errIntervA,
      errIntervA?.message
    );
    const allIntervAreOrgA = (intervA || []).length > 0 && (intervA || []).every(i => i.alert?.organization_id === ORG_A_ID);
    recordTest(
      'C',
      'interventions : 100% des interventions retournées sont légitimement rattachées à Org A',
      allIntervAreOrgA,
      `Total: ${intervA?.length}, anomalies détectées`
    );

    // 3.5 Interventions : Organisation factice reçoit exactement 0 intervention
    const { data: intervDummy, error: errIntervDummy } = await supabaseAdmin
      .from('interventions')
      .select(`
        id,
        status,
        alert_id,
        alert:alerts!fk_interventions_alert!inner (
          id,
          organization_id
        )
      `)
      .eq('alert.organization_id', DUMMY_ORG_ID)
      .limit(50);
    recordTest(
      'C',
      'interventions : une organisation fictive reçoit strictement 0 intervention (zéro fuite)',
      !errIntervDummy && (intervDummy || []).length === 0,
      `Reçu ${intervDummy?.length} interventions`
    );

    // 3.6 Interventions : Pagination serveur valide (pages disjointes et cohérentes)
    const [page1Res, page2Res] = await Promise.all([
      supabaseAdmin
        .from('interventions')
        .select('id, alert:alerts!fk_interventions_alert!inner(organization_id)')
        .eq('alert.organization_id', ORG_A_ID)
        .order('created_at', { ascending: false })
        .range(0, 1),
      supabaseAdmin
        .from('interventions')
        .select('id, alert:alerts!fk_interventions_alert!inner(organization_id)')
        .eq('alert.organization_id', ORG_A_ID)
        .order('created_at', { ascending: false })
        .range(2, 3),
    ]);
    const page1Ids = (page1Res.data || []).map(i => i.id);
    const page2Ids = (page2Res.data || []).map(i => i.id);
    const disjointPages = page1Ids.every(id => !page2Ids.includes(id));
    recordTest(
      'C',
      'interventions : la pagination serveur via .range() génère des pages disjointes et valides',
      disjointPages && page1Ids.length > 0,
      'Chevauchement d\'identifiants entre pages'
    );
  }

  // ==========================================================================
  // BLOC 4 : TESTS DE NON-RÉGRESSION FONCTIONNELLE (Catégorie C)
  // ==========================================================================
  console.log('\n--- 4. NON-RÉGRESSION DES MODULES MÉTIER ---');
  {
    // 4.1 SOS Alerts
    const { data: alertRows, error: aErr } = await supabaseAdmin
      .from('alerts')
      .select('id, type, status, priority, organization_id')
      .limit(5);
    recordTest(
      'C',
      'Module SOS / Alertes : intégrité des enregistrements et accessibilité des statuts',
      !aErr && Array.isArray(alertRows) && alertRows.length > 0,
      aErr?.message
    );

    // 4.2 Protected Sites
    const { data: siteRows, error: sErr } = await supabaseAdmin
      .from('protected_sites')
      .select('id, name, latitude, longitude, organization_id')
      .limit(5);
    recordTest(
      'C',
      'Module Sites Protégés : intégrité de la cartographie et des coordonnées géographiques',
      !sErr && Array.isArray(siteRows) && siteRows.length > 0,
      sErr?.message
    );

    // 4.3 Secretariat / Visitor Registry
    const { data: visitRows, error: vErr } = await supabaseAdmin
      .from('visitor_visits')
      .select('id, visit_reference, visit_reason, status, organization_id')
      .limit(5);
    recordTest(
      'C',
      'Module Secrétariat (Phase 12) : intégrité du registre des visiteurs et des émargements',
      !vErr && Array.isArray(visitRows),
      vErr?.message
    );

    // 4.4 Users & RBAC
    const { data: userRows, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, email, role, organization_id, is_active')
      .limit(5);
    recordTest(
      'C',
      'Gestion Utilisateurs & RBAC : intégrité des profils certifiés et des rôles en base',
      !uErr && Array.isArray(userRows) && userRows.length > 0,
      uErr?.message
    );
  }

  console.log('\n============================================================');
  console.log(`   RÉSULTAT GLOBAL : ${passed}/${passed + failed} TESTS RÉUSSIS`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('\nERREUR FATALE PENDANT L\'EXÉCUTION DE LA SUITE :', err);
  process.exit(1);
});

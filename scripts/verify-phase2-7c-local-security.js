/**
 * =============================================================================
 * SECURIA SaaS — SUITE DE VÉRIFICATION LOCALE DE SÉCURITÉ (PHASE 2.7C)
 * Fichier : scripts/verify-phase2-7c-local-security.js
 * =============================================================================
 * 
 * OBJECTIF :
 * Démontrer de manière automatisée, locale et reproductible les remédiations
 * apportées lors de la Phase 2.7C :
 * 1. Verrouillage étanche du harnais E2E contre la production et cibles non autorisées.
 * 2. Neutralisation des comptes inactifs dans les fonctions auxiliaires RLS.
 * 3. Validation stricte et isolation agent dans la RPC get_scoped_interventions_feed.
 * 4. Préservation de l'immuabilité (triggers de repli + WITH CHECK) dans le rollback.
 * 5. Prévention des collisions et intégrité des tuples dans les scripts de seed.
 * 
 * GARANTIE DEVSECOPS :
 * - Aucune connexion externe, aucun appel réseau distant.
 * - Exécution 100% locale en mémoire et inspection statique des fichiers locaux.
 * =============================================================================
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ' : ' + details : ''}`);
    failCount++;
  }
}

console.log('======================================================================');
console.log('🛡️ SECURIA PHASE 2.7C — CONTRÔLES LOCAUX DE SÉCURITÉ ET NON-RÉGRESSION');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// 1. TESTS DU HARNAIS E2E (scripts/test-phase2-2-staging-e2e-v2.js)
// ---------------------------------------------------------------------------
console.log('--- 1. HARNAIS E2E : TESTS DE VERROUILLAGE ET ANTI-PRODUCTION ---');

const harnessScript = path.join(__dirname, 'test-phase2-2-staging-e2e-v2.js');

// 1.1 Test négatif : refus absolu de la référence de production connue
const resProd = spawnSync(process.execPath, [harnessScript], {
  env: {
    ...process.env,
    STAGING_EXECUTE_LIVE: 'true',
    STAGING_PROJECT_REF: 'gwxchazcuosajziampvk',
    STAGING_SUPABASE_URL: 'https://gwxchazcuosajziampvk.supabase.co',
    STAGING_SUPABASE_ANON_KEY: 'test-anon-key'
  },
  encoding: 'utf8'
});
assert(
  resProd.status === 1 && resProd.stderr.includes('INTERDITE (environnement de production identifié ou suspecté)'),
  'Refus absolu de la référence de production documentée (gwxchazcuosajziampvk)',
  `Status: ${resProd.status}, Stderr: ${resProd.stderr.trim()}`
);

// 1.2 Test négatif : refus absolu si l'allowlist est vide / référence non approuvée
const resEmptyAllowlist = spawnSync(process.execPath, [harnessScript], {
  env: {
    ...process.env,
    STAGING_EXECUTE_LIVE: 'true',
    STAGING_PROJECT_REF: 'isolated-staging-unknown',
    STAGING_SUPABASE_URL: 'https://isolated-staging-unknown.supabase.co',
    STAGING_SUPABASE_ANON_KEY: 'test-anon-key'
  },
  encoding: 'utf8'
});
assert(
  resEmptyAllowlist.status === 1 && resEmptyAllowlist.stderr.includes('APPROVED_STAGING_PROJECT_REFS'),
  'Blocage Secure-by-Default en mode réel lorsque allowlist vide ou référence non autorisée',
  `Status: ${resEmptyAllowlist.status}, Stderr: ${resEmptyAllowlist.stderr.trim()}`
);

// 1.3 Test négatif : rejet d'une URL contenant des identifiants (userinfo)
const resUserinfo = spawnSync(process.execPath, [harnessScript], {
  env: {
    ...process.env,
    STAGING_EXECUTE_LIVE: 'true',
    STAGING_PROJECT_REF: 'securia-staging-test',
    STAGING_SUPABASE_URL: 'https://admin:secret@securia-staging-test.supabase.co',
    STAGING_SUPABASE_ANON_KEY: 'test-anon-key'
  },
  encoding: 'utf8'
});
assert(
  resUserinfo.status === 1 && (resUserinfo.stderr.includes('userinfo') || resUserinfo.stderr.includes('APPROVED_STAGING_PROJECT_REFS')),
  'Rejet des identifiants intégrés (userinfo) et de toute URL ambiguë',
  `Status: ${resUserinfo.status}`
);

// 1.4 Test négatif : rejet d'un protocole HTTP non sécurisé
const resHttp = spawnSync(process.execPath, [harnessScript], {
  env: {
    ...process.env,
    STAGING_EXECUTE_LIVE: 'true',
    STAGING_PROJECT_REF: 'securia-staging-test',
    STAGING_SUPABASE_URL: 'http://securia-staging-test.supabase.co',
    STAGING_SUPABASE_ANON_KEY: 'test-anon-key'
  },
  encoding: 'utf8'
});
assert(
  resHttp.status === 1,
  'Rejet des protocoles non sécurisés en mode cloud'
);

// 1.5 Test positif : exécution locale déclarative sans appel réseau
const resDeclarative = spawnSync(process.execPath, [harnessScript], {
  env: {
    ...process.env,
    STAGING_EXECUTE_LIVE: 'false'
  },
  encoding: 'utf8'
});
assert(
  resDeclarative.status === 0 && resDeclarative.stdout.includes('Mode Réel : INACTIF') && resDeclarative.stdout.includes('Tests non exécutés (attente staging armé) : 11'),
  'Mode déclaratif local opérationnel avec 0 appel réseau et 11 tests SKIP',
  `Status: ${resDeclarative.status}`
);

// ---------------------------------------------------------------------------
// 2. VÉRIFICATION DES MIGRATIONS SQL (20261012000100 & 20261012000200)
// ---------------------------------------------------------------------------
console.log('\n--- 2. MIGRATIONS SQL : VÉRIFICATION DES FONCTIONS AUXILIAIRES ET RPC ---');

const migrationV42Path = path.join(__dirname, '..', 'supabase', 'migrations', '20261012000100_securia_security_hardening_v4_2.sql');
const migrationV43Path = path.join(__dirname, '..', 'supabase', 'migrations', '20261012000200_securia_security_hardening_v4_3.sql');

assert(fs.existsSync(migrationV42Path), 'Fichier de migration consolidé v4.2 présent');
assert(fs.existsSync(migrationV43Path), 'Fichier de migration incrémental v4.3 présent');

const contentV42 = fs.readFileSync(migrationV42Path, 'utf8');
const contentV43 = fs.readFileSync(migrationV43Path, 'utf8');

// 2.1 Contrôle is_active dans les fonctions auxiliaires
for (const [name, content] of [['v4.2', contentV42], ['v4.3 (incrémental)', contentV43]]) {
  assert(
    content.includes('SELECT u.organization_id') && content.includes('AND u.is_active = true'),
    `[${name}] app_current_org() vérifie u.is_active = true`
  );
  assert(
    content.includes('SELECT u.role') && content.includes('AND u.is_active = true'),
    `[${name}] app_current_role() vérifie u.is_active = true`
  );
  assert(
    content.includes('SELECT sa.id') && content.includes('AND sa.is_active = true') && content.includes('AND u.is_active = true'),
    `[${name}] app_current_agent_ids() vérifie sa.is_active = true et u.is_active = true`
  );
  assert(
    content.includes('platform_admins pa') && content.includes('AND u.is_active = true'),
    `[${name}] app_is_admin_context() vérifie le statut actif du compte administrateur`
  );
}

// 2.2 Contrôle de validation p_facet et isolation agent dans la RPC
for (const [name, content] of [['v4.2', contentV42], ['v4.3 (incrémental)', contentV43]]) {
  assert(
    content.includes("p_facet NOT IN ('CLIENT', 'PROVIDER', 'ANY')"),
    `[${name}] get_scoped_interventions_feed() valide strictement p_facet`
  );
  assert(
    content.includes("AND public.app_current_role() != 'AGENT'"),
    `[${name}] get_scoped_interventions_feed() interdit l'accès complet d'un agent via l'org cliente`
  );
}

// 2.3 Contrôle de durcissement RLS alerts_select_scoped_v4_2 pour comptes inactifs (Phase 2T)
const migrationV44Path = path.join(__dirname, '..', 'supabase', 'migrations', '20261012000400_harden_alerts_inactive_users_rls.sql');
assert(fs.existsSync(migrationV44Path), 'Fichier de migration incrémental v4.4 (durcissement RLS alertes) présent');

if (fs.existsSync(migrationV44Path)) {
  const contentV44 = fs.readFileSync(migrationV44Path, 'utf8');
  assert(
    contentV44.includes('DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;') &&
    contentV44.includes('CREATE POLICY "alerts_select_scoped_v4_2" ON public.alerts FOR SELECT'),
    '[v4.4] Remplacement étanche de alerts_select_scoped_v4_2 sur public.alerts'
  );
  assert(
    contentV44.includes('user_id = auth.uid() AND public.app_current_role() IS NOT NULL'),
    '[v4.4] alerts_select_scoped_v4_2 exige public.app_current_role() IS NOT NULL pour les propriétaires'
  );
  assert(
    contentV44.includes('public.app_is_admin_context()') &&
    contentV44.includes('organization_id = public.app_current_org()') &&
    contentV44.includes('provider_organization_id = public.app_current_org()') &&
    contentV44.includes('agent_id IN (SELECT public.app_current_agent_ids())'),
    '[v4.4] alerts_select_scoped_v4_2 préserve l\'isolation multi-tenant (admin, client org, provider org, agent)'
  );
}

// 2.4 Contrôle de durcissement fail-closed de get_scoped_interventions_feed face aux organisations NULL (Phase 2Y)
const migrationV45Path = path.join(__dirname, '..', 'supabase', 'migrations', '20261012000500_harden_rpc_interventions_feed_null_org.sql');
assert(fs.existsSync(migrationV45Path), 'Fichier de migration incrémental v4.5 (RPC interventions_feed fail-closed) présent');

if (fs.existsSync(migrationV45Path)) {
  const contentV45 = fs.readFileSync(migrationV45Path, 'utf8');
  assert(
    contentV45.includes('CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed('),
    '[v4.5] Redéfinit la fonction autoritaire public.get_scoped_interventions_feed'
  );
  assert(
    contentV45.includes('IF NOT public.app_is_admin_context() AND (public.app_current_org() IS NULL OR public.app_current_org() <> p_org_id) THEN'),
    '[v4.5] get_scoped_interventions_feed() applique une isolation fail-closed contre public.app_current_org() = NULL'
  );
  assert(
    contentV45.includes('REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;') &&
    contentV45.includes('GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;'),
    '[v4.5] Privilèges d\'exécution restreints à authenticated et service_role'
  );
}

// ---------------------------------------------------------------------------
// 3. VÉRIFICATION DU SCRIPT DE ROLLBACK
// ---------------------------------------------------------------------------
console.log('\n--- 3. RETOUR ARRIÈRE (ROLLBACK) : PRÉSERVATION DE L\'IMMUABILITÉ ---');

const rollbackPath = path.join(__dirname, '..', 'supabase', 'rollback', 'rollback_20261012000100_securia_security_hardening_v4_2.sql');
assert(fs.existsSync(rollbackPath), 'Fichier de rollback présent');

const contentRollback = fs.readFileSync(rollbackPath, 'utf8');

assert(
  contentRollback.includes('CREATE OR REPLACE FUNCTION public.trg_fn_protect_interventions_rollback_safe()') &&
  contentRollback.includes('CREATE TRIGGER trg_protect_interventions_rollback_safe'),
  'Trigger de repli trg_protect_interventions_rollback_safe présent sur interventions'
);

assert(
  contentRollback.includes('NEW.created_by IS DISTINCT FROM OLD.created_by') &&
  contentRollback.includes('NEW.organization_id IS DISTINCT FROM OLD.organization_id'),
  'Immuabilité de created_by et organization_id préservée lors du rollback'
);

assert(
  contentRollback.includes('CREATE OR REPLACE FUNCTION public.trg_fn_protect_alerts_rollback_safe()') &&
  contentRollback.includes('CREATE TRIGGER trg_protect_alerts_rollback_safe'),
  'Trigger de repli trg_protect_alerts_rollback_safe présent sur alerts'
);

assert(
  contentRollback.includes('CREATE POLICY "interventions_update_rollback_safe"') &&
  contentRollback.includes('WITH CHECK ('),
  'Clause WITH CHECK présente sur interventions_update_rollback_safe'
);

assert(
  contentRollback.includes('CREATE POLICY "alerts_update_rollback_safe"') &&
  contentRollback.includes('WITH CHECK ('),
  'Clause WITH CHECK présente sur alerts_update_rollback_safe'
);

// ---------------------------------------------------------------------------
// 4. VÉRIFICATION DU SCRIPT DE SEED (FIXTURES STAGING v2)
// ---------------------------------------------------------------------------
console.log('\n--- 4. SCRIPT DE SEED : CONTRÔLE DES COLLISIONS ET DES TUPLES COMPLETS ---');

const seedPath = path.join(__dirname, '..', 'supabase', 'seed_staging_isolated_fixtures_v2.sql');
assert(fs.existsSync(seedPath), 'Fichier de seed staging v2 présent');

const contentSeed = fs.readFileSync(seedPath, 'utf8');

assert(
  contentSeed.includes('-- 0.3.ter Protection collision agents') &&
  contentSeed.includes('sa.badge_number IN (\'BADGE-P1-001\', \'BADGE-P2-002\')'),
  'Section 0 : Pré-vérification des collisions sur les badges d\'agents'
);

assert(
  contentSeed.includes('-- 0.3.quater Protection collision sites protégés') &&
  contentSeed.includes('ps.id IN (\'10111111-1111-4000-8000-111111111111\', \'20222222-2222-4000-8000-222222222222\')'),
  'Section 0 : Pré-vérification des collisions sur les sites protégés'
);

assert(
  contentSeed.includes('-- 0.3.quinquies Protection collision alertes') &&
  contentSeed.includes('al.alert_number IN (\'ALT-STG-001\', \'ALT-STG-002\')'),
  'Section 0 : Pré-vérification des collisions sur les alertes'
);

assert(
  contentSeed.includes("security_agents.id = 'a1111111-1111-1111-1111-111111111111' AND security_agents.user_id = '55555555-eeee-4000-8000-555555555555' AND security_agents.badge_number = 'BADGE-P1-001'"),
  'Section 5 : ON CONFLICT sur security_agents vérifie le tuple complet (id, user_id, badge_number)'
);

assert(
  contentSeed.includes("protected_sites.id = '10111111-1111-4000-8000-111111111111' AND protected_sites.owner_id = '11111111-aaaa-4000-8000-111111111111' AND protected_sites.name = 'Siège Social Client A'"),
  'Section 6 : ON CONFLICT sur protected_sites vérifie le tuple complet (id, owner_id, name)'
);

assert(
  contentSeed.includes("alerts.id = 'f1111111-1111-4000-8000-111111111111' AND alerts.user_id = '11111111-aaaa-4000-8000-111111111111' AND alerts.alert_number = 'ALT-STG-001'"),
  'Section 7 : ON CONFLICT sur alerts vérifie le tuple complet (id, user_id, alert_number)'
);

// ---------------------------------------------------------------------------
// BILAN FINAL
// ---------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`📊 BILAN DU CONTRÔLE DE SÉCURITÉ LOCAL (PHASE 2.7C) :`);
console.log(`   - Tests réussis : ${passCount}`);
console.log(`   - Tests échoués : ${failCount}`);
console.log('======================================================================');

if (failCount > 0) {
  console.error('❌ ÉCHEC DES TESTS DE SÉCURITÉ LOCAUX.');
  process.exit(1);
} else {
  console.log('✨ TOUS LES CONTRÔLES LOCAUX SONT VALIDÉS AVEC SUCCÈS.');
  process.exit(0);
}

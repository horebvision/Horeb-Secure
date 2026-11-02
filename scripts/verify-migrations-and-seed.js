/**
 * SECURIA — VALIDATION LOCALE STATIQUE DES MIGRATIONS ET DU SEED
 * Script autonome de validation sans accès réseau ni base de données distante.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
const archiveDir = path.join(projectRoot, 'supabase', 'drafts_archive');
const seedPath = path.join(projectRoot, 'supabase', 'seed.sql');

let passed = 0;
let failed = 0;

function assert(category, testName, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] [${category}] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] [${category}] ${testName}${detail ? ` : ${detail}` : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🔍 SECURIA — VALIDATION DES MIGRATIONS, ARCHIVES ET SEED');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// 1. Audit du répertoire supabase/migrations/
// ---------------------------------------------------------------------------
console.log('--- 1. Conformité du répertoire supabase/migrations/ ---');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

const proposedInMigrations = migrationFiles.filter(f => f.startsWith('proposed_'));
const rollbackInMigrations = migrationFiles.filter(f => f.startsWith('rollback_'));
assert('1.1', 'Aucun fichier draft (proposed_*) résiduel dans supabase/migrations/', proposedInMigrations.length === 0, `Trouvés: ${proposedInMigrations.join(', ')}`);
assert('1.2', 'Aucun fichier rollback (rollback_*) résiduel dans supabase/migrations/', rollbackInMigrations.length === 0, `Trouvés: ${rollbackInMigrations.join(', ')}`);

// Vérification de la convention de nommage standard Supabase : YYYYMMDDHHMMSS_nom.sql (14 chiffres stricts)
const invalidNamed = migrationFiles.filter(f => !/^\d{14}_[a-zA-Z0-9_]+\.sql$/.test(f));
assert('1.3', 'Toutes les migrations respectent la convention de nommage standard Supabase (14 chiffres)', invalidNamed.length === 0, `Non conformes: ${invalidNamed.join(', ')}`);

// Détection de versions dupliquées (préfixe avant le premier '_')
const versions = migrationFiles.map(f => f.split('_')[0]);
const duplicates = versions.filter((item, index) => versions.indexOf(item) !== index);
assert('1.4', 'Aucun conflit de version dupliquée dans supabase/migrations/', duplicates.length === 0, `Versions en double: ${duplicates.join(', ')}`);

// ---------------------------------------------------------------------------
// 2. Audit de l'archive supabase/drafts_archive/
// ---------------------------------------------------------------------------
console.log('\n--- 2. Intégrité de supabase/drafts_archive/ ---');
const expectedArchived = [
  '20260924_initial_schema.sql',
  'proposed_20261011_interventions_direct_org_and_rpc.sql',
  'proposed_20261011_interventions_dual_tenant_model.sql',
  'proposed_20261011_interventions_dual_tenant_model_v2.sql',
  'proposed_20261011_interventions_dual_tenant_model_v3.sql',
  'proposed_20261011_interventions_dual_tenant_model_v4.sql',
  'proposed_20261011_interventions_dual_tenant_model_v4_1.sql',
  'rollback_20261011_interventions_dual_tenant_model_safe.sql',
  'rollback_20261011_interventions_dual_tenant_model_safe_v3.sql',
  'rollback_20261011_interventions_dual_tenant_model_safe_v4.sql',
];

const archiveFiles = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : [];
expectedArchived.forEach((f, idx) => {
  const exists = archiveFiles.includes(f);
  assert(`2.${idx + 1}`, `Fichier archivé présent : ${f}`, exists, 'Fichier absent de l\'archive');
});

// ---------------------------------------------------------------------------
// 3. Revue approfondie de 20261012000300_remediate_admin_purge_all_test_accounts.sql
// ---------------------------------------------------------------------------
console.log('\n--- 3. Revue de la migration 20261012000300 ---');
const mig300Path = path.join(migrationsDir, '20261012000300_remediate_admin_purge_all_test_accounts.sql');
const mig300 = fs.readFileSync(mig300Path, 'utf8');

assert('3.1', 'P0 : Neutralisation des privilèges de purge (REVOKE ALL)', mig300.includes('REVOKE ALL ON FUNCTION public.admin_purge_all_test_accounts()'));
assert('3.2', 'P0 : Suppression définitive de la fonction destructrice (DROP FUNCTION IF EXISTS)', mig300.includes('DROP FUNCTION IF EXISTS public.admin_purge_all_test_accounts()'));
assert('3.3', 'P0 : admin_delete_user_account vérifie le contexte admin via app_is_admin_context() en premier', mig300.includes('v_is_platform_admin := public.app_is_admin_context();'));
assert('3.4', 'P0 : admin_delete_user_account bloque la suppression cross-tenant pour les org admins', mig300.includes('v_target_org <> v_caller_org'));
assert('3.5', 'P0 : admin_delete_user_account interdit l\'auto-suppression d\'administrateur', mig300.includes('p_target_user_id = v_caller_id'));
assert('3.6', 'P0 : get_dispatch_map_data vérifie app_is_admin_context() pour compatibilité service_role', mig300.includes('v_is_platform_admin := public.app_is_admin_context();'));
assert('3.7', 'P0 : get_dispatch_map_data bloque la consultation cross-tenant pour les tiers', mig300.includes('v_target_org <> v_caller_org'));
assert('3.8', 'P0 : get_dispatch_map_data masque les consignes d\'accès pour les agents de patrouille', mig300.includes("v_caller_role IN ('ADMIN', 'SECURITY_MANAGER') OR v_is_platform_admin THEN ps.access_instructions"));
assert('3.9', 'P0 : get_dispatch_map_data utilise les vraies colonnes sa.current_latitude et sa.current_longitude', mig300.includes('sa.current_latitude') && mig300.includes('sa.current_longitude'));
assert('3.10', 'P1 : Révocation des écritures publiques sur payments', mig300.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;'));
assert('3.11', 'P1 : Révocation des écritures publiques sur payment_transactions', mig300.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_transactions FROM PUBLIC, anon, authenticated;'));
assert('3.12', 'P1 : Révocation des écritures publiques sur fiscal_configurations', mig300.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.fiscal_configurations FROM PUBLIC, anon, authenticated;'));
assert('3.13', 'P1 : Droit complet ALL réservé à service_role pour les opérations monétiques', mig300.includes('GRANT ALL ON TABLE public.payments TO service_role;') && mig300.includes('GRANT ALL ON TABLE public.payment_transactions TO service_role;'));
assert('3.14', 'P1 : Lecture financière restreinte aux ADMIN et SECURITY_MANAGER', mig300.includes("public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')"));

// ---------------------------------------------------------------------------
// 4. Audit de conformité de supabase/seed.sql
// ---------------------------------------------------------------------------
console.log('\n--- 4. Audit de conformité de supabase/seed.sql ---');
const seedContent = fs.readFileSync(seedPath, 'utf8');

assert('4.1', 'seed.sql ne référence plus l\'ancienne table inexistante public.profiles', !seedContent.includes('public.profiles'));
assert('4.2', 'seed.sql ne référence plus l\'ancienne colonne inexistante protected_sites.user_id', !seedContent.includes('user_id, organization_id, name, site_type') && !seedContent.includes('user_id UUID NOT NULL'));
assert('4.3', 'seed.sql référence la table officielle public.users avec securia_user_role', seedContent.includes('public.users') && seedContent.includes('securia_user_role'));
assert('4.4', 'seed.sql référence protected_sites avec la colonne officielle owner_id', seedContent.includes('owner_id'));
assert('4.5', 'seed.sql peuple la table de flotte terrain public.security_agents', seedContent.includes('public.security_agents'));
assert('4.6', 'seed.sql utilise les colonnes réelles current_latitude / current_longitude sur les agents', seedContent.includes('current_latitude') && seedContent.includes('current_longitude'));
assert('4.7', 'seed.sql référence auth.users pour garantir la cohérence des clés étrangères', seedContent.includes('auth.users'));
assert('4.8', 'seed.sql utilise ON CONFLICT DO NOTHING / UPDATE pour éviter tout conflit ou écrasement destructeur', seedContent.includes('ON CONFLICT (code) DO NOTHING') && seedContent.includes('ON CONFLICT (id) DO UPDATE SET'));

// ---------------------------------------------------------------------------
// 5. Audit de verrouillage de production
// ---------------------------------------------------------------------------
console.log('\n--- 5. Verrouillage strict de la cible de production ---');
const targetGuardPath = path.join(projectRoot, 'scripts', 'target-guard.js');
const targetGuard = fs.readFileSync(targetGuardPath, 'utf8');

assert('5.1', 'Liste blanche staging vide (APPROVED_STAGING_PROJECT_REFS = [])', targetGuard.includes('APPROVED_STAGING_PROJECT_REFS = Object.freeze([])'));
assert('5.2', 'Blocage explicite du projet de production gwxchazcuosajziampvk', targetGuard.includes('gwxchazcuosajziampvk'));

console.log('\n================================================================');
console.log(`📊 BILAN GLOBAL DE VALIDATION : ${passed}/${passed + failed} VÉRIFICATIONS VALIDÉES`);
console.log('================================================================\n');

if (failed > 0) process.exit(1);

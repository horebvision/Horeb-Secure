/**
 * =============================================================================
 * SECURIA SaaS — SUITE DE VÉRIFICATION STATIQUE DE SÉCURITÉ CONSOLIDÉE
 * Fichier : scripts/verify-global-security-phase2.js
 * =============================================================================
 * 
 * Vérifie localement et statiquement (sans réseau, sans base de données) :
 * 1. L'éradication de la purge globale dans l'API et l'interface Web (P0)
 * 2. L'intégrité de la migration additive de durcissement P0 / P1
 * 3. Le respect des frontières multi-tenant et des contrôles d'autorisation
 * 4. Le maintien strict du garde-fou anti-production
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(scenario, title, condition, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] [${scenario}] ${title}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] [${scenario}] ${title}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🛡️ SECURIA — VÉRIFICATION GLOBALE DE SÉCURITÉ CONSOLIDÉE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. VÉRIFICATION DE LA ROUTE API ADMIN USERS (/api/admin/users)
// -----------------------------------------------------------------------------
console.log('--- 1. Éradication de la purge globale dans src/app/api/admin/users/route.ts ---');
{
  const routePath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'users', 'route.ts');
  const content = fs.readFileSync(routePath, 'utf8');

  assert(
    '1.1',
    'La route API n\'appelle plus public.admin_purge_all_test_accounts()',
    !content.includes('admin_purge_all_test_accounts'),
    'Appel RPC résiduel trouvé'
  );

  assert(
    '1.2',
    'Toute tentative de purge globale (purge_test_accounts / PURGE_TEST_ACCOUNTS) est interceptée et rejetée (400)',
    content.includes('isPurgeAttempt') && content.includes('status: 400'),
    'Rejet fail-closed manquant'
  );

  assert(
    '1.3',
    'Le fallback applicatif destructeur (select neq adminId / delete cascade global) a été éradiqué',
    !content.includes('neq(\'id\', adminId)') && !content.includes('testUsers || []'),
    'Fallback destructeur résiduel trouvé'
  );

  assert(
    '1.4',
    'La suppression unitaire exige obligatoirement un UUID valide (isValidUuid)',
    content.includes('isValidUuid(targetUserId)'),
    'Validation UUID manquante'
  );

  assert(
    '1.5',
    'L\'auto-suppression d\'administrateur est strictement interdite (targetUserId === user.id)',
    content.includes('targetUserId === user.id'),
    'Interdiction auto-suppression manquante'
  );

  assert(
    '1.6',
    'Le cloisonnement multi-tenant interdit à un admin de supprimer un utilisateur d\'une autre organisation',
    content.includes('!user.isPlatformAdmin && targetUser.organization_id !== user.organizationId'),
    'Contrôle frontière tenant manquant'
  );
}

// -----------------------------------------------------------------------------
// 2. VÉRIFICATION DE L'INTERFACE ADMIN WEB (src/app/(admin)/admin/page.tsx)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Éradication de la purge globale dans src/app/(admin)/admin/page.tsx ---');
{
  const adminPagePath = path.join(projectRoot, 'src', 'app', '(admin)', 'admin', 'page.tsx');
  const pageContent = fs.readFileSync(adminPagePath, 'utf8');

  assert(
    '2.1',
    'Le bouton "Purger tous les profils de test" est supprimé de la page admin',
    !pageContent.includes('Purger tous les profils de test'),
    'Bouton de purge présent'
  );

  assert(
    '2.2',
    'L\'état isPurgeModalOpen et sa modale de confirmation sont complètement supprimés',
    !pageContent.includes('isPurgeModalOpen') && !pageContent.includes('MODALE 2 : CONFIRMATION DE PURGE'),
    'Modale de purge résiduelle trouvée'
  );

  assert(
    '2.3',
    'La fonction handleConfirmPurgeAll appelant l\'API de purge est supprimée',
    !pageContent.includes('handleConfirmPurgeAll'),
    'Handler de purge trouvé'
  );

  assert(
    '2.4',
    'L\'état isPurging est supprimé',
    !pageContent.includes('isPurging'),
    'État isPurging trouvé'
  );
}

// -----------------------------------------------------------------------------
// 3. VÉRIFICATION DE LA MIGRATION ADDITIVE CONSOLIDÉE (20261012000300)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Conformité de la migration additive 20261012000300 ---');
{
  const migPath = path.join(projectRoot, 'supabase', 'migrations', '20261012000300_remediate_admin_purge_all_test_accounts.sql');
  const migExists = fs.existsSync(migPath);
  assert('3.1', 'La migration additive 20261012000300 est présente sur le disque', migExists, 'Fichier manquant');

  if (migExists) {
    const migContent = fs.readFileSync(migPath, 'utf8');

    assert(
      '3.2',
      'La migration révoque formellement les privilèges de admin_purge_all_test_accounts',
      migContent.includes('REVOKE ALL ON FUNCTION public.admin_purge_all_test_accounts()'),
      'REVOKE ALL manquant'
    );

    assert(
      '3.3',
      'La migration supprime définitivement admin_purge_all_test_accounts (DROP FUNCTION)',
      migContent.includes('DROP FUNCTION IF EXISTS public.admin_purge_all_test_accounts()'),
      'DROP FUNCTION manquant'
    );

    assert(
      '3.4',
      'La migration durcit admin_delete_user_account avec vérification d\'appartenance tenant',
      migContent.includes('v_target_org <> v_caller_org') && migContent.includes('admin_delete_user_account'),
      'Durcissement tenant manquant dans admin_delete_user_account'
    );

    assert(
      '3.5',
      'La migration durcit get_dispatch_map_data (authentification, RBAC, masquage des consignes d\'accès)',
      migContent.includes('get_dispatch_map_data') && migContent.includes('v_caller_role NOT IN (\'ADMIN\', \'SECURITY_MANAGER\', \'AGENT\')'),
      'Durcissement get_dispatch_map_data manquant'
    );

    assert(
      '3.6',
      'La migration révoque INSERT, UPDATE, DELETE pour authenticated sur la table payments',
      migContent.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;'),
      'Révocation paiements manquante'
    );

    assert(
      '3.7',
      'La migration révoque INSERT, UPDATE, DELETE sur payment_transactions et fiscal_configurations',
      migContent.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_transactions') &&
      migContent.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.fiscal_configurations'),
      'Révocation transactions / fiscalité manquante'
    );

    assert(
      '3.8',
      'La migration applique une politique RLS SELECT bornée aux admins/managers sur les tables financières',
      migContent.includes('payments_select_scoped_v4_4') &&
      migContent.includes('payment_tx_select_scoped_v4_4') &&
      migContent.includes('fiscal_config_select_scoped_v4_4'),
      'Politiques RLS financières manquantes'
    );
  }

  // 3.bis Migration additive 20261012000400 (Durcissement RLS des alertes pour comptes inactifs)
  const mig400Path = path.join(projectRoot, 'supabase', 'migrations', '20261012000400_harden_alerts_inactive_users_rls.sql');
  const mig400Exists = fs.existsSync(mig400Path);
  assert('3.9', 'La migration incrémentale 20261012000400 est présente sur le disque', mig400Exists, 'Fichier manquant');

  if (mig400Exists) {
    const mig400Content = fs.readFileSync(mig400Path, 'utf8');
    assert(
      '3.10',
      'La migration 20261012000400 verrouille la lecture des alertes avec public.app_current_role() IS NOT NULL',
      mig400Content.includes('user_id = auth.uid() AND public.app_current_role() IS NOT NULL'),
      'Contrôle de compte actif manquant dans la politique RLS alerts'
    );
  }

  // 3.ter Migration additive 20261012000500 (Durcissement fail-closed de get_scoped_interventions_feed)
  const mig500Path = path.join(projectRoot, 'supabase', 'migrations', '20261012000500_harden_rpc_interventions_feed_null_org.sql');
  const mig500Exists = fs.existsSync(mig500Path);
  assert('3.11', 'La migration incrémentale 20261012000500 est présente sur le disque', mig500Exists, 'Fichier manquant');

  if (mig500Exists) {
    const mig500Content = fs.readFileSync(mig500Path, 'utf8');
    assert(
      '3.12',
      'La migration 20261012000500 verrouille get_scoped_interventions_feed avec isolation fail-closed (NULL org check)',
      mig500Content.includes('public.app_current_org() IS NULL OR public.app_current_org() <> p_org_id'),
      'Contrôle fail-closed manquant dans la RPC'
    );
  }
}

// -----------------------------------------------------------------------------
// 4. GARDE-FOU CIBLE & LISTE BLANCHE STAGING (scripts/target-guard.js)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Intégrité du garde-fou anti-production ---');
{
  const guardPath = path.join(projectRoot, 'scripts', 'target-guard.js');
  const guardContent = fs.readFileSync(guardPath, 'utf8');

  assert(
    '4.1',
    'La liste blanche de staging APPROVED_STAGING_PROJECT_REFS est strictement vide ([])',
    guardContent.includes('const APPROVED_STAGING_PROJECT_REFS = Object.freeze([]);'),
    'Allowlist non vide'
  );

  assert(
    '4.2',
    'La référence de production gwxchazcuosajziampvk est explicitement inscrite en liste noire',
    guardContent.includes('gwxchazcuosajziampvk'),
    'Blacklist production manquante'
  );
}

console.log('\n================================================================');
console.log(`📊 BILAN DES VÉRIFICATIONS : ${passed}/${passed + failed} TESTS RÉUSSIS`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

/**
 * =============================================================================
 * SECURIA SaaS — SUITE DE TESTS AUTOMATISÉS DE VALIDATION PHASE 1.4
 * =============================================================================
 * Vérifie rigoureusement les 10 scénarios de remédiation de sécurité :
 * 1. Absence de jeton Netlify de repli
 * 2. Absence de secrets exposés dans les fichiers suivis et artefacts
 * 3. Cloisonnement cross-tenant des interventions (Org A vs Org B)
 * 4. Accès légitime du prestataire de sécurité aux interventions de son centre/agent
 * 5. Absence de repli permissif en cas d'erreur
 * 6. Cloisonnement strict des interventions sur la carte SOC
 * 7. Rejet des en-têtes de test en mode production
 * 8. Protection des statistiques financières (réservées au Platform Admin)
 * 9. Blocage des requêtes utilisateurs pour un admin sans organisation
 * 10. Non-régression fonctionnelle
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0;
let failed = 0;
const results = [];

function assert(scenario, name, condition, details) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] [${scenario}] ${name}`);
    results.push({ scenario, name, status: 'PASS', details });
  } else {
    failed++;
    console.error(`  ❌ [FAIL] [${scenario}] ${name} : ${details}`);
    results.push({ scenario, name, status: 'FAIL', details });
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ SECURIA PHASE 1.4 — SUITE DE TESTS DE REMÉDIATION DE SÉCURITÉ');
  console.log('================================================================\n');

  const projectRoot = process.cwd();

  // ---------------------------------------------------------------------------
  // SCÉNARIO 1 : Vérification de l'absence de jeton Netlify de repli
  // ---------------------------------------------------------------------------
  console.log('--- Scénario 1 : Validation de get-site-info.js et scripts de déploiement ---');
  {
    const siteInfoPath = path.join(projectRoot, 'scripts', 'get-site-info.js');
    const content = fs.readFileSync(siteInfoPath, 'utf8');
    const hasNfpToken = /nfp_[a-zA-Z0-9_-]{20,}/.test(content);
    const requiresEnv = content.includes('process.env.NETLIFY_AUTH_TOKEN') && content.includes('if (!token)');
    assert('Scénario 1.1', 'scripts/get-site-info.js ne contient aucun jeton nfp_ en clair', !hasNfpToken, 'Jeton nfp_ détecté');
    assert('Scénario 1.2', 'scripts/get-site-info.js requiert strictement process.env.NETLIFY_AUTH_TOKEN', requiresEnv, 'Condition d\'environnement absente');

    // Test d'exécution réelle du script sans variable d'environnement
    let exitCode = 0;
    try {
      execSync('node scripts/get-site-info.js', { stdio: 'pipe', env: { ...process.env, NETLIFY_AUTH_TOKEN: '' } });
    } catch (e) {
      exitCode = e.status;
    }
    assert('Scénario 1.3', 'scripts/get-site-info.js échoue avec code 1 sans variable d\'environnement', exitCode === 1, `Code reçu: ${exitCode}`);
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 2 : Inspection des artefacts et exclusions .gitignore
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 2 : Absence de secrets exposés et règles .gitignore ---');
  {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const ignoresScratch = gitignoreContent.includes('scratch/') || gitignoreContent.includes('/scratch/');
    const ignoresNetlify = gitignoreContent.includes('.netlify');
    const ignoresEnv = gitignoreContent.includes('.env.*');

    assert('Scénario 2.1', '.gitignore exclut explicitement /scratch/ (dossier des sauvegardes/audits)', ignoresScratch, '/scratch/ non trouvé dans .gitignore');
    assert('Scénario 2.2', '.gitignore exclut explicitement .netlify', ignoresNetlify, '.netlify non trouvé');
    assert('Scénario 2.3', '.gitignore exclut les fichiers .env.*', ignoresEnv, '.env.* non trouvé');

    const netlifyDirExists = fs.existsSync(path.join(projectRoot, '.netlify'));
    assert('Scénario 2.4', 'Le répertoire d\'artefacts stale .netlify a été purgé du disque', !netlifyDirExists, '.netlify est toujours présent');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 3 & 4 : Cloisonnement multi-tenant des interventions (Client/Prestataire)
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénarios 3 & 4 : Logique de cloisonnement client/prestataire dans GET /api/interventions ---');
  {
    const interventionsRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const routeContent = fs.readFileSync(interventionsRoutePath, 'utf8');

    // Vérifier la présence du filtrage client ET prestataire
    const hasClientFilter = routeContent.includes('item.alert.organization_id === userOrgId');
    const hasProviderCenterFilter = routeContent.includes('item.security_center.organization_id === userOrgId');
    const hasProviderAgentFilter = routeContent.includes('item.agent.organization_id === userOrgId');
    const hasFailClosedUnassigned = routeContent.includes('!isPlatformAdmin && !userOrgId');

    assert('Scénario 3.1', 'GET /api/interventions filtre par organisation cliente (alert.organization_id)', hasClientFilter, 'Filtre client absent');
    assert('Scénario 4.1', 'GET /api/interventions autorise le prestataire via son centre de sécurité', hasProviderCenterFilter, 'Filtre centre absent');
    assert('Scénario 4.2', 'GET /api/interventions autorise le prestataire via ses agents de sécurité', hasProviderAgentFilter, 'Filtre agent absent');
    assert('Scénario 3.2', 'GET /api/interventions échoue de manière fermée (fail-closed) si un admin est sans organisation', hasFailClosedUnassigned, 'Fail-closed absent');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 5 : Absence de repli permissif non filtré
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 5 : Absence de repli permissif sans scoping ---');
  {
    const interventionsRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const routeContent = fs.readFileSync(interventionsRoutePath, 'utf8');

    // Vérifier qu'il n'y a plus le code vulnérable `finalInterventions = directList || []` sans filtre d'organisation
    const hasVulnerableFallback = routeContent.includes('finalInterventions = directList || [];');
    assert('Scénario 5.1', 'GET /api/interventions a éliminé le repli vulnérable directList sans filtre d\'organisation', !hasVulnerableFallback, 'Repli vulnérable toujours présent');

    // Vérifier que toute erreur SQL retourne safeErrorResponse
    const hasErrorHandling = routeContent.includes('if (queryError)') && routeContent.includes('return safeErrorResponse');
    assert('Scénario 5.2', 'Toute erreur de requête SQL retourne une réponse d\'erreur fermée et assainie', hasErrorHandling, 'Gestion d\'erreur fermée absente');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 6 : Cloisonnement strict des interventions sur la carte SOC
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 6 : Cloisonnement des interventions sur la carte SOC (/api/dispatch/map-data) ---');
  {
    const mapRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'dispatch', 'map-data', 'route.ts');
    const mapContent = fs.readFileSync(mapRoutePath, 'utf8');

    const filtersInterventions = mapContent.includes('filteredInterventions = targetOrgId');
    const filtersClientAlert = mapContent.includes('it.alert && it.alert.organization_id === targetOrgId');
    const filtersProviderCenter = mapContent.includes('it.security_center_id && orgCenterIds.includes');
    const filtersProviderAgent = mapContent.includes('it.agent && it.agent.organization_id === targetOrgId');
    const failsClosedUnassigned = mapContent.includes('!targetOrgId') && mapContent.includes('active_interventions: []');

    assert('Scénario 6.1', 'Carte SOC : active_interventions est explicitement filtré selon targetOrgId', filtersInterventions, 'Filtrage absent');
    assert('Scénario 6.2', 'Carte SOC : intègre les alertes clientes de l\'organisation', filtersClientAlert, 'Filtre alerte cliente absent');
    assert('Scénario 6.3', 'Carte SOC : intègre les interventions du centre de sécurité prestataire', filtersProviderCenter, 'Filtre centre prestataire absent');
    assert('Scénario 6.4', 'Carte SOC : intègre les interventions des agents du prestataire', filtersProviderAgent, 'Filtre agent prestataire absent');
    assert('Scénario 6.5', 'Carte SOC : un utilisateur sans organisation reçoit 0 intervention et 0 site', failsClosedUnassigned, 'Blocage non rattaché absent');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 7 : Verrouillage du mode test des alertes SOS en production
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 7 : Verrouillage du mode test SOS en production (/api/alerts) ---');
  {
    const alertsRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'alerts', 'route.ts');
    const alertsContent = fs.readFileSync(alertsRoutePath, 'utf8');

    // Vérifier l'opérateur &&
    const usesAndOperator = alertsContent.includes("process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true'");
    const doesNotUseOrOperator = !alertsContent.includes("process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_AUTH === 'true'");
    const requiresUuidInTest = alertsContent.includes('isValidUuid(providedUserId)');

    assert('Scénario 7.1', 'POST /api/alerts utilise strictement l\'opérateur && (non-production ET flag test explicite)', usesAndOperator && doesNotUseOrOperator, 'Opérateur incorrect');
    assert('Scénario 7.2', 'POST /api/alerts valide formellement que l\'identifiant de test est un UUID valide', requiresUuidInTest, 'Validation UUID absente');

    // Vérifier le scoping de GET /api/alerts
    const scopesGetAlerts = alertsContent.includes('query = query.eq(\'organization_id\', userOrgId);');
    const scopesFallbackAlerts = alertsContent.includes('fallbackQuery = fallbackQuery.eq(\'organization_id\', userOrgId);');
    assert('Scénario 7.3', 'GET /api/alerts filtre strictement par organization_id sur la requête principale', scopesGetAlerts, 'Filtre manquant');
    assert('Scénario 7.4', 'GET /api/alerts filtre strictement par organization_id sur la requête de repli', scopesFallbackAlerts, 'Filtre repli manquant');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 8 : Protection des statistiques financières et de facturation
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 8 : Protection des statistiques financières (/api/admin/billing/stats) ---');
  {
    const statsRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'billing', 'stats', 'route.ts');
    const statsContent = fs.readFileSync(statsRoutePath, 'utf8');

    const importsPlatformAdmin = statsContent.includes('requirePlatformAdmin');
    const checksPlatformAdmin = statsContent.includes('const platformCheck = requirePlatformAdmin(user);') && statsContent.includes('if (!platformCheck.allowed)');

    assert('Scénario 8.1', 'GET /api/admin/billing/stats importe requirePlatformAdmin', importsPlatformAdmin, 'Import absent');
    assert('Scénario 8.2', 'GET /api/admin/billing/stats rejette formellement tout administrateur non Platform Admin', checksPlatformAdmin, 'Vérification absente');

    // Vérifier également les factures administratives et organisations
    const invoicesRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'billing', 'invoices', 'route.ts');
    const invoicesContent = fs.readFileSync(invoicesRoutePath, 'utf8');
    assert('Scénario 8.3', 'GET /api/admin/billing/invoices exige requirePlatformAdmin', invoicesContent.includes('requirePlatformAdmin(user)'), 'Protection absente');

    const billingOrgsPath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'billing', 'organizations', 'route.ts');
    const billingOrgsContent = fs.readFileSync(billingOrgsPath, 'utf8');
    assert('Scénario 8.4', 'GET /api/admin/billing/organizations exige requirePlatformAdmin', billingOrgsContent.includes('requirePlatformAdmin(user)'), 'Protection absente');

    const reconciliationPath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'payments', 'reconciliation', 'route.ts');
    const reconciliationContent = fs.readFileSync(reconciliationPath, 'utf8');
    assert('Scénario 8.5', 'GET /api/admin/payments/reconciliation exige requirePlatformAdmin', reconciliationContent.includes('requirePlatformAdmin(user)'), 'Protection absente');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 9 : Protection de la liste des utilisateurs administratifs
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 9 : Protection des utilisateurs administratifs (/api/admin/users) ---');
  {
    const usersRoutePath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'users', 'route.ts');
    const usersContent = fs.readFileSync(usersRoutePath, 'utf8');

    const blocksMissingOrg = usersContent.includes('if (!user.organizationId)') && usersContent.includes('users: []');
    const filtersOrgAdmin = usersContent.includes('query = query.eq(\'organization_id\', user.organizationId);');

    assert('Scénario 9.1', 'GET /api/admin/users bloque et retourne 0 utilisateur si l\'admin n\'a pas d\'organisation', blocksMissingOrg, 'Blocage manquant');
    assert('Scénario 9.2', 'GET /api/admin/users restreint strictement l\'admin de tenant à son organisation', filtersOrgAdmin, 'Filtre tenant manquant');
  }

  // ---------------------------------------------------------------------------
  // SCÉNARIO 10 : Non-régression fonctionnelle
  // ---------------------------------------------------------------------------
  console.log('\n--- Scénario 10 : Vérification de non-régression fonctionnelle ---');
  {
    // Vérifier la présence et conformité du fichier de proposition de migration dual-tenant (archivé ou en migrations)
    let migrationProposalPath = path.join(projectRoot, 'supabase', 'drafts_archive', 'proposed_20261011_interventions_dual_tenant_model.sql');
    if (!fs.existsSync(migrationProposalPath)) {
      migrationProposalPath = path.join(projectRoot, 'supabase', 'migrations', 'proposed_20261011_interventions_dual_tenant_model.sql');
    }
    const migrationExists = fs.existsSync(migrationProposalPath);
    let migrationContent = '';
    if (migrationExists) {
      migrationContent = fs.readFileSync(migrationProposalPath, 'utf8');
    }

    assert('Scénario 10.1', 'Le fichier de migration proposé proposed_20261011_interventions_dual_tenant_model.sql existe', migrationExists, 'Fichier introuvable');
    assert('Scénario 10.2', 'La proposition inclut client_organization_id et provider_organization_id', migrationContent.includes('client_organization_id') && migrationContent.includes('provider_organization_id'), 'Colonnes manquantes');
    assert('Scénario 10.3', 'La proposition gère à la fois service_role et les sessions JWT dans la RPC', migrationContent.includes('v_is_service_role') && migrationContent.includes('service_role'), 'Gestion service_role manquante');
    assert('Scénario 10.4', 'La proposition inclut un plan de retour arrière (rollback)', migrationContent.includes('PLAN DE RETOUR ARRIÈRE'), 'Plan de rollback manquant');

    // Vérifier l'intégrité de la route publique v1 (interventions)
    const v1RoutePath = path.join(projectRoot, 'src', 'app', 'api', 'v1', 'interventions', 'route.ts');
    const v1Content = fs.readFileSync(v1RoutePath, 'utf8');
    assert('Scénario 10.5', 'La route publique /api/v1/interventions conserve sa jointure certifiée alerts!fk_interventions_alert!inner', v1Content.includes('alerts!fk_interventions_alert!inner'), 'Jointure altérée');
  }

  console.log('\n================================================================');
  console.log(`📊 BILAN DES TESTS DE REMÉDIATION : ${passed}/${passed + failed} TESTS RÉUSSIS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erreur critique pendant les tests:', err);
  process.exit(1);
});

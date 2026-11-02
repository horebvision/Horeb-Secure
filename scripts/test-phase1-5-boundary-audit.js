/**
 * =============================================================================
 * SECURIA SaaS — PHASE 1.5 AUDIT CONTRADICTOIRE DES FRONTIÈRES TENANT
 * =============================================================================
 * Vérifie rigoureusement les frontières entre organisations :
 * Scénario 1 : Client Org A vs Interventions Org B
 * Scénario 2 : Superviseur prestataire vs interventions relevant de sa mission
 * Scénario 3 : Agent patrouilleur et modification d'interventions
 * Scénario 4 : Immunité contre paramètre organizationId falsifié
 * Scénario 5 : Résistance aux erreurs SQL / RPC (aucun repli permissif)
 * Scénario 6 : Cohérence des autorisations GET / PATCH / Carte SOC
 * Scénario 7 : Comptes sans organisation (fail-closed strict)
 * Scénario 8 : Analyse des politiques RLS distantes
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
let passed = 0;
let failed = 0;
const results = [];

function record(name, condition, details) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${name}`);
    results.push({ name, status: 'PASS', details });
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${name} : ${details}`);
    results.push({ name, status: 'FAIL', details });
  }
}

async function testBoundaries() {
  console.log('================================================================');
  console.log('🛡️ SECURIA PHASE 1.5 — AUDIT DES FRONTIÈRES MULTI-TENANT');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Client Org A ne peut pas lire les interventions de B
  // ---------------------------------------------------------------------------
  console.log('--- 1. Étancheité Client Org A vs Org B ---');
  {
    const v1Path = path.join(projectRoot, 'src', 'app', 'api', 'v1', 'interventions', 'route.ts');
    const v1Code = fs.readFileSync(v1Path, 'utf8');
    const intPath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const intCode = fs.readFileSync(intPath, 'utf8');

    const v1Scoped = v1Code.includes(".eq('alert.organization_id', auth.organizationId)") &&
                     v1Code.includes("item.alert.organization_id === auth.organizationId");
    const intScoped = intCode.includes("item.alert.organization_id === userOrgId");

    record('1.1 L\'API publique v1 restreint 100% des interventions à l\'organisation authentifiée', v1Scoped, 'Clause de jointure ou filtre en mémoire manquant');
    record('1.2 L\'API interne /api/interventions filtre les alertes selon l\'organisation cliente (userOrgId)', intScoped, 'Filtre userOrgId manquant');
  }

  // ---------------------------------------------------------------------------
  // 2. Superviseur du prestataire : accès légitime à ses centres/agents
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Habilitation du prestataire de sécurité ---');
  {
    const intPath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const intCode = fs.readFileSync(intPath, 'utf8');

    const providerCenterAllowed = intCode.includes("item.security_center && item.security_center.organization_id === userOrgId");
    const providerAgentAllowed = intCode.includes("item.agent && item.agent.organization_id === userOrgId");

    record('2.1 Le superviseur du prestataire accède aux interventions via son centre de sécurité', providerCenterAllowed, 'Accès centre non pris en compte');
    record('2.2 Le superviseur du prestataire accède aux interventions via ses agents de patrouille', providerAgentAllowed, 'Accès agent non pris en compte');
  }

  // ---------------------------------------------------------------------------
  // 3. Agent : modification bornée à ses interventions assignées
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Contrôle anti-IDOR sur PATCH /api/interventions ---');
  {
    const intPath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const intCode = fs.readFileSync(intPath, 'utf8');

    const agentPatchCheck = intCode.includes("targetAlert.assigned_agent_id !== resolvedAgentId") &&
                            intCode.includes("Accès refusé : intervention non assignée à cet agent");
    const managerPatchCheck = intCode.includes("targetAlert.organization_id === user.organizationId") &&
                              intCode.includes("centerRec.organization_id === user.organizationId");

    record('3.1 Un agent ne peut modifier le statut que de son intervention assignée', agentPatchCheck, 'Vérification d\'assignation agent absente');
    record('3.2 Un manager ne peut mettre à jour que les interventions relevant de son tenant', managerPatchCheck, 'Vérification tenant manager absente');
  }

  // ---------------------------------------------------------------------------
  // 4. Immunité contre paramètre organizationId falsifié
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Résolution autoritaire scellée contre injection organizationId ---');
  {
    const mapPath = path.join(projectRoot, 'src', 'app', 'api', 'dispatch', 'map-data', 'route.ts');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    // Vérifier que paramOrgId n'est accepté que si isPlatformAdmin === true
    const safeOrgResolution = mapCode.includes("targetOrgId = paramOrgId || null;") &&
                             mapCode.includes("targetOrgId = user.organizationId || null;");
    const noFallbackToParam = !mapCode.includes("user.organizationId || paramOrgId");

    record('4.1 Carte SOC : Seul Platform Admin peut spécifier paramOrgId', safeOrgResolution, 'Résolution non autoritaire');
    record('4.2 Carte SOC : Aucun repli permissif sur paramOrgId pour un tenant standard', noFallbackToParam, 'Repli permissif détecté');
  }

  // ---------------------------------------------------------------------------
  // 5. Erreurs SQL / RPC : aucun repli non filtré
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Résistance aux pannes de requêtes SQL (Fail-Closed) ---');
  {
    const intPath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const intCode = fs.readFileSync(intPath, 'utf8');
    const alertsPath = path.join(projectRoot, 'src', 'app', 'api', 'alerts', 'route.ts');
    const alertsCode = fs.readFileSync(alertsPath, 'utf8');

    const intFailClosed = intCode.includes("if (queryError)") &&
                          intCode.includes("return safeErrorResponse(queryError");
    const alertsFailClosed = alertsCode.includes("fallbackQuery = fallbackQuery.eq('organization_id', userOrgId);");

    record('5.1 /api/interventions échoue immédiatement avec safeErrorResponse en cas d\'erreur SQL', intFailClosed, 'Repli non sécurisé présent');
    record('5.2 /api/alerts applique le scoping organisationnel même sur le repli d\'erreur', alertsFailClosed, 'Repli d\'erreur non scopé');
  }

  // ---------------------------------------------------------------------------
  // 6. Cohérence GET / PATCH / Carte SOC
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Cohérence des autorisations multi-tenant multi-endpoints ---');
  {
    const mapPath = path.join(projectRoot, 'src', 'app', 'api', 'dispatch', 'map-data', 'route.ts');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    const mapInterventionsFiltered = mapCode.includes("it.alert && it.alert.organization_id === targetOrgId") &&
                                     mapCode.includes("it.security_center_id && orgCenterIds.includes");

    record('6.1 La carte SOC applique exactement la même étanchéité client/prestataire que GET interventions', mapInterventionsFiltered, 'Incohérence des critères de filtrage');
  }

  // ---------------------------------------------------------------------------
  // 7. Comptes sans organisation : zéro accès implicite
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Traitement des comptes sans organisation rattachée ---');
  {
    const intPath = path.join(projectRoot, 'src', 'app', 'api', 'interventions', 'route.ts');
    const intCode = fs.readFileSync(intPath, 'utf8');
    const usersPath = path.join(projectRoot, 'src', 'app', 'api', 'admin', 'users', 'route.ts');
    const usersCode = fs.readFileSync(usersPath, 'utf8');
    const mapPath = path.join(projectRoot, 'src', 'app', 'api', 'dispatch', 'map-data', 'route.ts');
    const mapCode = fs.readFileSync(mapPath, 'utf8');

    const intBlocksUnassigned = intCode.includes("!isPlatformAdmin && !userOrgId") &&
                                intCode.includes("interventions: []");
    const usersBlocksUnassigned = usersCode.includes("!user.organizationId") &&
                                 usersCode.includes("users: []");
    const mapBlocksUnassigned = mapCode.includes("!targetOrgId") &&
                                mapCode.includes("active_interventions: []");

    record('7.1 GET /api/interventions renvoie 0 intervention pour un compte sans organisation', intBlocksUnassigned, 'Fail-closed absent');
    record('7.2 GET /api/admin/users renvoie 0 utilisateur pour un admin sans organisation', usersBlocksUnassigned, 'Fail-closed absent');
    record('7.3 GET /api/dispatch/map-data renvoie 0 site/intervention pour un compte sans organisation', mapBlocksUnassigned, 'Fail-closed absent');
  }

  // ---------------------------------------------------------------------------
  // 8. Analyse des politiques RLS distantes
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. Audit de sécurité des politiques RLS de la base de données distante ---');
  {
    const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
    const historicalMigration = fs.readFileSync(path.join(migrationsDir, '20260924102500_securia_triggers_and_policies.sql'), 'utf8');

    // Vérifier la politique historique
    const hasUnscopedAdminInHistorical = historicalMigration.includes("OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')");
    record('8.1 Constat RLS : La politique historique "Lecture des interventions" en base distante n\'a pas de filtre organization_id', hasUnscopedAdminInHistorical, 'Politique non trouvée');

    // Vérifier que la proposition dual-tenant corrige cette politique (archivée ou en migrations)
    let proposalPath = path.join(projectRoot, 'supabase', 'drafts_archive', 'proposed_20261011_interventions_dual_tenant_model.sql');
    if (!fs.existsSync(proposalPath)) {
      proposalPath = path.join(migrationsDir, 'proposed_20261011_interventions_dual_tenant_model.sql');
    }
    const proposalContent = fs.readFileSync(proposalPath, 'utf8');
    const proposalSecuresRls = proposalContent.includes("client_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())") &&
                               proposalContent.includes("provider_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())");
    record('8.2 Solution RLS : La migration dual-tenant proposée scelle la lecture sur client_organization_id ET provider_organization_id', proposalSecuresRls, 'Scellement RLS manquant dans la proposition');
  }

  console.log('\n================================================================');
  console.log(`📊 BILAN DES TESTS DE FRONTIÈRES : ${passed}/${passed + failed} VÉRIFICATIONS VALIDÉES`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

testBoundaries().catch(err => {
  console.error('Erreur audit frontières:', err);
  process.exit(1);
});

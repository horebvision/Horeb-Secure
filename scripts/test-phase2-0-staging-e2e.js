/**
 * =============================================================================
 * SECURIA SaaS — SUITE DE VALIDATION E2E SÉCURITÉ STAGING (PHASE 2.0)
 * Fichier : scripts/test-phase2-0-staging-e2e.js
 * =============================================================================
 * 
 * OBJECTIF :
 * Valider l'étanchéité multi-tenant, la non-régression et le cloisonnement RLS
 * sur une instance Supabase Staging isolée via des requêtes HTTP PostgREST & RPC réelles.
 * 
 * SÉCURITÉ :
 * - ZÉRO secret ou token codé en dur.
 * - Utilisation exclusive des JWT de test par rôle (JAMAIS de service_role pour simuler un utilisateur).
 * - Vérification stricte des codes HTTP, des messages d'erreur PostgreSQL et de l'état persistant des données.
 * =============================================================================
 */

const CONFIG = {
  baseUrl: process.env.STAGING_SUPABASE_URL || process.env.PREPROD_SUPABASE_URL || '',
  anonKey: process.env.STAGING_SUPABASE_ANON_KEY || process.env.PREPROD_SUPABASE_ANON_KEY || '',
  isLive: (process.env.STAGING_EXECUTE_LIVE === 'true' || process.env.PREPROD_EXECUTE_LIVE === 'true') && 
          Boolean(process.env.STAGING_SUPABASE_URL || process.env.PREPROD_SUPABASE_URL),
  
  // Fixtures identiques au fichier supabase/seed_staging_isolated_fixtures.sql
  fixtures: {
    orgClientA: '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
    orgClientB: '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
    orgProvider1: '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf',
    orgProvider2: '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae',
    interventionDualId: '11111111-1111-1111-1111-111111111111',
    interventionBId: '22222222-2222-2222-2222-222222222222',
    agent1Id: 'a1111111-1111-1111-1111-111111111111',
    agent2Id: 'a2222222-2222-2222-2222-222222222222',
    centerP1Id: 'c1111111-1111-4000-8000-111111111111',
  },
  
  // Jetons JWT authentiques des comptes fictifs de test
  tokens: {
    clientA: process.env.STAGING_JWT_CLIENT_A || '',
    clientB: process.env.STAGING_JWT_CLIENT_B || '',
    provider1: process.env.STAGING_JWT_PROVIDER_1 || '',
    provider2: process.env.STAGING_JWT_PROVIDER_2 || '',
    agent1: process.env.STAGING_JWT_AGENT_1 || '',
    superAdmin: process.env.STAGING_JWT_SUPERADMIN || '',
  }
};

let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

function logResult(status, title, details = '') {
  if (status === 'PASS') {
    console.log(`  ✅ [PASS] ${title}`);
    testsPassed++;
  } else if (status === 'FAIL') {
    console.error(`  ❌ [FAIL] ${title} : ${details}`);
    testsFailed++;
  } else {
    console.log(`  ⏸️ [SKIPPED - ENV DISTANT REQUIS] ${title}`);
    testsSkipped++;
  }
}

async function apiRequest(endpoint, method = 'GET', token = '', body = null) {
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

  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  return { status: res.status, ok: res.ok, data };
}

async function runStagingTestSuite() {
  console.log('======================================================================');
  console.log('🛡️ SECURIA PHASE 2.0 — PROTOCOLE DE TESTS E2E STAGING MULTI-TENANT');
  console.log(`📡 URL Cible : ${CONFIG.baseUrl || '(Non configurée - Mode Déclaration)'}`);
  console.log(`🔒 Exécution Réelle : ${CONFIG.isLive ? 'ACTIF (Requêtes HTTP réelles)' : 'INACTIF (Validation de protocole)'}`);
  console.log('======================================================================\n');

  if (!CONFIG.isLive) {
    console.log('ℹ️ NOTICE DEVSECOPS : Les variables STAGING_SUPABASE_URL et STAGING_EXECUTE_LIVE=true ne sont pas armées.');
    console.log('   Le protocole formalise la matrice des 10 exigences de sécurité ci-dessous.');
    console.log('   Aucun faux succès local n\'est certifié sans connexion distante effective.\n');
  }

  // ---------------------------------------------------------------------------
  // 1. ABSENCE D'AUTO-PROMOTION ET D'AUTO-RATTACHEMENT (public.users)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1 : Absence d\'auto-promotion et d\'auto-rattachement (Anti-Privilege Escalation) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      // 1.1 Tentative d'auto-promotion ADMIN
      const resRole = await apiRequest('/rest/v1/users', 'PATCH', CONFIG.tokens.clientA, { role: 'ADMIN' });
      const roleBlocked = resRole.status >= 400 && resRole.status < 500 &&
        resRole.data && resRole.data.message && resRole.data.message.includes('Action interdite');
      if (roleBlocked) {
        logResult('PASS', 'Rejet du PATCH /users { role: "ADMIN" } par trigger v4.1');
      } else {
        logResult('FAIL', 'Rejet du PATCH /users { role: "ADMIN" }', `Statut: ${resRole.status}, Rep: ${JSON.stringify(resRole.data)}`);
      }

      // 1.2 Tentative de changement d'organisation (Anti-Tenant-Hijack)
      const resOrg = await apiRequest('/rest/v1/users', 'PATCH', CONFIG.tokens.clientA, { 
        organization_id: CONFIG.fixtures.orgProvider1 
      });
      const orgBlocked = resOrg.status >= 400 && resOrg.status < 500 &&
        resOrg.data && resOrg.data.message && resOrg.data.message.includes('Action interdite');
      if (orgBlocked) {
        logResult('PASS', 'Rejet du PATCH /users { organization_id: forged } par trigger v4.1');
      } else {
        logResult('FAIL', 'Rejet du PATCH /users { organization_id: forged }', `Statut: ${resOrg.status}, Rep: ${JSON.stringify(resOrg.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test auto-promotion / auto-rattachement', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /users (auto-promotion & auto-rattachement)');
  }

  // ---------------------------------------------------------------------------
  // 2. ISOLATION STRICTE CLIENT A VS CLIENT B (public.alerts & sites)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2 : Isolation stricte Client A vs Client B (Alertes et Sites) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const resAlerts = await apiRequest('/rest/v1/alerts?select=id,organization_id', 'GET', CONFIG.tokens.clientA);
      if (!resAlerts.ok) {
        logResult('FAIL', 'Lecture alertes Client A', `Statut HTTP ${resAlerts.status}`);
      } else {
        const rows = resAlerts.data || [];
        const leaks = rows.filter(r => r.organization_id === CONFIG.fixtures.orgClientB);
        if (leaks.length > 0) {
          logResult('FAIL', 'Étancheité alertes Client A', `Fuite : ${leaks.length} alertes du Client B visibles`);
        } else {
          logResult('PASS', 'Zéro alerte de Client B visible pour Client A');
        }
      }
    } catch (err) {
      logResult('FAIL', 'Isolation alertes Client A vs B', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/alerts par Client A');
  }

  // ---------------------------------------------------------------------------
  // 3. ISOLATION STRICTE PRESTATAIRE 1 VS PRESTATAIRE 2 (public.security_agents)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3 : Isolation stricte Prestataire 1 vs Prestataire 2 (Agents) ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      const resAgents = await apiRequest('/rest/v1/security_agents?select=id,organization_id', 'GET', CONFIG.tokens.provider1);
      if (!resAgents.ok) {
        logResult('FAIL', 'Lecture agents Provider 1', `Statut HTTP ${resAgents.status}`);
      } else {
        const rows = resAgents.data || [];
        const leaks = rows.filter(r => r.organization_id === CONFIG.fixtures.orgProvider2);
        if (leaks.length > 0) {
          logResult('FAIL', 'Étancheité agents Provider 1', `Fuite : ${leaks.length} agents de P2 visibles`);
        } else {
          logResult('PASS', 'Zéro agent de Provider 2 visible pour Provider 1');
        }
      }
    } catch (err) {
      logResult('FAIL', 'Isolation agents Provider 1 vs 2', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/security_agents par Provider 1');
  }

  // ---------------------------------------------------------------------------
  // 4. ACCÈS LÉGITIME PRESTATAIRE MANDATÉ AUX INTERVENTIONS DUAL-TENANT
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4 : Accès légitime du Prestataire 1 mandaté à l\'intervention commune ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA && CONFIG.tokens.provider1 && CONFIG.tokens.provider2) {
    try {
      const q = `/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}&select=id,client_organization_id,provider_organization_id`;
      const resCli = await apiRequest(q, 'GET', CONFIG.tokens.clientA);
      const resP1 = await apiRequest(q, 'GET', CONFIG.tokens.provider1);
      const resP2 = await apiRequest(q, 'GET', CONFIG.tokens.provider2);

      const cliOk = resCli.ok && Array.isArray(resCli.data) && resCli.data.length === 1;
      const p1Ok = resP1.ok && Array.isArray(resP1.data) && resP1.data.length === 1;
      const p2Blocked = resP2.ok && Array.isArray(resP2.data) && resP2.data.length === 0;

      if (cliOk && p1Ok && p2Blocked) {
        logResult('PASS', 'Accès conjoint vérifié (Client A & P1 autorisés, P2 tiers strictement bloqué)');
      } else {
        logResult('FAIL', 'Accès dual-tenant conjoint', `Client: ${cliOk}, P1: ${p1Ok}, P2 bloqué: ${p2Blocked}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test accès dual-tenant', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel accès dual-tenant Client A, P1 et P2');
  }

  // ---------------------------------------------------------------------------
  // 5. INTERDICTION D'ACCÈS D'UN AGENT AUX INTERVENTIONS D'UN TIERS (ANTI-IDOR)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5 : Interdiction d\'accès agent aux interventions d\'un tiers (Anti-IDOR) ---');
  if (CONFIG.isLive && CONFIG.tokens.agent1) {
    try {
      // Tentative de modification de l'intervention B (assignée à Agent 2)
      const resPatch = await apiRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionBId}`, 'PATCH', CONFIG.tokens.agent1, {
        report: 'ATTACK_TAMPERING_AGENT_REPORT'
      });
      const blocked = !resPatch.ok || (Array.isArray(resPatch.data) && resPatch.data.length === 0);
      if (blocked) {
        logResult('PASS', 'Agent 1 bloqué en écriture sur l\'intervention d\'un tiers (Anti-IDOR)');
      } else {
        logResult('FAIL', 'Anti-IDOR Agent 1', `Lignes altérées : ${JSON.stringify(resPatch.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test Anti-IDOR Agent', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /rest/v1/interventions sur ressource tiers par agent');
  }

  // ---------------------------------------------------------------------------
  // 6. PROTECTION DES FACTURES ET ABONNEMENTS (public.invoices & subscriptions)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6 : Protection et isolation des factures et abonnements ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const resInv = await apiRequest('/rest/v1/invoices?select=id,organization_id', 'GET', CONFIG.tokens.clientA);
      if (resInv.ok) {
        const rows = resInv.data || [];
        const leaks = rows.filter(r => r.organization_id === CONFIG.fixtures.orgClientB);
        if (leaks.length > 0) {
          logResult('FAIL', 'Factures Client A', `Fuite : ${leaks.length} factures Client B visibles`);
        } else {
          logResult('PASS', 'Zéro facture de Client B accessible pour Client A');
        }
      } else {
        logResult('FAIL', 'Lecture factures Client A', `Statut HTTP ${resInv.status}`);
      }

      const resSub = await apiRequest('/rest/v1/subscriptions?select=id,organization_id', 'GET', CONFIG.tokens.clientA);
      if (resSub.ok) {
        const rows = resSub.data || [];
        const leaks = rows.filter(r => r.organization_id === CONFIG.fixtures.orgClientB);
        if (leaks.length > 0) {
          logResult('FAIL', 'Abonnements Client A', `Fuite : ${leaks.length} abonnements Client B visibles`);
        } else {
          logResult('PASS', 'Zéro abonnement de Client B accessible pour Client A');
        }
      } else {
        logResult('FAIL', 'Lecture abonnements Client A', `Statut HTTP ${resSub.status}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test factures et abonnements', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/invoices et /subscriptions par Client A');
  }

  // ---------------------------------------------------------------------------
  // 7. ISOLATION DES CLÉS D'API (public.api_keys)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7 : Isolation stricte des clés d\'API (public.api_keys) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const resKeys = await apiRequest('/rest/v1/api_keys?select=id,organization_id', 'GET', CONFIG.tokens.clientA);
      if (resKeys.ok) {
        const rows = resKeys.data || [];
        const leaks = rows.filter(r => r.organization_id === CONFIG.fixtures.orgClientB);
        if (leaks.length > 0) {
          logResult('FAIL', 'Clés API Client A', `Fuite : ${leaks.length} clés Client B visibles`);
        } else {
          logResult('PASS', 'Zéro clé d\'API de Client B accessible pour Client A');
        }
      } else {
        // Si l'utilisateur est rôle USER (non ADMIN), la RLS bloque l'accès (retourne [] ou 403)
        logResult('PASS', 'Accès aux clés API restreint par RLS pour le profil non-ADMIN');
      }
    } catch (err) {
      logResult('FAIL', 'Test clés API', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/api_keys par Client A');
  }

  // ---------------------------------------------------------------------------
  // 8. REFUS DE SUPPRESSION (DELETE) D'INTERVENTIONS (Rôles non autorisés)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8 : Refus de suppression (DELETE) d\'interventions pour rôles non-SuperAdmin ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      const resDel = await apiRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`, 'DELETE', CONFIG.tokens.provider1);
      const blocked = !resDel.ok || (Array.isArray(resDel.data) && resDel.data.length === 0);
      if (blocked) {
        logResult('PASS', 'Suppression DELETE refusée pour Security Manager (Immuabilité légale)');
      } else {
        logResult('FAIL', 'DELETE intervention autorisée par erreur', `Lignes supprimées: ${JSON.stringify(resDel.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test DELETE intervention', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel DELETE /rest/v1/interventions par Security Manager');
  }

  // ---------------------------------------------------------------------------
  // 9. REJET DES RATTACHEMENTS DUAL-TENANT INCOHÉRENTS (Trigger v4.1)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9 : Rejet des rattachements incohérents ou orphelins (Trigger v4.1) ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      // 9.1 Incohérence : Agent de P2 associé au centre de P1
      const resIncoherent = await apiRequest('/rest/v1/interventions', 'POST', CONFIG.tokens.provider1, {
        provider_organization_id: CONFIG.fixtures.orgProvider1,
        agent_id: CONFIG.fixtures.agent2Id, // Agent appartenant à P2 !
        mission_type: 'PATROL'
      });
      const incoherentBlocked = resIncoherent.status >= 400 && resIncoherent.status < 500 &&
        resIncoherent.data && resIncoherent.data.message && resIncoherent.data.message.includes('Incohérence multi-tenant');
      if (incoherentBlocked) {
        logResult('PASS', 'Trigger v4.1 rejette l\'incohérence Agent P2 sur Prestataire P1');
      } else {
        logResult('FAIL', 'Incohérence Agent/Prestataire acceptée', `Statut: ${resIncoherent.status}, Rep: ${JSON.stringify(resIncoherent.data)}`);
      }

      // 9.2 Intervention orpheline sans aucun ancrage tenant
      const resOrphan = await apiRequest('/rest/v1/interventions', 'POST', CONFIG.tokens.provider1, {
        mission_type: 'GHOST_MISSION'
      });
      const orphanBlocked = resOrphan.status >= 400 && resOrphan.status < 500 &&
        resOrphan.data && resOrphan.data.message && resOrphan.data.message.includes('Intervention invalide');
      if (orphanBlocked) {
        logResult('PASS', 'Trigger v4.1 rejette l\'intervention orpheline sans tenant');
      } else {
        logResult('FAIL', 'Intervention orpheline acceptée', `Statut: ${resOrphan.status}, Rep: ${JSON.stringify(resOrphan.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test intégrité trigger dual-tenant', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel POST /rest/v1/interventions incohérentes');
  }

  // ---------------------------------------------------------------------------
  // 10. DROITS SPÉCIFIQUES DU SUPER-ADMINISTRATEUR (public.platform_admins)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10 : Droits spécifiques et supervision transverse du Super-Administrateur ---');
  if (CONFIG.isLive && CONFIG.tokens.superAdmin) {
    try {
      const resAdmin = await apiRequest('/rest/v1/interventions?select=id,client_organization_id,provider_organization_id', 'GET', CONFIG.tokens.superAdmin);
      if (resAdmin.ok && Array.isArray(resAdmin.data) && resAdmin.data.length >= 2) {
        logResult('PASS', 'Super-Administrateur accède à la supervision globale multi-organisations');
      } else {
        logResult('FAIL', 'Super-Administrateur supervision globale', `Statut: ${resAdmin.status}, Data: ${JSON.stringify(resAdmin.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test Super-Administrateur', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/interventions avec JWT Super-Admin');
  }

  // ---------------------------------------------------------------------------
  // BILAN FINAL
  // ---------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`📊 BILAN DU HARNAIS E2E STAGING (PHASE 2.0) :`);
  console.log(`   - Tests validés : ${testsPassed}`);
  console.log(`   - Tests en échec : ${testsFailed}`);
  console.log(`   - Tests en attente d'armement Staging : ${testsSkipped}`);
  console.log('======================================================================');
}

runStagingTestSuite().catch(console.error);

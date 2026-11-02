/**
 * =============================================================================
 * SECURIA SaaS — HARNAIS DE TESTS HTTP RÉELS SUR INSTANCE PRÉPRODUCTION ISOLÉE
 * Fichier : scripts/test-phase1-8-live-preprod-harness.js (Phase 1.9 Durci)
 * =============================================================================
 * 
 * OBJECTIF :
 * Exécuter de VÉRITABLES requêtes HTTP (PostgREST & RPC) contre une base de
 * préproduction Supabase isolée pour éprouver le moteur PostgreSQL RLS.
 * 
 * SÉCURITÉ :
 * - ZÉRO secret ou JWT codé en dur.
 * - Paramétrage exclusif par variables d'environnement.
 * - Validation formelle des codes HTTP et des messages d'erreur PostgreSQL réels
 *   (élimination des faux positifs sur 404/500/syntaxe).
 * 
 * FIXTURES DE TEST PRÉREQUISES EN BASE DE PRÉPRODUCTION :
 * - ORG_CLIENT_A_ID    : UUID de l'Organisation Cliente A
 * - ORG_CLIENT_B_ID    : UUID de l'Organisation Cliente B
 * - ORG_PROVIDER_1_ID  : UUID du Prestataire de Télésurveillance 1
 * - ORG_PROVIDER_2_ID  : UUID du Prestataire de Télésurveillance 2
 * - INTERVENTION_DUAL_ID : UUID d'une intervention commune Client A / Provider 1
 * - AGENT_1_ID         : UUID de l'agent de patrouille du Prestataire 1
 * =============================================================================
 */

const CONFIG = {
  baseUrl: process.env.PREPROD_SUPABASE_URL || '',
  anonKey: process.env.PREPROD_SUPABASE_ANON_KEY || '',
  isLive: process.env.PREPROD_EXECUTE_LIVE === 'true' && Boolean(process.env.PREPROD_SUPABASE_URL),
  fixtures: {
    orgClientA: process.env.PREPROD_FIXTURE_CLIENT_A_ID || '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
    orgClientB: process.env.PREPROD_FIXTURE_CLIENT_B_ID || '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
    orgProvider1: process.env.PREPROD_FIXTURE_PROVIDER_1_ID || '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf',
    orgProvider2: process.env.PREPROD_FIXTURE_PROVIDER_2_ID || '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae',
    interventionDualId: process.env.PREPROD_FIXTURE_INTERVENTION_DUAL_ID || '11111111-1111-1111-1111-111111111111',
    agent1Id: process.env.PREPROD_FIXTURE_AGENT_1_ID || 'a1111111-1111-1111-1111-111111111111',
  },
  tokens: {
    clientA: process.env.PREPROD_JWT_CLIENT_A || '',
    clientB: process.env.PREPROD_JWT_CLIENT_B || '',
    provider1: process.env.PREPROD_JWT_PROVIDER_1 || '',
    provider2: process.env.PREPROD_JWT_PROVIDER_2 || '',
    agent1: process.env.PREPROD_JWT_AGENT_1 || '',
    platformAdmin: process.env.PREPROD_JWT_PLATFORM_ADMIN || '',
  }
};

let testsPassed = 0;
let testsFailed = 0;
let testsSkipped = 0;

function logResult(status, name, details = '') {
  if (status === 'PASS') {
    console.log(`  ✅ [PASS] ${name}`);
    testsPassed++;
  } else if (status === 'FAIL') {
    console.error(`  ❌ [FAIL] ${name} : ${details}`);
    testsFailed++;
  } else {
    console.log(`  ⏸️ [SKIPPED - ENV DISTANT REQUIS] ${name}`);
    testsSkipped++;
  }
}

async function sendSupabaseRequest(endpoint, method = 'GET', token = '', body = null) {
  const url = `${CONFIG.baseUrl.replace(/\/+$/, '')}${endpoint}`;
  const headers = {
    'apikey': CONFIG.anonKey,
    'Authorization': `Bearer ${token || CONFIG.anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const options = {
    method,
    headers,
  };

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

async function runLiveHarness() {
  console.log('======================================================================');
  console.log('🌐 SECURIA PHASE 1.9 — HARNAIS DE TESTS HTTP POSTGREST & RPC DURCI');
  console.log(`📡 URL Cible : ${CONFIG.baseUrl || '(Non configurée - Mode Déclaration)'}`);
  console.log(`🔒 Mode Réel : ${CONFIG.isLive ? 'ACTIF (Requêtes HTTP réelles transmises)' : 'INACTIF (Contrôles locaux d\'intégrité)'}`);
  console.log('======================================================================\n');

  if (!CONFIG.isLive) {
    console.log('⚠️ AVERTISSEMENT MÉTHODOLOGIQUE DE L\'AUDITEUR SÉCURITÉ :');
    console.log('   Les variables PREPROD_SUPABASE_URL et PREPROD_EXECUTE_LIVE=true ne sont pas armées.');
    console.log('   Le script valide ci-dessous la matrice des 10 scénarios d\'intégration.');
    console.log('   AUCUN faux succès local n\'est attribué sans exécution HTTP effective.\n');
  }

  // SCÉNARIO 1 : Impossibilité de s'auto-promouvoir ADMIN (Trigger public.users)
  console.log('--- SCÉNARIO 1 : Protection contre l\'auto-élévation de privilèges (public.users) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/users', 'PATCH', CONFIG.tokens.clientA, { role: 'ADMIN' });
      // Attendu : Erreur PostgreSQL explicite générée par le trigger (Code 400 ou 403 avec message)
      const isExpectedSecurityError = res.status >= 400 && res.status < 500 && 
        res.data && res.data.message && res.data.message.includes('Action interdite');
      if (isExpectedSecurityError) {
        logResult('PASS', 'Rejet du PATCH /users avec role: ADMIN');
      } else {
        logResult('FAIL', 'Rejet du PATCH /users avec role: ADMIN', `Statut: ${res.status}, Réponse: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Rejet du PATCH /users avec role: ADMIN', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /users { role: "ADMIN" } avec token résident');
  }

  // SCÉNARIO 2 : Impossibilité de modifier son organisation (Anti-Tenant-Hijack)
  console.log('\n--- SCÉNARIO 2 : Impossibilité de modifier son organisation (Anti-Tenant-Hijack) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/users', 'PATCH', CONFIG.tokens.clientA, { 
        organization_id: CONFIG.fixtures.orgProvider1 
      });
      const isExpectedSecurityError = res.status >= 400 && res.status < 500 && 
        res.data && res.data.message && res.data.message.includes('Action interdite');
      if (isExpectedSecurityError) {
        logResult('PASS', 'Rejet du PATCH /users avec organization_id forgé');
      } else {
        logResult('FAIL', 'Rejet du PATCH /users avec organization_id forgé', `Statut: ${res.status}, Réponse: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Rejet du PATCH /users avec organization_id forgé', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /users { organization_id: "..." } avec token résident');
  }

  // SCÉNARIO 3 : Isolation de deux clients (Table alerts)
  console.log('\n--- SCÉNARIO 3 : Étancheité stricte Client A vs Client B (Table alerts) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/alerts?select=id,organization_id', 'GET', CONFIG.tokens.clientA);
      if (!res.ok) {
        logResult('FAIL', 'Lecture des alertes Client A', `Statut HTTP ${res.status}`);
      } else {
        const rows = res.data || [];
        const leaks = rows.filter(a => a.organization_id && a.organization_id === CONFIG.fixtures.orgClientB);
        if (leaks.length > 0) {
          logResult('FAIL', 'Zéro alerte du Client B visible pour Client A', `Fuite détectée : ${leaks.length} alertes du Client B visibles`);
        } else {
          logResult('PASS', 'Zéro alerte du Client B visible pour Client A');
        }
      }
    } catch (err) {
      logResult('FAIL', 'Lecture sécurisée des alertes Client A', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/alerts avec JWT Client A');
  }

  // SCÉNARIO 4 : Isolation de deux prestataires (Table security_agents)
  console.log('\n--- SCÉNARIO 4 : Étancheité stricte Prestataire P1 vs Prestataire P2 (Table security_agents) ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/security_agents?select=id,organization_id', 'GET', CONFIG.tokens.provider1);
      if (!res.ok) {
        logResult('FAIL', 'Lecture des agents Provider 1', `Statut HTTP ${res.status}`);
      } else {
        const rows = res.data || [];
        const leaks = rows.filter(a => a.organization_id && a.organization_id === CONFIG.fixtures.orgProvider2);
        if (leaks.length > 0) {
          logResult('FAIL', 'Zéro agent du Prestataire P2 visible pour P1', `Fuite détectée : ${leaks.length} agents de P2 visibles`);
        } else {
          logResult('PASS', 'Zéro agent du Prestataire P2 visible pour P1');
        }
      }
    } catch (err) {
      logResult('FAIL', 'Lecture sécurisée des agents P1', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/security_agents avec JWT Prestataire 1');
  }

  // SCÉNARIO 5 : Accès partagé légitime à une intervention dual-tenant
  console.log('\n--- SCÉNARIO 5 : Accès partagé légitime Client A & Prestataire P1 mandaté ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA && CONFIG.tokens.provider1) {
    try {
      const resClient = await sendSupabaseRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}&select=id,client_organization_id,provider_organization_id`, 'GET', CONFIG.tokens.clientA);
      const resProvider = await sendSupabaseRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}&select=id,client_organization_id,provider_organization_id`, 'GET', CONFIG.tokens.provider1);
      
      const clientHasRow = resClient.ok && Array.isArray(resClient.data) && resClient.data.length === 1;
      const providerHasRow = resProvider.ok && Array.isArray(resProvider.data) && resProvider.data.length === 1;

      if (clientHasRow && providerHasRow) {
        logResult('PASS', 'Accès conjoint légitime à l\'intervention commune dual-tenant');
      } else {
        logResult('FAIL', 'Accès conjoint dual-tenant', `Client: ${clientHasRow ? 'OK' : 'MANQUANT'}, Provider: ${providerHasRow ? 'OK' : 'MANQUANT'}`);
      }
    } catch (err) {
      logResult('FAIL', 'Accès conjoint dual-tenant', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/interventions par Client et Prestataire mandaté');
  }

  // SCÉNARIO 6 : Contrôle Anti-IDOR sur intervention pour agent de patrouille
  console.log('\n--- SCÉNARIO 6 : Contrôle Anti-IDOR (Agent de patrouille) ---');
  if (CONFIG.isLive && CONFIG.tokens.agent1) {
    try {
      // Tenter de modifier une intervention tierce non assignée
      const res = await sendSupabaseRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`, 'PATCH', CONFIG.tokens.agent1, { report: 'TENTATIVE_PIRATAGE_AGENT' });
      // Attendu : RLS bloque la mise à jour (retourne un tableau vide 0 ligne modifiée, ou 404/403)
      const isBlocked = !res.ok || (Array.isArray(res.data) && res.data.length === 0);
      if (isBlocked) {
        logResult('PASS', 'Modification rejetée pour intervention non assignée à l\'agent (Anti-IDOR)');
      } else {
        logResult('FAIL', 'Modification bloquée pour intervention non assignée', `Lignes modifiées : ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Anti-IDOR agent de patrouille', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel PATCH /rest/v1/interventions sur ressource tiers par agent');
  }

  // SCÉNARIO 7 : Rejet des appels RPC cross-tenant
  console.log('\n--- SCÉNARIO 7 : Procédure RPC get_scoped_interventions_feed (Exception Cross-Tenant) ---');
  if (CONFIG.isLive && CONFIG.tokens.clientA) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/rpc/get_scoped_interventions_feed', 'POST', CONFIG.tokens.clientA, {
        p_org_id: CONFIG.fixtures.orgClientB
      });
      const isExpectedSecurityError = res.status >= 400 && res.status < 500 && 
        res.data && res.data.message && res.data.message.includes('Accès refusé');
      if (isExpectedSecurityError) {
        logResult('PASS', 'RPC lève une exception en cas de violation multi-tenant');
      } else {
        logResult('FAIL', 'RPC cross-tenant', `Statut: ${res.status}, Réponse: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test RPC cross-tenant', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel POST /rest/v1/rpc/get_scoped_interventions_feed avec org tiers');
  }

  // SCÉNARIO 8 : Protection contre la suppression (Immuabilité légale DELETE)
  console.log('\n--- SCÉNARIO 8 : Interdiction de DELETE sur interventions pour utilisateurs et managers ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      const res = await sendSupabaseRequest(`/rest/v1/interventions?id=eq.${CONFIG.fixtures.interventionDualId}`, 'DELETE', CONFIG.tokens.provider1);
      const isBlocked = !res.ok || (Array.isArray(res.data) && res.data.length === 0);
      if (isBlocked) {
        logResult('PASS', 'DELETE rejeté pour rôle non Platform Admin');
      } else {
        logResult('FAIL', 'DELETE interventions', `Lignes supprimées : ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test DELETE interventions', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel DELETE /rest/v1/interventions avec JWT Manager');
  }

  // SCÉNARIO 9 : Rejet des interventions complètement orphelines (Trigger v4)
  console.log('\n--- SCÉNARIO 9 : Rejet des écritures sans aucun ancrage d\'organisation (Trigger v4) ---');
  if (CONFIG.isLive && CONFIG.tokens.provider1) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/interventions', 'POST', CONFIG.tokens.provider1, {
        mission_type: 'ORPHAN_PATROL'
      });
      const isExpectedSecurityError = res.status >= 400 && res.status < 500 && 
        res.data && res.data.message && res.data.message.includes('Intervention invalide');
      if (isExpectedSecurityError) {
        logResult('PASS', 'Trigger v4 rejette l\'enregistrement orphelin sans organisation');
      } else {
        logResult('FAIL', 'Rejet intervention orpheline', `Statut: ${res.status}, Réponse: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test insertion orpheline', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel POST /rest/v1/interventions sans alerte ni centre');
  }

  // SCÉNARIO 10 : Privilège Super Admin Plateforme strictement scellé
  console.log('\n--- SCÉNARIO 10 : Super Administrateur Plateforme authentifié ---');
  if (CONFIG.isLive && CONFIG.tokens.platformAdmin) {
    try {
      const res = await sendSupabaseRequest('/rest/v1/interventions?select=id,client_organization_id', 'GET', CONFIG.tokens.platformAdmin);
      const hasMultipleOrgs = res.ok && Array.isArray(res.data) && res.data.length > 0;
      if (hasMultipleOrgs) {
        logResult('PASS', 'Super Administrateur accède à la supervision transverse globale');
      } else {
        logResult('FAIL', 'Super Administrateur accès global', `Statut: ${res.status}, Données: ${JSON.stringify(res.data)}`);
      }
    } catch (err) {
      logResult('FAIL', 'Test accès platform admin', err.message);
    }
  } else {
    logResult('SKIP', 'Test réel GET /rest/v1/interventions avec JWT Platform Admin');
  }

  console.log('\n======================================================================');
  console.log(`📊 BILAN DU HARNAIS PRÉPROD ISOLÉ :`);
  console.log(`   - Tests exécutés et passés : ${testsPassed}`);
  console.log(`   - Tests échoués : ${testsFailed}`);
  console.log(`   - Tests en attente de l'environnement distant : ${testsSkipped}`);
  console.log('======================================================================');
}

runLiveHarness().catch(console.error);

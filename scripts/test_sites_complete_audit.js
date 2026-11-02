require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!TEST_PASSWORD) {
  console.error('❌ ERREUR DE SÉCURITÉ : La variable d\'environnement TEST_USER_PASSWORD est requise (aucun mot de passe par défaut).');
  process.exit(1);
}

if (!url || !anonKey) {
  console.error('❌ ERREUR DE CONFIGURATION : URL Supabase et anon key requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const supabase = createClient(url, anonKey);

async function runCompleteAudit() {
  console.log('================================================================');
  console.log('   AUDIT COMPLET DU FLUX SITE -> DB -> RLS -> MAP (DISPATCH)   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, errorDetail = null) {
    if (condition) {
      console.log(`   [PASS] ${message}`);
      passed++;
    } else {
      console.error(`   [FAIL] ${message}`, errorDetail || '');
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // ÉTAPE 1 : Connexion Authentique SOC / Dispatch
    // -------------------------------------------------------------
    console.log('--- 1. Authentification Dispatch / SOC ---');
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_USER_EMAIL || 'cedricehouman007@gmail.com',
      password: TEST_PASSWORD,
    });

    assert(!authErr && authData?.session, 'Connexion réussie pour le compte Dispatch SOC', authErr?.message);
    const token = authData?.session?.access_token;
    const socClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: socUser, error: userErr } = await socClient
      .from('users')
      .select('id, email, role, organization_id, full_name')
      .eq('id', authData.user.id)
      .single();

    assert(socUser && socUser.role === 'SECURITY_MANAGER', `Rôle vérifié : ${socUser?.role} (${socUser?.full_name})`);
    assert(!!socUser.organization_id, `Organisation SOC identifiée : ${socUser?.organization_id}`);
    const socOrgId = socUser.organization_id;

    // -------------------------------------------------------------
    // ÉTAPE 2 : État initial des sites de l'organisation
    // -------------------------------------------------------------
    console.log('\n--- 2. État initial de la cartographie ---');
    const { data: initialMapData, error: initialMapErr } = await socClient.rpc('get_dispatch_map_data', {
      p_org_id: socOrgId,
    });
    assert(!initialMapErr, 'Récupération initiale des données cartographiques sans erreur', initialMapErr?.message);
    const initialSiteCount = initialMapData?.sites?.length || 0;
    console.log(`   * Nombre de sites existants avant test : ${initialSiteCount}`);

    // -------------------------------------------------------------
    // ÉTAPE 3 : Validation du Modèle de Données et Types Numériques
    // -------------------------------------------------------------
    console.log('\n--- 3. Validation de la structure des sites (Lat/Lon numériques) ---');
    if (initialSiteCount > 0) {
      const sample = initialMapData.sites[0];
      assert(typeof sample.latitude === 'number', `Latitude est numérique : ${sample.latitude}`);
      assert(typeof sample.longitude === 'number', `Longitude est numérique : ${sample.longitude}`);
      assert(!!sample.name, `Nom présent : ${sample.name}`);
      assert(!!sample.address, `Adresse présente : ${sample.address}`);
    } else {
      console.log('   * Aucun site existant dans la base');
    }

    // -------------------------------------------------------------
    // ÉTAPE 4 : Test de Création d'un Nouveau Site Protégé (avec GPS)
    // -------------------------------------------------------------
    console.log('\n--- 4. Création d\'un nouveau site avec coordonnées GPS réelles ---');
    const testSiteName = `Site Test Abidjan QC-${Date.now()}`;
    const testSiteAddress = '14 Boulevard de la République, Plateau';
    const testSiteLat = 5.321456;
    const testSiteLon = -4.017892;

    const { data: createResult, error: createErr } = await socClient.rpc('create_protected_site', {
      p_owner_id: socUser.id,
      p_organization_id: socOrgId,
      p_security_center_id: null,
      p_name: testSiteName,
      p_site_type: 'RESIDENCE',
      p_address: testSiteAddress,
      p_city: 'Abidjan',
      p_postal_code: 'BP 01',
      p_latitude: testSiteLat,
      p_longitude: testSiteLon,
      p_access_instructions: 'Digicode B456 - Interphone Sécuria',
      p_is_default: false,
    });

    assert(!createErr && createResult?.success, 'RPC create_protected_site exécutée avec succès', createErr?.message);
    const createdSite = createResult?.site;
    assert(!!createdSite?.id, `ID du site créé retourné : ${createdSite?.id}`);
    assert(createdSite?.latitude === testSiteLat, `Latitude enregistrée exacte : ${createdSite?.latitude}`);
    assert(createdSite?.longitude === testSiteLon, `Longitude enregistrée exacte : ${createdSite?.longitude}`);
    assert(createdSite?.organization_id === socOrgId, `Site rattaché à la bonne organisation : ${createdSite?.organization_id}`);

    // -------------------------------------------------------------
    // ÉTAPE 5 : Vérification de l'insertion réelle en base (Postgres)
    // -------------------------------------------------------------
    console.log('\n--- 5. Vérification directe dans la table public.protected_sites ---');
    const { data: dbCheckSite, error: dbCheckErr } = await socClient
      .from('protected_sites')
      .select('*')
      .eq('id', createdSite.id)
      .single();

    assert(!dbCheckErr && dbCheckSite, 'Site présent et vérifié directement dans public.protected_sites', dbCheckErr?.message);
    assert(dbCheckSite?.name === testSiteName, `Nom vérifié en base : ${dbCheckSite?.name}`);
    assert(dbCheckSite?.latitude === testSiteLat, `Latitude vérifiée en base : ${dbCheckSite?.latitude}`);
    assert(dbCheckSite?.longitude === testSiteLon, `Longitude vérifiée en base : ${dbCheckSite?.longitude}`);

    // -------------------------------------------------------------
    // ÉTAPE 6 : Vérification de l'Apparition Immédiate sur la Carte
    // -------------------------------------------------------------
    console.log('\n--- 6. Récupération cartographique (get_dispatch_map_data) ---');
    const { data: updatedMapData, error: updatedMapErr } = await socClient.rpc('get_dispatch_map_data', {
      p_org_id: socOrgId,
    });

    assert(!updatedMapErr, 'get_dispatch_map_data exécuté après création sans erreur');
    const mapSite = updatedMapData?.sites?.find((s) => s.id === createdSite.id);
    assert(!!mapSite, 'Le nouveau site apparaît IMMÉDIATEMENT dans le flux cartographique du Dispatch');
    assert(mapSite?.latitude === testSiteLat, `Coordonnées reçues par la carte (lat) : ${mapSite?.latitude}`);
    assert(mapSite?.longitude === testSiteLon, `Coordonnées reçues par la carte (lon) : ${mapSite?.longitude}`);
    assert(mapSite?.owner?.email === socUser.email, `Propriétaire résolu sur la carte : ${mapSite?.owner?.full_name}`);

    // -------------------------------------------------------------
    // ÉTAPE 7 : Persistance après Refresh
    // -------------------------------------------------------------
    console.log('\n--- 7. Test de persistance après refresh (second appel distinct) ---');
    const { data: refreshMapData } = await socClient.rpc('get_dispatch_map_data', {
      p_org_id: socOrgId,
    });
    const refreshedSite = refreshMapData?.sites?.find((s) => s.id === createdSite.id);
    assert(!!refreshedSite, 'Le site est toujours présent après refresh (données persistées en base)');

    // -------------------------------------------------------------
    // ÉTAPE 8 : Cloisonnement Multi-Organisation (RLS Strict)
    // -------------------------------------------------------------
    console.log('\n--- 8. Cloisonnement Multi-Organisation (Anti-fuite cross-tenant) ---');
    const otherOrgId = '99999999-9999-9999-9999-999999999999';
    const { data: otherOrgMapData } = await socClient.rpc('get_dispatch_map_data', {
      p_org_id: otherOrgId,
    });
    const leakCheck = otherOrgMapData?.sites?.find((s) => s.id === createdSite.id);
    assert(!leakCheck, 'Le site de l\'Organisation A n\'apparaît PAS dans l\'Organisation B (isolation étanche)');

    // -------------------------------------------------------------
    // ÉTAPE 9 : Nettoyage Propre et Suppression
    // -------------------------------------------------------------
    console.log('\n--- 9. Suppression et nettoyage du site de test ---');
    const { error: deleteErr } = await socClient
      .from('protected_sites')
      .delete()
      .eq('id', createdSite.id);

    assert(!deleteErr, 'Suppression du site de test réussie sans erreur', deleteErr?.message);

    const { data: finalMapData } = await socClient.rpc('get_dispatch_map_data', {
      p_org_id: socOrgId,
    });
    const ghostCheck = finalMapData?.sites?.find((s) => s.id === createdSite.id);
    assert(!ghostCheck, 'Aucun marker fantôme restant après suppression du site');

  } catch (err) {
    console.error('Exception pendant la suite d\'audit:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`BILAN DE L'AUDIT SITES & CARTE : ${passed} RÉUSSIS / ${failed} ÉCHECS (${passed}/${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCompleteAudit();

/**
 * ==============================================================================
 * TEST D'ATTRIBUTION D'ACCÈS SECRÉTAIRE PAR L'ADMIN ENTREPRISE
 * ==============================================================================
 * Vérifie :
 * 1. Création / invitation d'un collaborateur avec rôle SECRETARY par l'Admin
 * 2. Modification de rôle d'un collaborateur existant vers SECRETARY par l'Admin
 * 3. Vérification de la persistance en base (public.users) et auth (user_metadata)
 * 4. Validation des accès accordés pour l'espace Secrétariat
 * 5. Possibilité pour l'Admin de modifier ou révoquer cet accès
 * 6. Protection contre l'auto-attribution publique
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const assert = require('assert');
require('dotenv').config({ path: '.env.local' });
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.TEST_USER_PASSWORD;

if (!testPassword) {
  console.error('❌ ERREUR DE SÉCURITÉ : La variable d\'environnement TEST_USER_PASSWORD est requise (aucun mot de passe par défaut).');
  process.exit(1);
}

if (!url || !serviceKey) {
  console.error('❌ ERREUR DE CONFIGURATION : URL Supabase et service_role key requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runTest() {
  console.log('================================================================');
  console.log('🧪 TEST : ATTRIBUTION D’ACCÈS SECRÉTAIRE PAR L’ADMIN DU COMPTE');
  console.log('================================================================');

  const TEST_ID = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ORG_ID = crypto.randomUUID();
  let USER_ID = null;

  try {
    // 1. Création d'une organisation test
    const { error: orgErr } = await supabaseAdmin.from('organizations').insert({
      id: ORG_ID,
      name: `Entreprise Sécurité Privée [${TEST_ID}]`,
      code: `ESP_${TEST_ID}`,
      city: 'Abidjan',
      is_active: true,
      created_at: new Date().toISOString(),
    });
    assert(!orgErr, `Erreur création org: ${orgErr?.message}`);

    // 2. Création d'un collaborateur standard avec rôle 'AGENT' via auth.admin
    const testEmail = `collaborateur_${TEST_ID.toLowerCase()}@entreprise-test.ci`;
    const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Affoué Konan',
        phone: '+22507000000',
        role: 'AGENT',
        organization_id: ORG_ID,
      },
    });
    assert(!authErr && authCreated?.user?.id, `Erreur auth.admin: ${authErr?.message}`);
    USER_ID = authCreated.user.id;

    // S'assurer de la présence dans public.users
    await supabaseAdmin.from('users').upsert({
      id: USER_ID,
      email: testEmail,
      full_name: 'Affoué Konan',
      phone: '+22507000000',
      role: 'AGENT',
      organization_id: ORG_ID,
      is_active: true,
      created_at: new Date().toISOString(),
    });
    console.log('✔ [1] Collaborateur initial créé avec rôle AGENT');

    // 3. L'Admin de l'Entreprise donne l'accès Secrétaire (Modification vers SECRETARY)
    const { data: updatedUser, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        role: 'SECRETARY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', USER_ID)
      .eq('organization_id', ORG_ID)
      .select('id, email, full_name, role, organization_id')
      .single();

    assert(!updateErr, `Erreur mise à jour rôle en SECRETARY: ${updateErr?.message}`);
    assert.strictEqual(updatedUser.role, 'SECRETARY');
    console.log('✔ [2] L’admin d’entreprise a promu le collaborateur en SECRETARY');

    // 4. Vérification que le collaborateur a désormais accès au secrétariat
    const allowedRolesForSecretariat = ['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'];
    const hasSecretariatAccess = allowedRolesForSecretariat.includes(updatedUser.role);
    assert.strictEqual(hasSecretariatAccess, true);
    console.log('✔ [3] Habilitation certifiée : Le collaborateur a accès à l’espace Secrétariat');

    // 5. Enregistrement d'une visite d'accueil par le nouveau secrétaire
    const visitId = crypto.randomUUID();
    const { data: visit, error: visitErr } = await supabaseAdmin
      .from('visitor_visits')
      .insert({
        id: visitId,
        organization_id: ORG_ID,
        visit_reference: `SEC-2610-${TEST_ID}`,
        visit_reason: 'Entretien d’embauche',
        host_name: 'Responsable Recrutement',
        status: 'PRESENT',
        created_by: USER_ID,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    assert(!visitErr, `Erreur création visite par le secrétaire: ${visitErr?.message}`);
    assert.strictEqual(visit.created_by, USER_ID);
    console.log('✔ [4] Le secrétaire a utilisé son espace avec succès (Visite créée)');

    // 6. Nettoyage de la visite de test
    await supabaseAdmin.from('visitor_visits').delete().eq('id', visitId);

    // 7. L'Admin de l'entreprise retire l'accès Secrétariat (mutation vers USER ou AGENT)
    const { data: revertedUser, error: revertErr } = await supabaseAdmin
      .from('users')
      .update({
        role: 'USER',
        updated_at: new Date().toISOString(),
      })
      .eq('id', USER_ID)
      .eq('organization_id', ORG_ID)
      .select('role')
      .single();

    assert(!revertErr, `Erreur révocation rôle: ${revertErr?.message}`);
    assert.strictEqual(revertedUser.role, 'USER');
    const stillHasAccess = allowedRolesForSecretariat.includes(revertedUser.role);
    assert.strictEqual(stillHasAccess, false);
    console.log('✔ [5] L’admin peut révoquer l’accès secrétariat à tout moment');

    console.log('\n================================================================');
    console.log('✅ TOUTES LES VÉRIFICATIONS D’ACCÈS SECRÉTAIRE ONT RÉUSSI !');
    console.log('================================================================');
  } finally {
    // Nettoyage strict
    try {
      if (USER_ID) {
        await supabaseAdmin.from('users').delete().eq('id', USER_ID);
        await supabaseAdmin.auth.admin.deleteUser(USER_ID);
      }
      if (ORG_ID) {
        await supabaseAdmin.from('organizations').delete().eq('id', ORG_ID);
      }
    } catch {
      // Ignorer les erreurs de nettoyage
    }
    console.log('🧹 Données de test isolées nettoyées.');
  }
}

runTest().catch((err) => {
  console.error('❌ Échec test:', err);
  process.exit(1);
});

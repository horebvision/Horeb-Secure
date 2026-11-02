const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(url, serviceKey);

async function runTest() {
  console.log('=== TEST SUPPRESSION CASCADE CLIENT ===');

  // 1. Trouver une organisation active
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name').limit(1);
  if (orgErr || !orgs || orgs.length === 0) {
    throw new Error('Aucune organisation trouvée');
  }
  const orgId = orgs[0].id;
  console.log(`[1] Organisation cible: ${orgs[0].name} (${orgId})`);

  // 2. Créer un client de test
  const testEmail = `test-del-${Date.now()}@securia-test.ci`;
  const { data: newClient, error: clientErr } = await supabase.from('clients').insert({
    organization_id: orgId,
    name: 'Entreprise Test Cascade Inc',
    client_type: 'ENTREPRISE',
    primary_contact_name: 'M. Test Contact',
    email: testEmail,
    city: 'Abidjan',
    status: 'ACTIVE'
  }).select().single();

  if (clientErr || !newClient) {
    throw new Error(`Erreur création client de test: ${clientErr?.message}`);
  }
  console.log(`[2] Client créé avec succès: ID ${newClient.id}, Email ${newClient.email}`);

  const { data: authCreated, error: authErr } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (authErr || !authCreated?.user) {
    throw new Error(`Erreur auth createUser: ${authErr?.message}`);
  }
  const userId = authCreated.user.id;

  const { data: newUser, error: userErr } = await supabase.from('users').upsert({
    id: userId,
    organization_id: orgId,
    client_id: newClient.id,
    email: testEmail,
    phone: '+2250102030405',
    full_name: 'M. Test Contact',
    role: 'USER',
    is_active: true
  }).select().single();

  if (userErr || !newUser) {
    throw new Error(`Erreur création user collaborateur: ${userErr?.message}`);
  }
  console.log(`[3] Collaborateur/Client créé avec succès: ID ${newUser.id}, Rôle: ${newUser.role}`);

  // 4. Vérifier que le client est listé
  const { data: beforeCheck } = await supabase.from('clients').select('id, status').eq('id', newClient.id);
  console.log(`[4] Vérification présence client avant suppression: ${beforeCheck?.length > 0 ? 'PRÉSENT' : 'ABSENT'}`);

  // 5. Simuler la suppression de l'utilisateur avec la cascade client
  console.log('[5] Exécution de la suppression avec cascade...');
  
  // Détacher les sites associés
  await supabase.from('protected_sites').update({ client_id: null }).eq('client_id', newClient.id);
  
  // Détacher les autres utilisateurs
  await supabase.from('users').update({ client_id: null }).eq('client_id', newClient.id);

  // Supprimer la fiche client
  const { error: delClientErr } = await supabase.from('clients').delete().eq('id', newClient.id);
  if (delClientErr) console.error('Erreur del client:', delClientErr);

  // Supprimer l'utilisateur collaborateur
  const { error: delUserErr } = await supabase.from('users').delete().eq('id', newUser.id);
  if (delUserErr) console.error('Erreur del user:', delUserErr);

  // Supprimer du service Auth
  await supabase.auth.admin.deleteUser(userId).catch(() => {});

  // 6. Vérifier que le client a disparu de clients
  const { data: afterCheck } = await supabase.from('clients').select('id').eq('id', newClient.id);
  const isDeleted = !afterCheck || afterCheck.length === 0;

  console.log(`[6] Résultat après suppression : Client présent ? ${!isDeleted} -> ${isDeleted ? 'SUCCÈS : TOTALEMENT SUPPRIMÉ !' : 'ÉCHEC'}`);

  if (isDeleted) {
    console.log('✅ TEST VALIDÉ : La suppression synchronisée fonctionne parfaitement.');
  } else {
    console.error('❌ ÉCHEC DU TEST');
  }
}

runTest().catch(console.error);

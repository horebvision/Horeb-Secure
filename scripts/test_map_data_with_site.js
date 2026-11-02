require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const USER_EMAIL = process.env.TEST_USER_EMAIL || 'cedricehouman007@gmail.com';
const USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!USER_PASSWORD) {
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

async function test() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });

  const token = authData.session.access_token;
  const clientAuthed = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData } = await clientAuthed
    .from('users')
    .select('organization_id')
    .eq('id', authData.user.id)
    .single();

  const orgId = userData.organization_id;
  console.log('Org ID:', orgId);

  // Insert a test site
  const testSiteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const { data: insertedSite, error: insErr } = await clientAuthed
    .from('protected_sites')
    .insert({
      id: testSiteId,
      owner_id: authData.user.id,
      organization_id: orgId,
      name: 'Site Test Visible Carte',
      site_type: 'RESIDENCE',
      address: '22 Boulevard de la République',
      city: 'Abidjan',
      postal_code: 'BP 05',
      latitude: 5.3333,
      longitude: -4.0222,
      access_instructions: 'Code 9999',
      is_default: false,
    })
    .select()
    .single();

  console.log('Inserted site:', insertedSite, 'Error:', insErr);

  // Now call get_dispatch_map_data
  const { data: mapData, error: mapErr } = await clientAuthed.rpc('get_dispatch_map_data', {
    p_org_id: orgId,
  });

  console.log('get_dispatch_map_data error:', mapErr);
  const foundSite = mapData?.sites?.find((s) => s.id === testSiteId);
  console.log('Found site in mapData?', !!foundSite);
  if (foundSite) {
    console.log('Found site details:', foundSite);
  } else {
    console.log('All sites in mapData:', mapData?.sites?.map((s) => ({ id: s.id, name: s.name })));
  }

  // Cleanup
  await clientAuthed.from('protected_sites').delete().eq('id', testSiteId);
  console.log('Cleaned up test site.');
}

test().catch(console.error);

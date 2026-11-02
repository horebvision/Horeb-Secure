require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const fs = require('fs');
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

async function run() {
  console.log(`--- 1. Login as SOC (${USER_EMAIL}) ---`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });

  if (authErr) {
    console.error('Login error:', authErr);
    return;
  }

  console.log('Login OK! User ID:', authData.user.id);
  const token = authData.session.access_token;

  // Supabase client authenticated as SOC
  const clientAuthed = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  console.log('\n--- 2. Fetch user profile from public.users table directly ---');
  const { data: userData, error: userErr } = await clientAuthed
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  console.log('User row in DB:', userData, 'Error:', userErr);

  console.log('\n--- 3. Query public.protected_sites directly with authenticated client ---');
  const { data: sites, error: sitesErr } = await clientAuthed
    .from('protected_sites')
    .select('*');

  console.log('Protected sites for SOC:', sites, 'Error:', sitesErr);

  console.log('\n--- 4. Query public.organizations directly with authenticated client ---');
  const { data: orgs, error: orgsErr } = await clientAuthed
    .from('organizations')
    .select('*');

  console.log('Orgs for SOC:', orgs, 'Error:', orgsErr);

  console.log('\n--- 5. Call get_dispatch_map_data via authenticated client ---');
  const { data: mapData, error: mapErr } = await clientAuthed.rpc('get_dispatch_map_data', {
    p_org_id: userData?.organization_id,
  });

  console.log('Map data result sites count:', mapData?.sites?.length, 'Error:', mapErr);

  console.log('\n--- 6. Test Direct INSERT into protected_sites as SOC ---');
  const testSiteId = '99999999-8888-7777-6666-555555555555';
  const { data: insertData, error: insertErr } = await clientAuthed
    .from('protected_sites')
    .insert({
      id: testSiteId,
      owner_id: authData.user.id,
      organization_id: userData?.organization_id,
      name: 'Site Test SOC Direct Insert',
      site_type: 'RESIDENCE',
      address: 'Test Address',
      city: 'Abidjan',
      latitude: 5.35,
      longitude: -4.01,
      is_default: false,
    })
    .select();

  console.log('Direct INSERT result:', insertData, 'Error:', insertErr);

  console.log('\n--- 7. Test RPC create_protected_site as SOC ---');
  const { data: rpcData, error: rpcErr } = await clientAuthed.rpc('create_protected_site', {
    p_owner_id: authData.user.id,
    p_organization_id: userData?.organization_id,
    p_security_center_id: userData?.security_center_id || null,
    p_name: 'Site Test SOC via RPC',
    p_site_type: 'COMMERCE',
    p_address: 'Boulevard Lagunaire',
    p_city: 'Abidjan',
    p_postal_code: 'BP 02',
    p_latitude: 5.36,
    p_longitude: -4.02,
    p_access_instructions: 'Interphone 4321',
    p_is_default: false,
  });

  console.log('RPC create_protected_site result:', rpcData, 'Error:', rpcErr);

  // If created, clean up test sites
  console.log('\n--- 8. Cleanup test sites ---');
  const { error: delErr1 } = await clientAuthed.from('protected_sites').delete().eq('id', testSiteId);
  console.log('Deleted direct insert site error:', delErr1);
  if (rpcData?.site?.id) {
    const { error: delErr2 } = await clientAuthed.from('protected_sites').delete().eq('id', rpcData.site.id);
    console.log('Deleted rpc site error:', delErr2);
  }
}

run().catch(console.error);

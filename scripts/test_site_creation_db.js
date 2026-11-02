const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { assertAuthorizedTarget } = require('./target-guard');

let url = '';
let serviceKey = '';
let anonKey = '';

if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const k = match[1].trim();
      const v = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (k === 'NEXT_PUBLIC_SUPABASE_URL') url = v;
      if (k === 'SUPABASE_SERVICE_ROLE_KEY') serviceKey = v;
      if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') anonKey = v;
    }
  }
}

const key = serviceKey || anonKey;
if (!url || !key) {
  console.error('❌ ERREUR DE CONFIGURATION : URL Supabase et clé requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const adminClient = createClient(url, key);

async function run() {
  console.log('1. Check users in database:');
  const { data: users, error: uErr } = await adminClient.from('users').select('id, email, role, organization_id').limit(5);
  console.log('Users error:', uErr);
  console.log('Users:', users);

  console.log('\n2. Check organizations in database:');
  const { data: orgs, error: oErr } = await adminClient.from('organizations').select('id, name').limit(5);
  console.log('Orgs error:', oErr);
  console.log('Orgs:', orgs);

  if (users && users.length > 0) {
    const user = users[0];
    console.log('\n3. Test RPC create_protected_site:');
    const { data: rpcRes, error: rpcErr } = await adminClient.rpc('create_protected_site', {
      p_owner_id: user.id,
      p_organization_id: user.organization_id || orgs?.[0]?.id || null,
      p_security_center_id: null,
      p_name: 'Test Site Script',
      p_site_type: 'RESIDENCE',
      p_address: '123 Test Street',
      p_city: 'Abidjan',
      p_postal_code: 'BP 01',
      p_latitude: 5.3456,
      p_longitude: -4.0123,
      p_access_instructions: 'Code 1234',
      p_is_default: false,
    });
    console.log('RPC create_protected_site error:', rpcErr);
    console.log('RPC create_protected_site result:', rpcRes);
  }
}

run().catch(console.error);

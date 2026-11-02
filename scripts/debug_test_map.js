const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

const adminClient = createClient(url, serviceKey || anonKey);

async function run() {
  console.log('Testing get_dispatch_map_data with org 8e1f3246-4eec-4f2a-bc19-9e24f4f1d517:');
  const { data, error } = await adminClient.rpc('get_dispatch_map_data', {
    p_org_id: '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
  });
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));

  console.log('\nTesting protected_sites directly:');
  const { data: sites, error: sitesErr } = await adminClient
    .from('protected_sites')
    .select('*');
  console.log('Sites error:', sitesErr);
  console.log('Protected sites in DB:', sites);

  console.log('\nTesting organizations directly:');
  const { data: orgs, error: orgsErr } = await adminClient
    .from('organizations')
    .select('*');
  console.log('Organizations:', orgs);
}

run().catch(console.error);

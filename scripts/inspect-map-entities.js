const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = fs.existsSync('.env.local') ? dotenv.parse(fs.readFileSync('.env.local')) : {};
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envConfig.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour inspect-map-entities.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function inspect() {
  console.log('=== ORGANIZATIONS ===');
  const { data: orgs } = await supabase.from('organizations').select('*');
  console.log(orgs);

  console.log('\n=== PROTECTED SITES (ALL) ===');
  const { data: sites, error: siteErr } = await supabase.from('protected_sites').select('*');
  if (siteErr) {
    console.error('Error sites:', siteErr);
  } else {
    console.log(`Found ${sites.length} sites:`);
    sites.forEach(s => {
      console.log(`- [${s.id}] "${s.name}" (org: ${s.organization_id}) lat: ${s.latitude} (${typeof s.latitude}), lon: ${s.longitude} (${typeof s.longitude}), address: "${s.address}"`);
    });
  }

  console.log('\n=== SECURITY AGENTS (ALL) ===');
  const { data: agents, error: agErr } = await supabase.from('security_agents').select('*, user:users!user_id(full_name, role, organization_id, phone)');
  if (agErr) {
    console.error('Error agents:', agErr);
  } else {
    console.log(`Found ${agents.length} agents:`);
    agents.forEach(a => {
      console.log(`- [${a.id}] "${a.user?.full_name}" (badge: ${a.badge_number}, org: ${a.organization_id}, duty: ${a.duty_status}) lat: ${a.current_latitude}, lon: ${a.current_longitude}, is_active: ${a.is_active}`);
    });
  }
}

inspect().catch(console.error);

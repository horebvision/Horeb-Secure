const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Read .env.local
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('--- AUDIT AUTH USERS ---');
  const { data: { users: authUsers }, error: authErr } = await adminClient.auth.admin.listUsers();
  if (authErr) {
    console.error('Auth error:', authErr);
  } else {
    console.log(`Found ${authUsers.length} users in auth.users:`);
    authUsers.forEach(u => {
      console.log(` - ID: ${u.id} | Email: ${u.email} | Created: ${u.created_at}`);
    });
  }

  console.log('\n--- AUDIT PUBLIC.USERS ---');
  const { data: publicUsers, error: uErr } = await adminClient.from('users').select('*');
  if (uErr) {
    console.error('Public users error:', uErr);
  } else {
    console.log(`Found ${publicUsers?.length} users in public.users:`);
    publicUsers?.forEach(u => {
      console.log(` - ID: ${u.id} | Email: ${u.email} | Role: ${u.role} | FullName: ${u.full_name}`);
    });
  }

  console.log('\n--- AUDIT PUBLIC.PROFILES (if exists) ---');
  const { data: profiles, error: pErr } = await adminClient.from('profiles').select('*');
  if (pErr) {
    console.log('Profiles table/view status:', pErr.message);
  } else {
    console.log(`Found ${profiles?.length} records in profiles`);
  }

  console.log('\n--- AUDIT ALERTS ---');
  const { data: alerts, error: alErr } = await adminClient.from('alerts').select('id, user_id, title, status');
  if (alErr) console.error('Alerts error:', alErr);
  else {
    console.log(`Found ${alerts?.length} alerts`);
    alerts?.forEach(a => console.log(` - Alert ${a.id} owned by user_id: ${a.user_id} (${a.title})`));
  }

  console.log('\n--- AUDIT SECURITY AGENTS ---');
  const { data: agents, error: agErr } = await adminClient.from('security_agents').select('id, user_id, badge_number');
  if (agErr) console.error('Agents error:', agErr);
  else {
    console.log(`Found ${agents?.length} agents`);
    agents?.forEach(a => console.log(` - Agent ${a.id} for user_id: ${a.user_id} (badge: ${a.badge_number})`));
  }

  console.log('\n--- AUDIT SITES ---');
  const { data: sites, error: stErr } = await adminClient.from('protected_sites').select('id, owner_id, name');
  if (stErr) console.error('Sites error:', stErr);
  else {
    console.log(`Found ${sites?.length} sites`);
    sites?.forEach(s => console.log(` - Site ${s.id} owner_id: ${s.owner_id} (${s.name})`));
  }
}

run().catch(console.error);

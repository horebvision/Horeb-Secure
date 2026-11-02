require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour summary-db.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const testEmail = process.env.TEST_ADMIN_EMAIL || process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_ADMIN_PASSWORD || process.env.TEST_USER_PASSWORD;

if (!testEmail || !testPassword) {
  console.error('❌ ERREUR DE CONFIGURATION : TEST_ADMIN_EMAIL et TEST_ADMIN_PASSWORD sont requis.');
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function summary() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  const token = authData.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: users } = await client.from('users').select('id, email, full_name, role');
  console.log('USERS count:', users?.length || 0);

  const { data: alerts } = await client.from('alerts').select('id, user_id, title');
  console.log('ALERTS count:', alerts?.length || 0);

  const { data: sites } = await client.from('protected_sites').select('id, owner_id, name');
  console.log('SITES count:', sites?.length || 0);

  const { data: agents } = await client.from('security_agents').select('id, user_id, badge_number');
  console.log('AGENTS count:', agents?.length || 0);
}

summary().catch(console.error);

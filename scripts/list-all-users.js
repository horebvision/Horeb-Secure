require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour list-all-users.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const testEmail = process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_USER_PASSWORD;

if (!testEmail || !testPassword) {
  console.error('❌ ERREUR DE CONFIGURATION : TEST_USER_EMAIL et TEST_USER_PASSWORD sont requis.');
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function check() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  const token = auth.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: allUsers, error: uErr } = await client.from('users').select('*');
  if (uErr) {
    console.error('Users error:', uErr);
    return;
  }
  console.log('ALL USERS count:', allUsers?.length);

  const { data: allAgents, error: aErr } = await client.from('security_agents').select('*');
  if (aErr) {
    console.error('Agents error:', aErr);
    return;
  }
  console.log('ALL AGENTS count:', allAgents?.length);
}

check().catch(console.error);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour check-columns.js.');
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

async function main() {
  const supabase = createClient(url, anonKey);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }
  });

  const { data: alerts } = await client.from('alerts').select('*').limit(1);
  if (alerts && alerts[0]) {
    console.log('alerts columns:', Object.keys(alerts[0]));
  }

  const { data: agents } = await client.from('security_agents').select('*').limit(1);
  if (agents && agents[0]) {
    console.log('security_agents columns:', Object.keys(agents[0]));
  }
}

main().catch(console.error);

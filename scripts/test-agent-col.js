require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-agent-col.js.');
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

async function testAgentQuery() {
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

  const q1 = await client.from('security_agents').select('*').not('latitude', 'is', null);
  console.log('Query with .not(latitude, is, null):', q1.error ? q1.error.message : q1.data?.length);

  const q2 = await client.from('security_agents').select('*').not('current_latitude', 'is', null);
  console.log('Query with .not(current_latitude, is, null):', q2.error ? q2.error.message : q2.data?.length);
}

testAgentQuery().catch(console.error);

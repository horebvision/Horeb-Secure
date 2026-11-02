require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour inspect-columns.js.');
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

async function inspectColumns() {
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

  const { data: alertSample } = await client.from('alerts').select('*').limit(1);
  console.log('alerts keys:', alertSample && alertSample[0] ? Object.keys(alertSample[0]) : 'no alert');

  const { data: agentSample } = await client.from('security_agents').select('*').limit(1);
  console.log('security_agents keys:', agentSample && agentSample[0] ? Object.keys(agentSample[0]) : 'no agent');
}

inspectColumns().catch(console.error);

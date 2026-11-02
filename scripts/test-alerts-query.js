require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-alerts-query.js.');
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

async function testAlerts() {
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

  const { data: alerts, error: alErr } = await client.from('alerts').select('*').limit(5);
  console.log('ALERTS error:', alErr?.message || 'none');
  console.log('ALERTS count:', alerts?.length || 0);
}

testAlerts().catch(console.error);

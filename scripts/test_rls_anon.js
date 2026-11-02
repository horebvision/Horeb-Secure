require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test_rls_anon.js.');
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

async function test() {
  const anonClient = createClient(url, anonKey);

  // 1. Without session/headers
  console.log('--- 1. Query protected_sites with raw anonClient ---');
  const { data: d1, error: e1 } = await anonClient.from('protected_sites').select('*').limit(5);
  console.log('Result count:', d1?.length, 'Error:', e1?.message || 'none');

  // 2. Login SOC
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    return;
  }
  const token = authData.session.access_token;

  // 3. AnonClient with Bearer header
  console.log('\n--- 2. Query protected_sites with authedClient ---');
  const authedClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: d2, error: e2 } = await authedClient.from('protected_sites').select('*').limit(5);
  console.log('Result count:', d2?.length, 'Error:', e2?.message || 'none');
}

test().catch(console.error);

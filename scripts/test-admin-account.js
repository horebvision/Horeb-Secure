require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-admin-account.js.');
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

async function testAdmin() {
  console.log('--- TEST CONNEXION ADMIN ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('ERREUR CONNEXION:', authError.message);
    process.exit(1);
  }

  console.log('Connexion réussie pour:', authData.user.email);
  const token = authData.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: users, error: uErr } = await client.from('users').select('*').limit(5);
  console.log('Users sample count:', users?.length, uErr?.message || '');
}

testAdmin().catch(console.error);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour inspect-db-with-admin.js.');
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

async function inspect() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('Connexion admin échouée:', authError.message);
    process.exit(1);
  }

  console.log('Connecté en tant que Admin:', authData.user.email, 'ID:', authData.user.id);
  const token = authData.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: users, error: uErr } = await client.from('users').select('*');
  console.log('Users count:', users?.length, uErr?.message || '');

  const { data: orgs, error: oErr } = await client.from('organizations').select('*');
  console.log('Organizations count:', orgs?.length, oErr?.message || '');
}

inspect().catch(console.error);

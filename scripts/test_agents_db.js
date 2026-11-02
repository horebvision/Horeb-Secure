require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test_agents_db.js.');
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
  const sb = createClient(url, anonKey);
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
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

  const { data: agents, error: aErr } = await client.from('security_agents').select('*').limit(5);
  console.log('Agents sample count:', agents?.length || 0, aErr?.message || '');

  const { data: sites, error: sErr } = await client.from('protected_sites').select('id, name, latitude, longitude, organization_id').limit(5);
  console.log('Sites sample count:', sites?.length || 0, sErr?.message || '');
}

main().catch(console.error);

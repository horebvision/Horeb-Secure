require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test_map_query_roles.js.');
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

async function testUser(email, pass) {
  const sb = createClient(url, anonKey);
  const { data: auth, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    console.log(`Failed login for ${email}:`, error.message);
    return;
  }
  const token = auth.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  console.log(`\n=== Testing for ${email} (${auth.user.id}) ===`);
  const { data: profile } = await client.from('users').select('*').eq('id', auth.user.id).single();
  console.log('Profile in users:', profile?.role, 'org:', profile?.organization_id);

  const isSuperAdminAll = profile?.role === 'ADMIN';
  const orgId = profile?.organization_id || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

  let agentsQ = client
    .from('security_agents')
    .select('*, user:users!user_id(id, full_name, phone, email)')
    .eq('is_active', true);
  if (!isSuperAdminAll) {
    agentsQ = agentsQ.eq('organization_id', orgId);
  }

  const { data: mapAgents, error: mapAgErr } = await agentsQ.limit(5);
  console.log('Map-data agents count:', mapAgents?.length, 'error:', mapAgErr?.message || 'none');
}

async function main() {
  await testUser(testEmail, testPassword);
}

main().catch(console.error);

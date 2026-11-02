require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-duty-query.js.');
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

async function testDutyStatus() {
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

  const { data: dbAgents, error: err } = await client
    .from('security_agents')
    .select(`
      id,
      user_id,
      badge_number,
      duty_status,
      patrol_vehicle,
      current_latitude,
      current_longitude,
      is_active,
      organization_id
    `)
    .limit(5);

  console.log('security_agents query error:', err ? err.message : 'none');
  console.log('security_agents count:', dbAgents?.length || 0);
}

testDutyStatus().catch(console.error);

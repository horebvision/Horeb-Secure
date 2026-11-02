require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test_pilot_auth.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const supabaseUrl = target.baseUrl;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const testPassword = process.env.TEST_USER_PASSWORD;

if (!testPassword) {
  console.error('❌ ERREUR DE CONFIGURATION : TEST_USER_PASSWORD est requis.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPilotLogins() {
  const accounts = [
    { email: process.env.TEST_CLIENT_EMAIL || 'client.pilote@securia.org', role: 'USER' },
    { email: process.env.TEST_AGENT_EMAIL || 'agent.pilote@securia.org', role: 'AGENT' },
    { email: process.env.TEST_SOC_EMAIL || 'soc.pilote@securia.org', role: 'SECURITY_MANAGER' },
  ];

  for (const acc of accounts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: testPassword,
    });

    if (error) {
      console.error(`[FAIL] Login ${acc.email}:`, error.message);
    } else {
      console.log(`[OK] Login ${acc.email} SUCCESS -> user id: ${data.user.id}`);
    }
  }
}

testPilotLogins().catch(console.error);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour inspect-triggers.js.');
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

async function inspectTriggers() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
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

  const { data: logs, error: lErr } = await client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(10);
  if (lErr) {
    console.error('Logs error:', lErr);
    return;
  }
  console.log('Recent audit logs count:', logs?.length);
}

inspectTriggers().catch(console.error);

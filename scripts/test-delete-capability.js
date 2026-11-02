require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const USER_EMAIL = process.env.TEST_USER_EMAIL || 'ahossancedric22@gmail.com';
const USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!USER_PASSWORD) {
  console.error('❌ ERREUR DE SÉCURITÉ : La variable d\'environnement TEST_USER_PASSWORD est requise (aucun mot de passe par défaut).');
  process.exit(1);
}

if (!url || !anonKey) {
  console.error('❌ ERREUR DE CONFIGURATION : URL Supabase et anon key requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const supabase = createClient(url, anonKey);

async function testDelete() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });
  const token = authData.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Test if admin can delete a single alert event or test alert
  console.log('Testing delete permission on alert_events...');
  // Let's do a dry test or see RLS on users table
  const { error: testErr } = await client
    .from('users')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000000'); // dummy id
  console.log('Delete on public.users result error:', testErr ? testErr.message : 'OK (allowed by RLS)');

  // Check auth.admin
  try {
    const { error: authDelErr } = await client.auth.admin.deleteUser('00000000-0000-0000-0000-000000000000');
    console.log('auth.admin.deleteUser error:', authDelErr ? authDelErr.message : 'OK');
  } catch (err) {
    console.log('auth.admin.deleteUser threw:', err.message);
  }
}

testDelete().catch(console.error);

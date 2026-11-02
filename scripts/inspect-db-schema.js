require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!TEST_PASSWORD) {
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

async function inspect() {
  console.log('--- CONNEXION SOC ---');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL || 'cedricehouman007@gmail.com',
    password: TEST_PASSWORD
  });
  if (authErr) throw authErr;
  console.log('SOC connecté:', auth.user.email, 'id:', auth.user.id);
  const token = auth.session.access_token;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  // 1. Profil SOC
  const { data: profile } = await client.from('profiles').select('*').eq('id', auth.user.id).single();
  console.log('Profil SOC dans profiles:', profile);

  // 2. Users table
  const { data: uRec, error: uErr } = await client.from('users').select('*').eq('id', auth.user.id).maybeSingle();
  console.log('User SOC dans users:', uErr ? uErr.message : uRec);

  // 3. All security_agents
  const { data: agents, error: aErr } = await client.from('security_agents').select('*');
  console.log('security_agents count:', aErr ? aErr.message : agents?.length);
  if (agents) {
    agents.forEach(a => console.log('  Agent:', a));
  }

  // 4. All profiles in same org
  const orgId = profile?.organization_id || uRec?.organization_id;
  console.log('Org ID:', orgId);
  const { data: orgProfiles, error: opErr } = await client.from('profiles').select('*').eq('organization_id', orgId);
  console.log('Profiles in org count:', opErr ? opErr.message : orgProfiles?.length);
  if (orgProfiles) {
    orgProfiles.forEach(p => console.log(`  Profile [${p.role}] ${p.full_name} (${p.email}) id: ${p.id}`));
  }

  // 5. Check if users table has records in same org
  const { data: orgUsers, error: ouErr } = await client.from('users').select('*').eq('organization_id', orgId);
  console.log('Users in org count:', ouErr ? ouErr.message : orgUsers?.length);
  if (orgUsers) {
    orgUsers.forEach(u => console.log(`  User [${u.role}] ${u.full_name} (${u.email}) id: ${u.id}`));
  }

  // 6. Test map-data RPC get_dispatch_map_data
  const { data: mapData, error: mapErr } = await client.rpc('get_dispatch_map_data', { p_organization_id: orgId });
  console.log('RPC get_dispatch_map_data error:', mapErr ? mapErr.message : 'none');
  if (mapData) {
    console.log('RPC agents count:', mapData.agents ? mapData.agents.length : 0);
    console.log('RPC agents:', mapData.agents);
  }
}

inspect().catch(console.error);

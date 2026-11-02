require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const USER_EMAIL = process.env.TEST_USER_EMAIL || 'cedricehouman007@gmail.com';
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

const REAL_ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
const REAL_CENTER_ID = '202a6970-8afb-44cf-9455-aa16e2c7cbd1';

async function fixOrgAndAgents() {
  const { data: auth } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD
  });
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }
  });

  console.log('1. Réassignation de jeanoli234 vers la vraie organisation...');
  const { data: uJean, error: uErr } = await client
    .from('users')
    .update({
      organization_id: REAL_ORG_ID,
      security_center_id: REAL_CENTER_ID,
    })
    .eq('email', 'jeanoli234@gmail.com')
    .select();

  console.log('User jeanoli mis à jour:', uErr ? uErr.message : uJean);

  console.log('2. Réassignation de security_agents pour jeanoli...');
  const { data: saJean, error: saErr } = await client
    .from('security_agents')
    .update({
      organization_id: REAL_ORG_ID,
      security_center_id: REAL_CENTER_ID,
      current_latitude: 5.3412,
      current_longitude: -4.0255,
      last_location_update: new Date().toISOString(),
      duty_status: 'AVAILABLE'
    })
    .eq('user_id', 'b36413af-79a0-4253-83b6-05fc4a4e6d40')
    .select();

  console.log('Security agent jeanoli mis à jour:', saErr ? saErr.message : saJean);

  console.log('3. Réassignation des autres comptes de test...');
  await client
    .from('users')
    .update({ organization_id: REAL_ORG_ID, security_center_id: REAL_CENTER_ID })
    .in('email', ['cedricehouman18@gmail.com', 'syllacharles29@gmail.com']);

  // Vérifier la liste des agents pour REAL_ORG_ID
  const { data: agentsInOrg } = await client
    .from('security_agents')
    .select('*, users:user_id(full_name, email, role, phone)')
    .eq('organization_id', REAL_ORG_ID);

  console.log('Agents dans REAL_ORG_ID:', agentsInOrg?.map(a => ({
    id: a.id,
    badge: a.badge_number,
    name: a.users?.full_name,
    email: a.users?.email,
    lat: a.current_latitude,
    lon: a.current_longitude,
    status: a.duty_status
  })));
}

fixOrgAndAgents().catch(console.error);

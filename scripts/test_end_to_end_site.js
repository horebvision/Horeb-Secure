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

async function run() {
  console.log('1. Login SOC...');
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });
  const token = authData.session.access_token;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: user } = await client.from('users').select('*').eq('id', authData.user.id).single();
  console.log('SOC user org:', user.organization_id);

  console.log('2. Create protected site via RPC...');
  const siteName = 'Site Test E2E Dispatch';
  const siteLat = 5.3521;
  const siteLon = -4.0189;

  const { data: rpcRes, error: rpcErr } = await client.rpc('create_protected_site', {
    p_owner_id: user.id,
    p_organization_id: user.organization_id,
    p_security_center_id: user.security_center_id,
    p_name: siteName,
    p_site_type: 'RESIDENCE',
    p_address: '10 Rue des Jardins',
    p_city: 'Abidjan',
    p_postal_code: 'BP 10',
    p_latitude: siteLat,
    p_longitude: siteLon,
    p_access_instructions: 'Portail B',
    p_is_default: false,
  });

  console.log('Create site RPC error:', rpcErr);
  const siteId = rpcRes?.site?.id;
  console.log('Created site ID:', siteId);

  console.log('3. Fetch map data via get_dispatch_map_data...');
  const { data: mapData, error: mapErr } = await client.rpc('get_dispatch_map_data', {
    p_org_id: user.organization_id,
  });

  console.log('Map data error:', mapErr);
  const siteOnMap = mapData?.sites?.find((s) => s.id === siteId);
  console.log('Is created site on map?', !!siteOnMap);
  if (siteOnMap) {
    console.log('Site on map:', {
      id: siteOnMap.id,
      name: siteOnMap.name,
      lat: siteOnMap.latitude,
      lon: siteOnMap.longitude,
      city: siteOnMap.city,
    });
  }

  // Cleanup
  if (siteId) {
    await client.from('protected_sites').delete().eq('id', siteId);
    console.log('Test site cleaned up.');
  }
}

run().catch(console.error);

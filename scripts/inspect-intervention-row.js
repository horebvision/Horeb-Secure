require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour inspect-intervention-row.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(url, serviceKey);

async function inspectInterventionRow() {
  const { data, error } = await admin.from('interventions').select('*').limit(1);
  if (error) {
    console.error('Error fetching intervention:', error);
    return;
  }
  if (data && data[0]) {
    console.log('Intervention columns:', Object.keys(data[0]));
    console.log('Sample row:', data[0]);
  } else {
    console.log('No rows in interventions, checking alerts');
    const { data: aData } = await admin.from('alerts').select('*').limit(1);
    console.log('Alert columns:', Object.keys(aData[0]));
  }
}

inspectInterventionRow().catch(console.error);

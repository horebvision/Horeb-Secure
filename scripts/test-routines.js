require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-routines.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(url, serviceKey);

async function testRoutines() {
  const { data, error } = await admin.from('routines').select('*').limit(5);
  console.log('from routines:', { data, error });
}

testRoutines().catch(console.error);

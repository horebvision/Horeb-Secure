require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('❌ ERREUR DE CONFIGURATION : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const admin = createClient(url, serviceKey);

async function testSubmit() {
  const { data, error } = await admin.rpc('submit_agent_intervention_report', {
    p_intervention_id: '00000000-0000-0000-0000-000000000000',
    p_agent_user_id: '00000000-0000-0000-0000-000000000000',
    p_findings: 'test',
    p_actions_taken: 'test',
    p_outcome: 'test'
  });
  console.log('Result:', { data, error });
}

testSubmit().catch(console.error);

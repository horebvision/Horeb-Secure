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

async function checkRpc() {
  const rpcs = [
    'execute_sql_query',
    'exec_sql',
    'run_sql',
    'get_dispatch_map_data',
    'submit_agent_intervention_report',
    'validate_intervention_report',
  ];

  for (const rpc of rpcs) {
    const { data, error } = await admin.rpc(rpc, {});
    console.log(`RPC '${rpc}':`, error ? `${error.code} - ${error.message}` : 'SUCCESS');
  }
}

checkRpc().catch(console.error);

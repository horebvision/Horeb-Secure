require('dotenv').config({ path: '.env.local' });
const { assertAuthorizedTarget } = require('./target-guard');

async function test() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const projectRef = process.env.SUPABASE_PROJECT_REF || '';

  if (!projectRef || !serviceKey) {
    console.error('❌ ERREUR DE CONFIGURATION : SUPABASE_PROJECT_REF et SUPABASE_SERVICE_ROLE_KEY sont requis.');
    process.exit(1);
  }

  // GARDE-FOU FAIL-CLOSED : Validation stricte avant tout appel réseau
  const target = assertAuthorizedTarget(undefined, projectRef);

  const endpoints = [
    `${target.baseUrl}/pg/query`,
    `${target.baseUrl}/rest/v1/rpc/exec_sql`,
    `${target.baseUrl}/rest/v1/rpc/run_sql`
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ query: 'SELECT 1 as val;', sql: 'SELECT 1 as val;' })
      });
      console.log(`Endpoint: ${ep} -> Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response: ${text.slice(0, 200)}`);
    } catch (e) {
      console.log(`Endpoint: ${ep} -> Error: ${e.message}`);
    }
  }
}

test();

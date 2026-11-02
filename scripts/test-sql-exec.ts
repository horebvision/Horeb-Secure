import { assertAuthorizedTarget } from './target-guard';

async function testSqlExec() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!projectRef || !serviceKey) {
    console.error('❌ ERREUR DE CONFIGURATION : SUPABASE_PROJECT_REF et SUPABASE_SERVICE_ROLE_KEY sont requis.');
    process.exit(1);
  }

  // GARDE-FOU FAIL-CLOSED : Validation stricte avant tout appel réseau
  const target = assertAuthorizedTarget(undefined, projectRef);

  // 1. Test Supabase SQL API /pg/query
  const res = await fetch(`${target.baseUrl}/rest/v1/rpc/`, {
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    }
  });
  console.log('RPC endpoint list status:', res.status);

  // 2. Test Supabase Database API (management / v1)
  const queryRes = await fetch(`${target.baseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ query: 'SELECT 1 as val;' })
  });
  console.log('/pg/query status:', queryRes.status);
  if (queryRes.ok) {
    console.log('Query result:', await queryRes.json());
  } else {
    console.log('Query text:', await queryRes.text());
  }
}

testSqlExec().catch(console.error);

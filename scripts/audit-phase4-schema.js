require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { assertAuthorizedTarget } = require('./target-guard');

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const rawProjectRef = process.env.SUPABASE_PROJECT_REF;

if (!rawProjectRef || !serviceKey) {
  console.error('❌ ERREUR DE CONFIGURATION : SUPABASE_PROJECT_REF et SUPABASE_SERVICE_ROLE_KEY sont requis.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : validation anti-production
const target = assertAuthorizedTarget(undefined, rawProjectRef);

async function runQuery(sql) {
  const queryRes = await fetch(`${target.baseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!queryRes.ok) {
    const text = await queryRes.text();
    throw new Error(`SQL Error ${queryRes.status}: ${text}`);
  }
  return await queryRes.json();
}

async function audit() {
  console.log('--- AUDITING POSTGRES TABLES & EXTENSIONS ---');
  
  // List all tables in public schema
  const tables = await runQuery(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables:', tables.map(t => t.table_name));

  // Check columns of interventions
  const intCols = await runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'interventions'
    ORDER BY ordinal_position;
  `);
  console.log('Interventions columns count:', intCols.length);
  console.log('Interventions columns:', intCols.map(c => `${c.column_name} (${c.data_type})`));

  // Check if any Phase 4 tables already exist
  const phase4Tables = await runQuery(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('export_jobs', 'intervention_signatures', 'integration_partners', 'webhook_deliveries');
  `);
  console.log('Existing Phase 4 tables:', phase4Tables);
}

audit().catch(console.error);

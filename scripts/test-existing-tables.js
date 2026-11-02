require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-existing-tables.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(url, serviceKey);

async function testTables() {
  const tables = [
    'users',
    'security_agents',
    'protected_sites',
    'alerts',
    'interventions',
    'alert_events',
    'audit_logs',
    'notifications',
    'export_jobs',
    'intervention_signatures',
    'integration_partners',
    'webhook_deliveries',
  ];

  console.log('Testing table availability via supabaseAdmin:');
  for (const table of tables) {
    const { data, error } = await admin.from(table).select('id').limit(1);
    if (error) {
      console.log(`- ${table}: NOT FOUND or ERROR (${error.code}: ${error.message})`);
    } else {
      console.log(`- ${table}: EXISTS (rows found: ${data.length})`);
    }
  }
}

testTables().catch(console.error);

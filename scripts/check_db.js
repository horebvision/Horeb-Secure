const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const k = match[1].trim();
      const v = match[2].trim().replace(/^["']|["']$/g, '');
      if (k === 'NEXT_PUBLIC_SUPABASE_URL') url = v;
      if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') key = v;
    }
  }
}

const client = createClient(url, key);

async function test() {
  const tables = [
    'users',
    'organizations',
    'security_centers',
    'security_agents',
    'protected_sites',
    'site_members',
    'alerts',
    'alert_events',
    'interventions',
    'notifications',
    'emergency_contacts',
    'audit_logs'
  ];

  console.log('Testing tables against Supabase URL:', url);
  for (const t of tables) {
    try {
      const { data, error } = await client.from(t).select('*').limit(1);
      console.log(`Table ${t}:`, error ? `ERROR: ${error.message} (code ${error.code})` : `OK (count: ${data ? data.length : 0})`);
    } catch (e) {
      console.log(`Table ${t}: EXCEPTION`, e.message);
    }
  }

  // Test RPC functions
  const rpcs = [
    'trigger_alert_engine',
    'get_user_alerts',
    'get_dispatch_alerts',
    'get_interventions_feed',
    'get_intervention_detail',
    'assign_agent_to_alert',
    'acknowledge_alert',
    'update_agent_intervention_status',
    'update_agent_duty_status',
    'get_agent_dashboard_data',
    'get_dispatch_map_data',
    'create_protected_site',
    'get_securia_notifications',
    'create_securia_notification',
    'mark_securia_notification_as_read',
    'get_audit_logs',
    'escalate_overdue_alerts'
  ];

  console.log('\nTesting RPC functions:');
  for (const r of rpcs) {
    try {
      const { data, error } = await client.rpc(r, {});
      console.log(`RPC ${r}:`, error ? `ERROR: ${error.message} (code ${error.code})` : 'OK');
    } catch (e) {
      console.log(`RPC ${r}: EXCEPTION`, e.message);
    }
  }
}

test().catch(console.error);

import { supabaseAdmin } from '../src/lib/supabase/admin';

async function preflightAudit() {
  console.log('=== SECURIA PHASE 8 — PREFLIGHT DATABASE & CODE AUDIT ===');
  
  const tablesToCheck = [
    'video_systems',
    'video_cameras',
    'video_events',
    'video_event_rules',
    'cameras',
    'nvr_systems',
    'streams',
  ];

  for (const table of tablesToCheck) {
    const { data, error } = await supabaseAdmin.from(table as any).select('id').limit(1);
    if (error) {
      console.log(`Table [${table}]: DOES NOT EXIST (${error.code}: ${error.message})`);
    } else {
      console.log(`Table [${table}]: ALREADY EXISTS (count: ${data?.length})`);
    }
  }

  // Check core existing tables
  const coreTables = ['organizations', 'protected_sites', 'alerts', 'interventions', 'audit_logs', 'security_agents'];
  for (const table of coreTables) {
    const { count, error } = await supabaseAdmin.from(table as any).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Core table [${table}]: ERROR ${error.message}`);
    } else {
      console.log(`Core table [${table}]: OK (${count} rows)`);
    }
  }
}

preflightAudit().catch(console.error);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour audit-v2.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(url, serviceKey);

async function runAudit() {
  console.log('=== AUDIT SCHEMA & STRUCTURES EXISTANTES ===\n');

  // 1. users
  const { data: usersSample } = await admin.from('users').select('*').limit(1);
  console.log('1. Colonnes de public.users:', usersSample && usersSample[0] ? Object.keys(usersSample[0]) : 'Vide');

  // 2. profiles
  const { data: profSample, error: profErr } = await admin.from('profiles').select('*').limit(1);
  console.log('2. Table profiles:', profErr ? profErr.message : (profSample && profSample[0] ? Object.keys(profSample[0]) : 'Vide'));

  // 3. security_agents
  const { data: agentSample } = await admin.from('security_agents').select('*').limit(1);
  console.log('3. Colonnes de public.security_agents:', agentSample && agentSample[0] ? Object.keys(agentSample[0]) : 'Vide');

  // 4. organizations
  const { data: orgs } = await admin.from('organizations').select('*');
  console.log('4. Organisations enregistrées:', orgs?.map(o => ({ id: o.id, name: o.name, code: o.code })));

  // 5. alerts
  const { data: alertSample } = await admin.from('alerts').select('*').limit(1);
  console.log('5. Colonnes de public.alerts:', alertSample && alertSample[0] ? Object.keys(alertSample[0]) : 'Vide');

  // 6. interventions
  const { data: intervSample } = await admin.from('interventions').select('*').limit(1);
  console.log('6. Colonnes de public.interventions:', intervSample && intervSample[0] ? Object.keys(intervSample[0]) : 'Vide');

  // 7. alert_events
  const { data: eventSample } = await admin.from('alert_events').select('*').limit(1);
  console.log('7. Colonnes de public.alert_events:', eventSample && eventSample[0] ? Object.keys(eventSample[0]) : 'Vide');

  // 8. notifications
  const { data: notifSample } = await admin.from('notifications').select('*').limit(1);
  console.log('8. Colonnes de public.notifications:', notifSample && notifSample[0] ? Object.keys(notifSample[0]) : 'Vide');

  // 9. protected_sites
  const { data: siteSample } = await admin.from('protected_sites').select('*').limit(1);
  console.log('9. Colonnes de public.protected_sites:', siteSample && siteSample[0] ? Object.keys(siteSample[0]) : 'Vide');

  // 10. Audit logs
  const { data: auditSample } = await admin.from('audit_logs').select('*').limit(1);
  console.log('10. Colonnes de public.audit_logs:', auditSample && auditSample[0] ? Object.keys(auditSample[0]) : 'Vide');

  // 11. Agents réels enregistrés
  const { data: allAgents } = await admin.from('security_agents').select('*, users(*)');
  console.log('\n--- TOUS LES AGENTS EN BASE ---');
  for (const a of allAgents || []) {
    console.log(`Agent ID: ${a.id} | UserID: ${a.user_id} | Nom: ${a.users?.full_name} | Email: ${a.users?.email} | Org: ${a.users?.organization_id} | Duty: ${a.duty_status} | Lat: ${a.current_latitude} | Lng: ${a.current_longitude} | LastUpdate: ${a.last_location_update}`);
  }

  // 12. Alertes actives récentes
  const { data: activeAlerts } = await admin.from('alerts').select('id, alert_number, status, priority, type, latitude, longitude, organization_id, created_at').order('created_at', { ascending: false }).limit(5);
  console.log('\n--- 5 DERNIÈRES ALERTES ---');
  for (const al of activeAlerts || []) {
    console.log(`Alerte: ${al.alert_number} | ID: ${al.id} | Statut: ${al.status} | Type: ${al.type} | Org: ${al.organization_id} | Lat/Lng: ${al.latitude}, ${al.longitude}`);
  }

  // 13. Interventions actives
  const { data: activeInterventions } = await admin.from('interventions').select('id, alert_id, agent_id, status, assigned_at, resolved_at');
  console.log('\n--- TOUTES LES INTERVENTIONS ---');
  for (const it of activeInterventions || []) {
    console.log(`Intervention ID: ${it.id} | AlertID: ${it.alert_id} | AgentID: ${it.agent_id} | Statut: ${it.status} | Assigned: ${it.assigned_at} | Resolved: ${it.resolved_at}`);
  }
}

runAudit().catch(console.error);

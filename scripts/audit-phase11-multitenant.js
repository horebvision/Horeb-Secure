const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');
require('dotenv').config({ path: '.env.local' });

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour audit-phase11-multitenant.js.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const adminClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABLES_TO_AUDIT = [
  'organizations',
  'organization_memberships',
  'users',
  'profiles',
  'security_agents',
  'protected_sites',
  'alerts',
  'interventions',
  'video_cameras',
  'video_systems',
  'video_gateways',
  'video_events',
  'video_event_rules',
  'subscriptions',
  'plans',
  'invoices',
  'payments',
  'api_keys',
  'integration_partners',
  'webhook_deliveries',
  'export_jobs',
  'intervention_signatures',
  'organization_financial_settings',
  'commercial_leads',
  'scheduled_reports',
  'offline_sync_events',
  'payment_transactions',
  'fiscal_configurations',
  'audit_logs'
];

async function runAudit() {
  console.log('================================================================');
  console.log('🔍 AUDIT MULTI-TENANT GLOBAL — PHASE 11 (SECURIA v2.11.0)');
  console.log('================================================================');
  console.log('Supabase Target URL:', url);
  console.log('Timestamp:', new Date().toISOString());
  console.log('----------------------------------------------------------------\n');

  // 1. Table existence & column checks
  console.log('1. AUDIT DES TABLES ET COLONNES (Présence de organization_id) :');
  console.log('----------------------------------------------------------------');
  const tableReport = [];

  for (const table of TABLES_TO_AUDIT) {
    try {
      const { data, error } = await adminClient.from(table).select('*').limit(1);
      if (error) {
        tableReport.push({ table, exists: false, error: error.message });
      } else {
        const sampleRow = data && data.length > 0 ? data[0] : null;
        let columns = [];
        if (sampleRow) {
          columns = Object.keys(sampleRow);
        } else {
          // Si vide, tenter d'insérer un dummy pour voir les colonnes ou interroger un champ spécifique
          const { error: testErr } = await adminClient.from(table).select('organization_id').limit(1);
          const hasOrgId = !testErr;
          columns = hasOrgId ? ['(has organization_id)'] : ['(table vide / pas de row)'];
        }

        const hasOrgId = columns.includes('organization_id') || columns.includes('(has organization_id)');
        tableReport.push({
          table,
          exists: true,
          hasOrgId,
          columns: columns.slice(0, 10),
          rowCount: data?.length ?? 0
        });
      }
    } catch (e) {
      tableReport.push({ table, exists: false, error: e.message });
    }
  }

  for (const r of tableReport) {
    if (!r.exists) {
      console.log(`❌ [MANQUANTE / INACCESSIBLE] ${r.table} — ${r.error}`);
    } else {
      const statusIcon = r.hasOrgId ? '✅' : '⚠️';
      console.log(`${statusIcon} ${r.table.padEnd(32)} | has organization_id: ${r.hasOrgId ? 'OUI' : 'NON'} | cols: ${r.columns.join(', ')}`);
    }
  }

  // 2. Audit des Organisations Existantes
  console.log('\n2. ORGANISATIONS EXISTANTES DANS LA BASE :');
  console.log('----------------------------------------------------------------');
  const { data: orgs, error: orgErr } = await adminClient.from('organizations').select('*');
  if (orgErr) {
    console.error('Erreur récupération organizations:', orgErr.message);
  } else {
    console.log(`Nombre total d'organisations : ${orgs.length}`);
    orgs.forEach(o => {
      console.log(`  - [${o.id}] "${o.name}" (Code: ${o.code || 'N/A'}, Actif: ${o.is_active})`);
    });
  }

  // 3. Audit des Utilisateurs et leur affectation organisation
  console.log('\n3. UTILISATEURS EXISTANTS ET RATTACHEMENT ORGANISATION :');
  console.log('----------------------------------------------------------------');
  const { data: users, error: userErr } = await adminClient.from('users').select('id, email, full_name, role, organization_id');
  if (userErr) {
    console.error('Erreur users:', userErr.message);
  } else {
    console.log(`Nombre total d'utilisateurs (public.users) : ${users.length}`);
    users.forEach(u => {
      console.log(`  - [${u.role.padEnd(16)}] ${u.email.padEnd(30)} | Org: ${u.organization_id || 'NULL'} | ID: ${u.id}`);
    });
  }

  // 4. Audit des Plans & Souscriptions
  console.log('\n4. ABONNEMENTS ET PLANS PAR ORGANISATION :');
  console.log('----------------------------------------------------------------');
  try {
    const { data: plans } = await adminClient.from('plans').select('*');
    console.log(`Plans SaaS disponibles : ${plans?.length || 0}`);
    plans?.forEach(p => console.log(`  * Plan: ${p.name || p.id} (code: ${p.code})`));

    const { data: subs } = await adminClient.from('subscriptions').select('*');
    console.log(`Souscriptions actives : ${subs?.length || 0}`);
    subs?.forEach(s => console.log(`  * Souscription org: ${s.organization_id} | Plan: ${s.plan_id} | Statut: ${s.status}`));
  } catch (err) {
    console.log('Note plans/subs:', err.message);
  }

  // 5. Audit des Agents et Sites
  console.log('\n5. RATTACHEMENT AGENTS ET SITES :');
  console.log('----------------------------------------------------------------');
  const { data: ags } = await adminClient.from('security_agents').select('id, user_id, organization_id, badge_number');
  console.log(`Agents terrain : ${ags?.length || 0}`);
  ags?.forEach(a => console.log(`  * Agent ${a.badge_number} | Org: ${a.organization_id}`));

  const { data: sts } = await adminClient.from('protected_sites').select('id, name, organization_id, owner_id');
  console.log(`Sites protégés : ${sts?.length || 0}`);
  sts?.forEach(s => console.log(`  * Site "${s.name}" | Org: ${s.organization_id} | Owner: ${s.owner_id}`));

  console.log('\n================================================================');
  console.log('🏁 AUDIT INITIAL TERMINÉ');
  console.log('================================================================');
}

runAudit().catch(console.error);

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { assertAuthorizedTarget } from './target-guard';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour audit-phase2-schema.ts.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const SUPABASE_URL = target.baseUrl;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('--- AUDIT DES TABLES ET COLONNES EXISTANTES ---');
  const tables = [
    'alerts',
    'interventions',
    'alert_events',
    'intervention_events',
    'audit_logs',
    'security_agents',
    'agent_locations',
    'notifications',
    'protected_sites',
    'users',
    'organizations'
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`❌ Table [${t}]: NON DISPONIBLE (${error.message})`);
    } else {
      const keys = data && data[0] ? Object.keys(data[0]) : '(table vide - vérification RPC / structure)';
      console.log(`✅ Table [${t}]: EXISTE`);
      if (Array.isArray(keys)) {
        console.log(`   Colonnes (${keys.length}) :`, keys.join(', '));
      } else {
        console.log(`   État :`, keys);
      }
    }
  }

  // Examiner un exemple d'alerte et d'intervention pour voir les valeurs des timestamps
  console.log('\n--- ÉCHANTILLON ALERTES & TIMESTAMPS ---');
  const { data: alertSample } = await supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(2);
  if (alertSample && alertSample.length > 0) {
    console.log('Alert Sample 1:', JSON.stringify(alertSample[0], null, 2));
  }

  console.log('\n--- ÉCHANTILLON INTERVENTIONS & TIMESTAMPS ---');
  const { data: intervSample } = await supabase.from('interventions').select('*').order('created_at', { ascending: false }).limit(2);
  if (intervSample && intervSample.length > 0) {
    console.log('Intervention Sample 1:', JSON.stringify(intervSample[0], null, 2));
  }

  console.log('\n--- ÉCHANTILLON ALERT_EVENTS ---');
  const { data: eventSample } = await supabase.from('alert_events').select('*').order('created_at', { ascending: false }).limit(3);
  if (eventSample && eventSample.length > 0) {
    console.log('Events:', JSON.stringify(eventSample, null, 2));
  }
}

main().catch(console.error);

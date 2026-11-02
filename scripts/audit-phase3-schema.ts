import { supabaseAdmin } from '../src/lib/supabase/admin';

async function auditPhase3() {
  console.log('--- AUDIT BASE DE DONNÉES PHASE 3 ---');

  // 1. Structure de la table 'interventions'
  const { data: interventions, error: intErr } = await supabaseAdmin
    .from('interventions')
    .select('*')
    .limit(1);

  if (intErr) {
    console.error('Erreur interventions:', intErr);
  } else {
    console.log('Interventions columns:', interventions && interventions[0] ? Object.keys(interventions[0]) : 'Table vide (schéma à sonder)');
  }

  let intCols: any = null;
  let colErr: any = null;
  try {
    const res = await supabaseAdmin.rpc('execute_sql_query', {
      p_sql: `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'interventions'
        ORDER BY ordinal_position;
      `
    });
    intCols = res.data;
    colErr = res.error;
  } catch (err: any) {
    colErr = err;
  }

  if (!colErr && intCols) {
    console.log('Colonnes information_schema interventions:', intCols);
  }

  // 2. Vérifier les tables existantes liées aux rapports, preuves, photos, checklists
  const { data: tables } = await supabaseAdmin
    .from('interventions')
    .select('id, alert_id, agent_id, status, report, resolution_notes, assigned_at, accepted_at, en_route_at, arrived_at, resolved_at, created_at, updated_at')
    .limit(1);
  console.log('Sample interventions select:', tables);

  // 3. Vérifier les buckets de stockage Supabase
  const { data: buckets, error: bErr } = await supabaseAdmin.storage.listBuckets();
  console.log('Storage Buckets:', buckets?.map(b => ({ id: b.id, name: b.name, public: b.public })));

  // 4. Vérifier les types d'alertes & tables associées
  const { data: alertCols } = await supabaseAdmin
    .from('alerts')
    .select('*')
    .limit(1);
  console.log('Alerts columns:', alertCols && alertCols[0] ? Object.keys(alertCols[0]) : 'Table alerts sondée');
}

auditPhase3().catch(console.error);

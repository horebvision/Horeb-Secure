import { supabaseAdmin } from '../src/lib/supabase/admin';

async function testInterventionColumns() {
  const { data, error } = await supabaseAdmin
    .from('interventions')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching interventions:', error);
    return;
  }

  console.log('Interventions sample row:', data);

  // Vérifier si des colonnes spécifiques existent en tentant un select
  const testCols = [
    'report',
    'report_status',
    'findings',
    'actions_taken',
    'outcome',
    'observations',
    'damages',
    'recommendations',
    'checklist',
    'photos',
    'validated_at',
    'validated_by'
  ];

  for (const col of testCols) {
    const { error: cErr } = await supabaseAdmin
      .from('interventions')
      .select(col)
      .limit(1);
    console.log(`Column '${col}': ${cErr ? 'MISSING (' + cErr.message + ')' : 'EXISTS'}`);
  }
}

testInterventionColumns().catch(console.error);

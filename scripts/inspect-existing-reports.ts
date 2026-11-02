import { supabaseAdmin } from '../src/lib/supabase/admin';

async function inspectExistingReports() {
  const { data: alerts } = await supabaseAdmin
    .from('alerts')
    .select('id, alert_number, status, resolved_at, resolution_report')
    .not('resolution_report', 'is', null)
    .limit(5);

  console.log('Alerts with resolution_report:', alerts);

  const { data: interventions } = await supabaseAdmin
    .from('interventions')
    .select('id, alert_id, status, report, resolved_at')
    .not('report', 'is', null)
    .limit(5);

  console.log('Interventions with report:', interventions);
}

inspectExistingReports().catch(console.error);

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.trim().split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

async function checkAlertQuery() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);

  const { data: latestAlert, error: err0 } = await supabase
    .from('alerts')
    .select('id, alert_number, user_id, organization_id, site_id, assigned_agent_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Latest alert:', latestAlert, 'err0:', err0);
  if (!latestAlert) return;

  const { data: fullAlert, error: errFull } = await supabase
    .from('alerts')
    .select(`
      *,
      user:user_id(id, full_name, phone, email),
      site:site_id(id, name, address, city, postal_code, latitude, longitude, access_instructions),
      agent:assigned_agent_id(id, badge_number, patrol_vehicle, duty_status, user:user_id(full_name, phone)),
      interventions:interventions!fk_interventions_alert(id, status, assigned_at, accepted_at, en_route_at, arrived_at, resolved_at, report)
    `)
    .eq('id', latestAlert.id)
    .maybeSingle();

  console.log('Full query error:', errFull);
  console.log('Full query data exists:', !!fullAlert);

  if (errFull) {
    const qWithoutInterventions = await supabase
      .from('alerts')
      .select(`
        *,
        user:user_id(id, full_name, phone, email),
        site:site_id(id, name, address, city, postal_code, latitude, longitude, access_instructions)
      `)
      .eq('id', latestAlert.id)
      .maybeSingle();
    console.log('Without interventions error:', qWithoutInterventions.error);
    console.log('Without interventions data:', !!qWithoutInterventions.data);

    // Let's test what relations exist on interventions
    const qInterventions = await supabase
      .from('interventions')
      .select('*')
      .limit(1);
    console.log('Interventions sample:', qInterventions.data, qInterventions.error);
  }
}

checkAlertQuery().catch(console.error);

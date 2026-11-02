import { supabaseAdmin } from '../src/lib/supabase/admin';

async function getProcDef() {
  const { data, error } = await (supabaseAdmin as any).rpc('get_intervention_detail', {
    p_intervention_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_role: 'ADMIN'
  });
  console.log('Result:', data);
}

getProcDef().catch(console.error);

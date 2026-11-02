import { supabaseAdmin } from '../src/lib/supabase/admin';

async function testRpc() {
  const { data, error } = await supabaseAdmin.rpc('get_intervention_detail', {
    p_intervention_id: '00000000-0000-0000-0000-000000000000',
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_role: 'ADMIN'
  });
  console.log('RPC get_intervention_detail test result:', { data, error });
}

testRpc().catch(console.error);

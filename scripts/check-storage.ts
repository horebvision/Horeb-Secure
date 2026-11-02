import { supabaseAdmin } from '../src/lib/supabase/admin';

async function checkStorage() {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) {
    console.error('Storage listBuckets error:', error);
    return;
  }
  console.log('Buckets list:', buckets);
}

checkStorage().catch(console.error);

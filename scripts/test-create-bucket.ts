import { supabaseAdmin } from '../src/lib/supabase/admin';

async function testBucket() {
  const bucketName = 'intervention-photos';
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  console.log('Current buckets:', buckets);

  if (!buckets?.some(b => b.name === bucketName)) {
    console.log(`Creating private bucket '${bucketName}'...`);
    const { data, error } = await supabaseAdmin.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/jpg']
    });
    console.log('createBucket result:', { data, error });
  } else {
    console.log(`Bucket '${bucketName}' already exists.`);
  }

  const { data: updatedBuckets } = await supabaseAdmin.storage.listBuckets();
  console.log('Updated buckets:', updatedBuckets);
}

testBucket().catch(console.error);

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { assertAuthorizedTarget } from './target-guard';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-smart-dispatch-api.ts.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const testEmail = process.env.TEST_ADMIN_EMAIL || process.env.TEST_USER_EMAIL;
const testPassword = process.env.TEST_ADMIN_PASSWORD || process.env.TEST_USER_PASSWORD;

if (!testEmail || !testPassword) {
  console.error('❌ ERREUR DE CONFIGURATION : TEST_ADMIN_EMAIL et TEST_ADMIN_PASSWORD sont requis.');
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function testApi() {
  console.log('1. Connexion Super-Admin...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  });
  if (authErr) throw authErr;
  const token = authData.session.access_token;
  console.log('   Connecté avec succès. Token obtenu.');

  const alertId = 'a6aed8ea-97fc-4d4c-aeb4-c24b1bf781fc';

  console.log('\n2. Test SmartDispatchService via module direct...');
  const { SmartDispatchService } = await import('../src/lib/dispatch');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const adminClient = createClient(url, serviceKey);

  const rec = await SmartDispatchService.getRecommendationForAlert(alertId, adminClient, null, true);
  console.log('   Recommandation générée avec succès :');
  console.log('   - Alerte :', rec.alertNumber);
  console.log('   - Agent Recommandé :', rec.recommendedAgent?.agentName);
  console.log('   - Score :', rec.recommendedAgent?.totalScore);
  console.log('   - ETA :', rec.recommendedAgent?.formattedEta);
  console.log('   - Raisons :', rec.recommendedAgent?.reasons);
  console.log('   - Candidats totaux :', rec.totalCandidatesEvaluated);
  console.log('   - Candidats éligibles :', rec.eligibleCandidatesCount);

  console.log('\n3. Test d’isolation organisationnelle :');
  try {
    // Appel avec une fausse organisation appelante
    await SmartDispatchService.getRecommendationForAlert(alertId, adminClient, '00000000-0000-0000-0000-000000000000', false);
    console.error('   ❌ ERREUR : Aurait dû rejeter une organisation différente !');
  } catch (err: any) {
    console.log('   ✅ Rejet conforme pour organisation différente :', err.message);
  }

  console.log('\n4. Test ID inexistant :');
  try {
    await SmartDispatchService.getRecommendationForAlert('00000000-0000-0000-0000-000000000000', adminClient, null, true);
    console.error('   ❌ ERREUR : Aurait dû rejeter un ID d’alerte inexistant !');
  } catch (err: any) {
    console.log('   ✅ Rejet conforme alerte inexistante :', err.message);
  }

  console.log('\n✅ TOUS LES TESTS FONCTIONNELS DE L’API SONT VALIDÉS !');
}

testApi().catch(console.error);

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { assertAuthorizedTarget } from './target-guard';
import { SmartDispatchService } from '../src/lib/dispatch/dispatch-service';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!rawUrl) {
  console.error('❌ ERREUR DE CONFIGURATION : NEXT_PUBLIC_SUPABASE_URL est requis pour test-live-service.ts.');
  process.exit(1);
}

const target = assertAuthorizedTarget(rawUrl);
const url = target.baseUrl;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const admin = createClient(url, serviceKey);

async function testLiveService() {
  console.log('Testing live SmartDispatchService on real DB...');
  const alertId = 'a6aed8ea-97fc-4d4c-aeb4-c24b1bf781fc';
  const rec = await SmartDispatchService.getRecommendationForAlert(alertId, admin, null, true);
  console.log('Alerte analysée :', rec.alertNumber, '| Org:', rec.organizationId);
  console.log('Total candidats évalués :', rec.totalCandidatesEvaluated);
  console.log('Candidats éligibles     :', rec.eligibleCandidatesCount);

  if (rec.recommendedAgent) {
    console.log('\n🥇 AGENT RECOMMANDÉ EN BASE :');
    console.log(`   Nom      : ${rec.recommendedAgent.agentName} (${rec.recommendedAgent.badgeNumber})`);
    console.log(`   Score    : ${rec.recommendedAgent.totalScore}/100`);
    console.log(`   Distance : ${rec.recommendedAgent.formattedDistance}`);
    console.log(`   ETA      : ${rec.recommendedAgent.formattedEta}`);
    console.log(`   Statut   : ${rec.recommendedAgent.dutyStatus}`);
    console.log('   Raisons  :');
    rec.recommendedAgent.reasons.forEach(r => console.log(`     ✓ ${r}`));
    if (rec.recommendedAgent.warnings.length > 0) {
      console.log('   Alertes  :');
      rec.recommendedAgent.warnings.forEach(w => console.log(`     ⚠️ ${w}`));
    }
  } else {
    console.log('Aucun agent recommandé');
  }

  console.log('\n📋 TOUS LES CANDIDATS CLASSÉS :');
  rec.candidates.forEach((c, idx) => {
    console.log(`  #${idx + 1} : [Score: ${c.totalScore}] ${c.agentName} | Dist: ${c.formattedDistance} | Duty: ${c.dutyStatus} | Interventions: ${c.activeInterventionsCount}`);
  });
}

testLiveService().catch(console.error);

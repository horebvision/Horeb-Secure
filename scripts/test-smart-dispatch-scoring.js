const {
  calculateDispatchScore,
  rankCandidates,
  generateSmartDispatchRecommendation,
  calculateDispatchDistance,
  estimateDispatchArrivalMinutes,
  DISPATCH_WEIGHTS,
} = require('../src/lib/dispatch');

console.log('================================================================');
console.log('🧪 TEST UNITAIRE — SECURIA V2 SMART DISPATCH SCORING ENGINE');
console.log('================================================================\n');

const testOrgId = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
const now = new Date('2026-09-30T10:00:00.000Z');

const mockAlert = {
  id: 'alert-001',
  alertNumber: 'SEC-2026-TEST',
  organizationId: testOrgId,
  type: 'INTRUSION',
  priority: 'CRITICAL',
  status: 'SENT',
  latitude: 5.3500,
  longitude: -4.0200,
  locationAddress: 'Cocody Cité des Arts, Abidjan',
  createdAt: '2026-09-30T09:59:00.000Z',
};

// 1. Agent A : Idéal (Disponible, 800m, GPS il y a 10s, 0 mission)
const agentA = {
  id: 'agent-a-id',
  userId: 'user-a-id',
  organizationId: testOrgId,
  fullName: 'Jean Olivier',
  badgeNumber: 'AGT-001',
  phone: '+225 07 01 02 03 04',
  dutyStatus: 'AVAILABLE',
  patrolVehicle: 'Patrouille Moto Alpha',
  latitude: 5.3550, // ~700m
  longitude: -4.0220,
  lastLocationUpdate: '2026-09-30T09:59:50.000Z', // il y a 10s
  isActive: true,
  activeInterventionsCount: 0,
};

// 2. Agent B : Bon mais plus éloigné (3.5 km, GPS il y a 45s, 0 mission)
const agentB = {
  id: 'agent-b-id',
  userId: 'user-b-id',
  organizationId: testOrgId,
  fullName: 'Koffi Kouamé',
  badgeNumber: 'AGT-002',
  phone: '+225 07 05 06 07 08',
  dutyStatus: 'AVAILABLE',
  patrolVehicle: 'Patrouille Alpha Securia',
  latitude: 5.3800, // ~3.5 km
  longitude: -4.0100,
  lastLocationUpdate: '2026-09-30T09:59:15.000Z', // il y a 45s
  isActive: true,
  activeInterventionsCount: 0,
};

// 3. Agent C : Proche mais déjà occupé (1.2 km, BUSY, 1 mission active)
const agentC = {
  id: 'agent-c-id',
  userId: 'user-c-id',
  organizationId: testOrgId,
  fullName: 'Mamadou Touré',
  badgeNumber: 'AGT-003',
  phone: '+225 07 09 10 11 12',
  dutyStatus: 'BUSY',
  patrolVehicle: 'Patrouille Alpha Securia',
  latitude: 5.3580,
  longitude: -4.0210,
  lastLocationUpdate: '2026-09-30T09:59:40.000Z',
  isActive: true,
  activeInterventionsCount: 1,
};

// 4. Agent D : Hors service (OFF_DUTY)
const agentD = {
  id: 'agent-d-id',
  userId: 'user-d-id',
  organizationId: testOrgId,
  fullName: 'Agent Hors Service',
  badgeNumber: 'AGT-004',
  dutyStatus: 'OFF_DUTY',
  latitude: 5.3510,
  longitude: -4.0205,
  lastLocationUpdate: '2026-09-30T09:59:55.000Z',
  isActive: true,
  activeInterventionsCount: 0,
};

// 5. Agent E : Autre organisation (Organisation Lyon)
const agentE = {
  id: 'agent-e-id',
  userId: 'user-e-id',
  organizationId: 'b0000000-0000-0000-0000-000000000002', // Lyon != testOrgId
  fullName: 'Agent Autre Org',
  badgeNumber: 'AGT-005',
  dutyStatus: 'AVAILABLE',
  latitude: 5.3505,
  longitude: -4.0201,
  lastLocationUpdate: '2026-09-30T09:59:58.000Z',
  isActive: true,
  activeInterventionsCount: 0,
};

console.log('--- TEST 1 : Calcul de score individuel ---');
const scoreA = calculateDispatchScore(agentA, mockAlert, { now });
console.log(`Agent A (${agentA.fullName}) :`);
console.log(`  Score Total : ${scoreA.totalScore}/100`);
console.log(`  Distance    : ${scoreA.formattedDistance} (${scoreA.distanceKm} km)`);
console.log(`  ETA         : ${scoreA.formattedEta}`);
console.log(`  Détails     :`, scoreA.scoreBreakdown);
console.log(`  Raisons     :`, scoreA.reasons);
console.log(`  Warnings    :`, scoreA.warnings);

const scoreB = calculateDispatchScore(agentB, mockAlert, { now });
console.log(`\nAgent B (${agentB.fullName}) :`);
console.log(`  Score Total : ${scoreB.totalScore}/100`);
console.log(`  Distance    : ${scoreB.formattedDistance}`);
console.log(`  ETA         : ${scoreB.formattedEta}`);

const scoreC = calculateDispatchScore(agentC, mockAlert, { now });
console.log(`\nAgent C (${agentC.fullName} - BUSY) :`);
console.log(`  Score Total : ${scoreC.totalScore}/100`);
console.log(`  Warnings    :`, scoreC.warnings);

const scoreD = calculateDispatchScore(agentD, mockAlert, { now });
console.log(`\nAgent D (${agentD.fullName} - OFF_DUTY) :`);
console.log(`  Éligible    : ${scoreD.isEligible} (Raison: ${scoreD.ineligibilityReason})`);
console.log(`  Score Total : ${scoreD.totalScore}/100`);

const scoreE = calculateDispatchScore(agentE, mockAlert, { now });
console.log(`\nAgent E (${agentE.fullName} - Autre Org) :`);
console.log(`  Éligible    : ${scoreE.isEligible} (Raison: ${scoreE.ineligibilityReason})`);
console.log(`  Score Total : ${scoreE.totalScore}/100`);

console.log('\n--- TEST 2 : Recommandation Globale & Classement ---');
const recommendation = generateSmartDispatchRecommendation(
  [agentE, agentC, agentB, agentD, agentA],
  mockAlert,
  { now }
);

console.log(`🥇 Agent Recommandé : ${recommendation.recommendedAgent?.agentName}`);
console.log(`   Score : ${recommendation.recommendedAgent?.totalScore}/100`);
console.log(`   Distance : ${recommendation.recommendedAgent?.formattedDistance}`);
console.log(`   ETA : ${recommendation.recommendedAgent?.formattedEta}`);
console.log(`   Explications :`);
recommendation.recommendedAgent?.reasons.forEach(r => console.log(`     ✓ ${r}`));

console.log(`\nClassement complet des ${recommendation.totalCandidatesEvaluated} agents évalués :`);
recommendation.candidates.forEach((c, idx) => {
  console.log(`  #${idx + 1} : [Score: ${c.totalScore}] ${c.agentName} (${c.badgeNumber}) - ${c.isEligible ? 'Éligible' : 'Inéligible : ' + c.ineligibilityReason}`);
});

// Assertions de validation
if (recommendation.recommendedAgent?.agentId !== agentA.id) {
  throw new Error('ÉCHEC : Agent A devrait être recommandé !');
}
if (scoreE.isEligible !== false) {
  throw new Error('ÉCHEC : Agent E d’une autre organisation doit être inéligible !');
}
if (scoreD.isEligible !== false) {
  throw new Error('ÉCHEC : Agent D hors service doit être inéligible !');
}
if (scoreA.totalScore <= scoreB.totalScore) {
  throw new Error('ÉCHEC : Agent A proche doit avoir un meilleur score qu’Agent B !');
}
if (scoreB.totalScore <= scoreC.totalScore) {
  throw new Error('ÉCHEC : Agent B disponible doit avoir un meilleur score qu’Agent C occupé !');
}

console.log('\n================================================================');
console.log('✅ TOUTES LES ASSERTIONS DE SCORING SMART DISPATCH SONT VALIDÉES !');
console.log('================================================================');

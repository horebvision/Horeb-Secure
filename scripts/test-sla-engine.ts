import {
  calculateAlertSla,
  calculateSingleStepSla,
  formatDurationSeconds,
  DEFAULT_SLA_CONFIG,
} from '../src/lib/sla';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  }
  console.log('✅ PASS:', msg);
}

function testSlaEngine() {
  console.log('--- TEST SLA ENGINE UNITAIRE ---');

  // Test 1: Étape achevée dans les temps (30s <= 60s cible) -> COMPLETED
  const t1 = calculateSingleStepSla(
    'ACKNOWLEDGEMENT',
    '2026-09-30T10:00:00Z',
    '2026-09-30T10:00:30Z'
  );
  assert(t1.status === 'COMPLETED' && t1.elapsedSeconds === 30, 'Completed on time (30s) -> COMPLETED');

  // Test 2: Étape achevée hors délai (90s > 60s cible) -> BREACHED
  const t2 = calculateSingleStepSla(
    'ACKNOWLEDGEMENT',
    '2026-09-30T10:00:00Z',
    '2026-09-30T10:01:30Z'
  );
  assert(t2.status === 'BREACHED' && t2.elapsedSeconds === 90, 'Completed late (90s) -> BREACHED');

  // Test 3: Étape active à risque (50s > 45s warning, < 60s target) -> AT_RISK
  const nowRisk = new Date('2026-09-30T10:00:50Z');
  const t3 = calculateSingleStepSla(
    'ACKNOWLEDGEMENT',
    '2026-09-30T10:00:00Z',
    null,
    nowRisk
  );
  assert(t3.status === 'AT_RISK' && t3.isActive && t3.remainingSeconds === 10, 'Active at risk (50s) -> AT_RISK');

  // Test 4: Étape active dépassée (75s > 60s target) -> BREACHED
  const nowBreached = new Date('2026-09-30T10:01:15Z');
  const t4 = calculateSingleStepSla(
    'ACKNOWLEDGEMENT',
    '2026-09-30T10:00:00Z',
    null,
    nowBreached
  );
  assert(t4.status === 'BREACHED' && t4.isActive && t4.remainingSeconds < 0, 'Active breached (75s) -> BREACHED');

  // Test 5: calculateAlertSla sur un cycle complet d'intervention
  const mockAlert = {
    id: 'alt-001',
    alert_number: 'SEC-2026-TEST',
    status: 'EN_ROUTE',
    created_at: '2026-09-30T12:00:00Z',
    acknowledged_at: '2026-09-30T12:00:30Z', // 30s (OK)
    assigned_at: '2026-09-30T12:01:30Z',     // 60s après ACK (OK)
    en_route_at: '2026-09-30T12:02:15Z',     // 45s après assign (OK)
  };
  const mockIntervention = {
    assigned_at: '2026-09-30T12:01:30Z',
    accepted_at: '2026-09-30T12:01:50Z',     // 20s (OK)
    en_route_at: '2026-09-30T12:02:15Z',     // 25s (OK)
  };

  const nowEnRoute = new Date('2026-09-30T12:05:00Z'); // 2m45s en route (< 10 min)
  const summary = calculateAlertSla(mockAlert, mockIntervention, nowEnRoute);

  assert(summary.steps.ACKNOWLEDGEMENT.status === 'COMPLETED', 'Summary ACK completed');
  assert(summary.steps.ASSIGNMENT.status === 'COMPLETED', 'Summary ASSIGN completed');
  assert(summary.steps.ACCEPTANCE.status === 'COMPLETED', 'Summary ACCEPT completed');
  assert(summary.steps.DEPARTURE.status === 'COMPLETED', 'Summary DEPART completed');
  assert(summary.steps.ARRIVAL.isActive, 'Summary ARRIVAL is current active step');
  assert(summary.steps.ARRIVAL.status === 'NORMAL', 'Summary ARRIVAL is NORMAL (2m45s < 8 min warning)');
  assert(!summary.isBreached, 'Alert is currently not breached');

  // Test 6: Formattage de durées
  assert(formatDurationSeconds(125) === '02:05', 'formatDurationSeconds(125) === 02:05');
  assert(formatDurationSeconds(-45) === '-00:45', 'formatDurationSeconds(-45) === -00:45');

  console.log('🎉 TOUS LES TESTS UNITAIRES DU MOTEUR SLA ONT RÉUSSI !');
}

testSlaEngine();

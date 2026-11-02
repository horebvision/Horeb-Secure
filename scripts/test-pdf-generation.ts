import { buildProofOfIntervention, generateProofOfInterventionPdf } from '../src/lib/interventions';
import * as fs from 'fs';

async function testPdf() {
  console.log('--- TEST GÉNÉRATION PDF PROOF OF INTERVENTION ---');

  const mockProof = buildProofOfIntervention({
    alert: {
      id: 'alt-test-pdf-1234',
      alert_number: 'SEC-2026-9901',
      type: 'INTRUSION',
      priority: 'CRITICAL',
      status: 'RESOLVED',
      created_at: '2026-09-30T09:00:00Z',
      acknowledged_at: '2026-09-30T09:00:45Z',
      assigned_at: '2026-09-30T09:01:30Z',
      en_route_at: '2026-09-30T09:02:15Z',
      arrived_at: '2026-09-30T09:08:45Z',
      resolved_at: '2026-09-30T09:22:10Z',
      location_address: 'Résidence Les Palmiers, Cocody Danga, Abidjan',
      latitude: 5.3484,
      longitude: -4.0305,
      resolution_report: JSON.stringify({
        version: '2.0',
        report_status: 'REPORT_VALIDATED',
        findings: 'Tentative d’intrusion confirmée sur la baie vitrée du rez-de-chaussée.',
        actions_taken: 'Interpellation d’un individu suspect en fuite, périmètre sécurisé, levée de doute effectuée.',
        outcome: 'Résidence intacte, accès consolidé avec le gardien de la villa.',
        observations: 'Le suspect a fui vers le boulevard Latrille lors de l’arrivée du gyrophare.',
        damages: 'Poignée de la baie vitrée dégradée, aucune effraction intérieure.',
        recommendations: 'Installation recommandée d’un détecteur infrarouge extérieur et éclairage asservi.',
        checklist: [
          { id: 'site_access_checked', label: 'Accès et portail vérifiés', checked: true },
          { id: 'perimeter_checked', label: 'Ronde périmétrique effectuée', checked: true },
          { id: 'openings_checked', label: 'Issues et baies vitrées contrôlées', checked: true },
          { id: 'threat_neutralized', label: 'Menace ou fausse alarme qualifiée', checked: true },
          { id: 'site_secured', label: 'Périmètre sécurisé et remis sous alarme', checked: true },
          { id: 'resident_contacted', label: 'Résident / Client contacté et informé', checked: true },
          { id: 'authorities_contacted', label: 'Forces de l’ordre avisées si nécessaire (170)', checked: true },
        ],
        photos: [],
        gps: {
          arrival_latitude: 5.34842,
          arrival_longitude: -4.03051,
          accuracy: 6,
        },
        validation: {
          validated_at: '2026-09-30T09:25:00Z',
          validated_by: 'soc-manager-001',
          validator_name: 'Commandant Kouassi (SOC SECURIA)',
          notes: 'Dossier complet certifié conforme pour transmission au client et assurance.',
        },
      }),
      users: {
        id: 'usr-client-001',
        full_name: 'M. Jean-Philippe N’Guessan',
        phone: '+225 07 08 09 10 11',
        email: 'jp.nguessan@example.com',
      },
      protected_sites: {
        id: 'site-001',
        name: 'Villa N’Guessan — Cocody',
        address: 'Rue des Jardins, Cocody Danga, Abidjan',
        city: 'Abidjan',
        latitude: 5.3484,
        longitude: -4.0305,
      },
    },
    agent: {
      id: 'agt-001',
      badge_number: 'AGT-ABJ-772',
      patrol_vehicle: 'Patrouille Moto Yamaha 250cc (Matricule 4421-CI)',
      duty_status: 'AVAILABLE',
      users: {
        full_name: 'Sergent Bakayoko Mamadou',
        phone: '+225 05 44 33 22 11',
      },
    },
    events: [
      { id: 'ev1', event_type: 'ALERT_CREATED', created_at: '2026-09-30T09:00:00Z' },
      { id: 'ev2', event_type: 'ALERT_ACKNOWLEDGED', created_at: '2026-09-30T09:00:45Z' },
      { id: 'ev3', event_type: 'AGENT_ASSIGNED', created_at: '2026-09-30T09:01:30Z' },
      { id: 'ev4', event_type: 'AGENT_ARRIVED', created_at: '2026-09-30T09:08:45Z' },
      { id: 'ev5', event_type: 'REPORT_SUBMITTED', created_at: '2026-09-30T09:22:10Z' },
      { id: 'ev6', event_type: 'REPORT_VALIDATED', created_at: '2026-09-30T09:25:00Z' },
    ],
  });

  const pdfBuffer = await generateProofOfInterventionPdf(mockProof);
  console.log('PDF généré avec succès ! Taille du buffer :', pdfBuffer.length, 'octets');

  if (pdfBuffer.length < 1000) {
    throw new Error('PDF trop court, possible corruption');
  }

  // Écrire un fichier test pour validation
  fs.writeFileSync('test_output_proof.pdf', pdfBuffer);
  console.log('✅ Fichier sauvegardé sous test_output_proof.pdf');
}

testPdf().catch(console.error);

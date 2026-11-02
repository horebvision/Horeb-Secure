/**
 * SECURIA V2 — CSV BUILDER FOR EXPORT CENTER
 * Produit le fichier CSV récapitulatif avec les 27 colonnes minimales certifiées (Section 8).
 * Échappement RFC 4180 et BOM UTF-8 pour compatibilité Excel internationale.
 */

import { ProofOfIntervention } from '@/lib/interventions/types';
import { InterventionCsvRow } from './types';
import { format } from 'date-fns';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(';') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function proofToCsvRow(proof: ProofOfIntervention, signatureStatus = 'NOT_SIGNED'): InterventionCsvRow {
  const perf = proof.performance;
  const chrono = proof.chronology;

  return {
    intervention_number: proof.intervention_number,
    intervention_id: proof.id,
    date: format(new Date(proof.created_at), 'yyyy-MM-dd'),
    organization: proof.organization_name || 'SECURIA',
    client: proof.client.full_name || 'Client',
    site: proof.site.name || 'Site',
    incident_type: proof.incident_label || proof.incident_type,
    severity: proof.priority || 'MEDIUM',
    agent: proof.agent.full_name || 'Non assigné',
    vehicle: proof.agent.patrol_vehicle || 'Non assigné',
    created_at: proof.created_at || '',
    acknowledged_at: chrono.t2_acknowledged || '',
    assigned_at: chrono.t3_assigned || '',
    accepted_at: chrono.t4_agent_accepted || '',
    departed_at: chrono.t5_en_route || '',
    arrived_at: chrono.t6_arrived || '',
    resolved_at: proof.resolved_at || '',
    ack_duration: perf.formatted.time_to_ack || '0s',
    assignment_duration: perf.formatted.time_to_assign || '0s',
    travel_duration: perf.formatted.travel_time || '0s',
    arrival_duration: perf.formatted.total_arrival || '0s',
    resolution_duration: perf.formatted.on_site_duration || '0s',
    total_duration: perf.formatted.total_intervention || '0s',
    arrival_sla_status: perf.sla.arrival_sla || 'PENDING',
    total_sla_status: perf.sla.total_sla || 'PENDING',
    report_status: proof.report.report_status || 'REPORT_DRAFT',
    signature_status: signatureStatus,
  };
}

export function generateInterventionsCsv(rows: InterventionCsvRow[]): string {
  const headers: (keyof InterventionCsvRow)[] = [
    'intervention_number',
    'intervention_id',
    'date',
    'organization',
    'client',
    'site',
    'incident_type',
    'severity',
    'agent',
    'vehicle',
    'created_at',
    'acknowledged_at',
    'assigned_at',
    'accepted_at',
    'departed_at',
    'arrived_at',
    'resolved_at',
    'ack_duration',
    'assignment_duration',
    'travel_duration',
    'arrival_duration',
    'resolution_duration',
    'total_duration',
    'arrival_sla_status',
    'total_sla_status',
    'report_status',
    'signature_status',
  ];

  const headerLine = headers.map(h => escapeCsvField(h)).join(';');
  const dataLines = rows.map(row => headers.map(h => escapeCsvField(row[h])).join(';'));

  // BOM UTF-8 pour Excel (\uFEFF)
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

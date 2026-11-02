/**
 * SECURIA V2 — PHASE 3 : PROOF OF INTERVENTION
 * Types et interfaces pour le dossier numérique certifié de preuve d'intervention.
 */

import { AlertPriority, AlertStatus, AlertType } from '@/modules/alerts/types';
import { AlertSlaSummary, SlaStatus } from '@/lib/sla';

export type ReportStatus = 'REPORT_DRAFT' | 'REPORT_SUBMITTED' | 'REPORT_VALIDATED';

export interface ReportChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  checked_at?: string;
}

export interface ReportPhoto {
  id: string;
  url: string; // Data URI base64 ou URL signée Supabase Storage
  caption?: string;
  timestamp: string;
  author_name?: string;
}

export interface ReportValidation {
  validated_at?: string | null;
  validated_by?: string | null;
  validator_name?: string | null;
  notes?: string | null;
}

export interface ReportSignature {
  id: string;
  report_version: number;
  signer_name: string;
  signer_role: string;
  signed_at: string;
  signature_image: string;
  signature_hash: string;
  signature_fingerprint: string;
  consent_text: string;
  status: 'SIGNED' | 'REVOKED';
  revoked_at?: string | null;
  revoked_reason?: string | null;
  revoked_by_name?: string | null;
}

export interface StructuredAgentReport {
  version: '2.0';
  report_version?: number;
  report_status: ReportStatus;
  findings: string;            // Constat
  actions_taken: string;       // Actions effectuées
  outcome: string;             // Résultat / Situation finale
  observations?: string;       // Observations particulières
  damages?: string;            // Dommages constatés
  recommendations?: string;    // Recommandations de sécurité
  checklist: ReportChecklistItem[];
  photos: ReportPhoto[];
  gps?: {
    arrival_latitude?: number | null;
    arrival_longitude?: number | null;
    departure_latitude?: number | null;
    departure_longitude?: number | null;
    accuracy?: number | null;
  };
  validation?: ReportValidation;
  signature?: ReportSignature | null;
}

export interface ProofTimelineMilestone {
  key: string;
  label: string;
  timestamp: string | null;
  formattedTime: string;
  formattedDate: string;
  isCompleted: boolean;
  durationFromPreviousSec?: number;
  formattedDuration?: string;
  slaStatus?: SlaStatus;
}

export interface ProofOfIntervention {
  // 1. Généralités
  id: string;
  intervention_number: string;
  alert_id: string;
  alert_number: string;
  organization_id?: string | null;
  organization_name: string;
  
  // Incident & Client
  incident_type: AlertType;
  incident_label: string;
  priority: AlertPriority;
  status: string;
  created_at: string;
  resolved_at?: string | null;
  
  client: {
    id: string;
    full_name: string;
    phone: string;
    email?: string;
  };
  
  site: {
    id?: string;
    name: string;
    address: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
    access_instructions?: string | null;
  };

  // 2. Patrouilleur
  agent: {
    id: string;
    full_name: string;
    badge_number: string;
    phone?: string;
    patrol_vehicle: string;
    status_at_dispatch?: string;
  };

  // 3. Télémétrie GPS
  gps: {
    site_coordinates: [number, number] | null;
    arrival_coordinates: [number, number] | null;
    departure_coordinates: [number, number] | null;
    accuracy_meters?: number | null;
    recorded_at?: string | null;
  };

  // 4. Chronologie T0 à T7
  chronology: {
    t0_alert_created: string;
    t1_alert_received: string | null;
    t2_acknowledged: string | null;
    t3_assigned: string | null;
    t4_agent_accepted: string | null;
    t5_en_route: string | null;
    t6_arrived: string | null;
    t7_resolved: string | null;
    milestones: ProofTimelineMilestone[];
  };

  // 5. Métriques Opérationnelles & SLA (Moteur Phase 2)
  performance: {
    time_to_ack_sec: number;
    time_to_assign_sec: number;
    time_to_accept_sec: number;
    time_to_departure_sec: number;
    travel_time_sec: number;
    time_to_arrival_sec: number; // T0 -> T6
    on_site_duration_sec: number; // T6 -> T7
    total_intervention_sec: number; // T0 -> T7
    formatted: {
      time_to_ack: string;
      time_to_assign: string;
      travel_time: string;
      total_arrival: string;
      on_site_duration: string;
      total_intervention: string;
    };
    sla: {
      arrival_sla: SlaStatus;
      total_sla: SlaStatus;
      arrival_target_sec: number;
      total_target_sec: number;
      arrival_remaining_sec: number;
      summary: AlertSlaSummary;
    };
  };

  // 6. Rapport d'Intervention Agent
  report: StructuredAgentReport;

  // 7. Piste d'Audit & Journal
  audit: {
    created_at: string;
    submitted_at?: string | null;
    validated_at?: string | null;
    validated_by_name?: string | null;
    generated_at: string;
    events_count: number;
  };

  // 8. Signature Électronique Tactile (Phase 4)
  signature?: any;

  // 9. Preuve & Référence Vidéo Détectée (Phase 8)
  video_evidence?: {
    video_event_id?: string;
    camera_id?: string;
    camera_name?: string;
    video_source?: string;
    video_event_timestamp?: string;
    snapshot_url?: string;
    event_type?: string;
  };
}

export const DEFAULT_CHECKLIST: ReportChecklistItem[] = [
  { id: 'site_access_checked', label: 'Accès et portail vérifiés', checked: false },
  { id: 'perimeter_checked', label: 'Ronde périmétrique effectuée', checked: false },
  { id: 'openings_checked', label: 'Issues et baies vitrées contrôlées', checked: false },
  { id: 'threat_neutralized', label: 'Menace ou fausse alarme qualifiée', checked: false },
  { id: 'site_secured', label: 'Périmètre sécurisé et remis sous alarme', checked: false },
  { id: 'resident_contacted', label: 'Résident / Client contacté et informé', checked: false },
  { id: 'authorities_contacted', label: 'Forces de l’ordre avisées si nécessaire (170)', checked: false },
];

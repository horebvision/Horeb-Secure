/**
-- SECURIA V2 — PHASE 4 : EXPORT CENTER TYPES
*/

import { SlaStatus } from '@/lib/sla';
import { AlertType, AlertPriority } from '@/modules/alerts/types';
import { ReportStatus } from '@/lib/interventions/types';

export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  siteId?: string;
  status?: string;
  incidentType?: AlertType | string;
  severity?: AlertPriority | string;
  slaStatus?: SlaStatus | string;
  agentId?: string;
  clientId?: string;
  searchQuery?: string;
  organizationId?: string;
  includePhotos?: boolean;
}

export interface ExportJob {
  id: string;
  organization_id: string;
  requested_by: string;
  status: ExportStatus;
  filters: ExportFilters;
  total_items: number;
  processed_items: number;
  file_path?: string | null;
  download_token?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  expires_at: string;
  error_message?: string | null;
}

export interface InterventionCsvRow {
  intervention_number: string;
  intervention_id: string;
  date: string;
  organization: string;
  client: string;
  site: string;
  incident_type: string;
  severity: string;
  agent: string;
  vehicle: string;
  created_at: string;
  acknowledged_at: string;
  assigned_at: string;
  accepted_at: string;
  departed_at: string;
  arrived_at: string;
  resolved_at: string;
  ack_duration: string;
  assignment_duration: string;
  travel_duration: string;
  arrival_duration: string;
  resolution_duration: string;
  total_duration: string;
  arrival_sla_status: string;
  total_sla_status: string;
  report_status: string;
  signature_status: string;
}

export interface ExportPreviewSummary {
  total_count: number;
  period: {
    start: string | null;
    end: string | null;
  };
  sites_count: number;
  sla_respected_count: number;
  sla_breached_count: number;
  interventions: Array<{
    id: string;
    number: string;
    date: string;
    site_name: string;
    client_name: string;
    incident_type: string;
    status: string;
    sla_status: string;
  }>;
}

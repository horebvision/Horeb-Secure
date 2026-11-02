import { AlertStatus } from '../alerts/types';

export type InterventionStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'COMPLETED'
  | 'ABORTED';

export type InterventionAction =
  | 'ACCEPT'
  | 'DEPART'
  | 'ARRIVE'
  | 'COMPLETE'
  | 'ABORT';

export interface AssignAgentDto {
  alert_id: string;
  agent_id: string;
  dispatcher_id?: string;
  notes?: string;
}

export interface UpdateInterventionStatusDto {
  alert_id: string;
  agent_id?: string;
  action: InterventionAction;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export interface InterventionReport {
  alert_id: string;
  agent_id: string;
  report_text: string;
  resolved_at: string;
}

export interface Intervention {
  id: string;
  alert_id: string;
  security_center_id?: string | null;
  agent_id: string;
  status: InterventionStatus;
  client_organization_id?: string | null;
  provider_organization_id?: string | null;
  organization_id?: string | null;
  mission_type?: string;
  assigned_at?: string | null;
  accepted_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  resolved_at?: string | null;
  report?: string | null;
  created_at: string;
  updated_at: string;
}

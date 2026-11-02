import { Profile } from '../users/types';
import { ProtectedSite } from '../protected-sites/types';
import { Organization } from '../organizations/types';

export type AlertType =
  | 'INTRUSION'
  | 'MENACE'
  | 'AGRESSION'
  | 'PERSONNE_SUSPECTE'
  | 'URGENCE';

export type AlertPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AlertStatus =
  | 'CREATED'
  | 'SENT'
  | 'RECEIVED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'FALSE_ALARM'
  | 'ESCALATED';

export interface Alert {
  id: string;
  alert_number: string;
  user_id: string;
  site_id?: string | null;
  organization_id?: string | null;
  type: AlertType;
  priority: AlertPriority;
  status: AlertStatus;
  latitude?: number | null;
  longitude?: number | null;
  location_address?: string | null;
  is_silent: boolean;
  client_notes?: string | null;
  assigned_agent_id?: string | null;
  acknowledged_at?: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  resolved_at?: string | null;
  resolution_report?: string | null;
  security_center_id?: string | null;
  idempotency_key?: string | null;
  escalation_deadline?: string | null;
  escalated_at?: string | null;
  created_at: string;
  updated_at: string;

  // Hydratations optionnelles
  user?: Profile;
  site?: ProtectedSite;
  assigned_agent?: Profile;
  organization?: Organization;
}

export interface TriggerAlertDto {
  type: AlertType;
  site_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_address?: string | null;
  is_silent?: boolean;
  client_notes?: string | null;
  idempotency_key?: string | null;
}

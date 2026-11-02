import { AlertStatus } from '../alerts/types';
import { Profile } from '../users/types';

export interface AlertEvent {
  id: string;
  alert_id: string;
  actor_id?: string | null;
  from_status?: AlertStatus | null;
  to_status?: AlertStatus | null;
  event_type: string;
  comment?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;

  // Jointure
  actor?: Profile;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  resource: string;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  created_at: string;
}

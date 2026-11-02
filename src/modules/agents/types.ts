import { Profile } from '../users/types';

export type AgentDutyStatus = 'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED';

export interface AgentProfile extends Profile {
  agent_status: AgentDutyStatus;
  duty_status?: AgentDutyStatus;
  patrol_vehicle?: string;
  current_alert_id?: string | null;
}

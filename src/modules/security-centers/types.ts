import { AlertPriority, AlertType } from '../alerts/types';

export type DispatchQueueFilter = 'ALL' | 'ACTIVE' | 'CRITICAL' | 'UNASSIGNED';

export interface DispatchFilterCriteria {
  queue: DispatchQueueFilter;
  types?: AlertType[];
  priority?: AlertPriority;
  search?: string;
}

export interface SecurityCenterMetrics {
  incomingCount: number;
  inProgressCount: number;
  resolvedTodayCount: number;
  averageAckTimeSeconds: number;
}

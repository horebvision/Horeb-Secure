export interface PlatformMetrics {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  totalAgents: number;
  availableAgents: number;
  totalSites: number;
  averageResponseTimeSeconds: number;
}

export interface SystemHealth {
  database: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  realtime: 'CONNECTED' | 'DISCONNECTED';
  uptimeSeconds: number;
  lastSyncAt: string;
}

/**
 * SECURIA EDGE VIDEO GATEWAY — TYPES LOCAUX
 */

export interface EdgeGatewayConfig {
  cloudUrl: string;
  gatewayId?: string;
  gatewayCode?: string;
  secretToken?: string;
  organizationId?: string;
  protectedSiteId?: string;
  pairingCode?: string;
  hardwareId: string;
  version: string;
  heartbeatIntervalSec: number;
  discoveryIntervalMin: number;
  localSubnets: string[]; // e.g. ["192.168.1.0/24", "192.168.100.0/24"]
  onvifPorts: number[];    // e.g. [80, 8080, 8000, 8899, 5000]
  rtspPorts: number[];     // e.g. [554, 8554]
  go2rtcApiUrl?: string;  // e.g. "http://127.0.0.1:1984"
  storagePath?: string;   // Local queue file path
}

export interface DiscoveredCamera {
  id?: string;
  ip: string;
  port: number;
  xaddr: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  hardwareId?: string;
  macAddress?: string;
  name: string;
  onvifSupported: boolean;
  rtspSupported: boolean;
  rtspUrl?: string;
  snapshotUrl?: string;
  profiles?: Array<{
    token: string;
    name: string;
    width?: number;
    height?: number;
    encoding?: string;
    rtspUri?: string;
  }>;
  discoveredAt: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED';
}

export interface QueuedVideoEvent {
  id: string;
  event_id: string;
  event_type: string;
  provider: string;
  camera_id?: string;
  camera_internal_id?: string;
  organization_id?: string;
  protected_site_id?: string;
  confidence?: number;
  detected_at: string;
  snapshot_url?: string;
  snapshot_base64?: string;
  metadata?: Record<string, any>;
  offline_buffered: boolean;
  created_at: string;
  retry_count: number;
}

export interface HardwareProbeResult {
  ip: string;
  port: number;
  isReachable: boolean;
  pingLatencyMs?: number;
  onvifDetected: boolean;
  onvifDeviceServiceUrl?: string;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  serialNumber?: string;
  rtspDetected: boolean;
  rtspUriTested?: string;
  snapshotAvailable: boolean;
  testedAt: string;
  diagnosticNotes: string[];
}

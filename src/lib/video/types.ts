/**
 * SECURIA V2 — PHASE 8 : TYPES ET DOMAINE VIDÉO & NVR/VMS (v2.8.0)
 * Définition stricte des types pour les caméras, systèmes vidéo, événements, règles et adaptateurs.
 */

import { AlertType, AlertPriority } from '@/modules/alerts/types';

export type VideoSystemType =
  | 'NVR'
  | 'DVR'
  | 'VMS'
  | 'GATEWAY'
  | 'CLOUD_VMS'
  | 'DIRECT_CAMERA';

export type VideoProtocol =
  | 'ONVIF'
  | 'RTSP_INTERNAL'
  | 'HTTP_API'
  | 'PROPRIETARY_GATEWAY'
  | 'TEST_SIMULATOR';

export type CameraStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'UNKNOWN'
  | 'DEGRADED'
  | 'DISABLED';

export type CameraViewStatus =
  | 'CONNECTING'
  | 'LIVE'
  | 'OFFLINE'
  | 'ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_CONFIGURED';

export type CameraType =
  | 'FIXED'
  | 'PTZ'
  | 'DOME'
  | 'BULLET'
  | 'THERMAL';

export type CameraCapability =
  | 'MOTION'
  | 'PERSON_DETECTION'
  | 'INTRUSION_DETECTION'
  | 'LINE_CROSSING'
  | 'AREA_INTRUSION'
  | 'PTZ'
  | 'NIGHT_VISION'
  | 'AUDIO'
  | 'RECORDING';

export type VideoEventType =
  | 'MOTION_DETECTED'
  | 'PERSON_DETECTED'
  | 'INTRUSION_DETECTED'
  | 'LINE_CROSSING'
  | 'AREA_INTRUSION'
  | 'CAMERA_OFFLINE'
  | 'CAMERA_ONLINE'
  | 'TAMPERING_DETECTED';

export type VideoRuleAction =
  | 'CREATE_ALERT'
  | 'NOTIFY_SOC_ONLY'
  | 'LOG_ONLY'
  | 'IGNORE';

export type VideoEventProcessingStatus =
  | 'RECEIVED'
  | 'CORRELATED'
  | 'ALERT_CREATED'
  | 'IGNORED'
  | 'DUPLICATE';

export interface VideoSystem {
  id: string;
  organization_id: string;
  protected_site_id?: string | null;
  name: string;
  type: VideoSystemType;
  protocol: VideoProtocol;
  host_address?: string | null;
  port?: number | null;
  status: CameraStatus;
  capabilities: string[];
  last_seen_at?: string | null;
  last_health_check_at?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  credentials_encrypted?: Record<string, any>;
}

export interface VideoCamera {
  id: string;
  organization_id: string;
  protected_site_id: string;
  video_system_id?: string | null;
  gateway_id?: string | null;
  name: string;
  internal_id: string; // e.g. CAM-01, channel_1
  manufacturer?: string | null;
  model?: string | null;
  camera_type: CameraType;
  protocol: VideoProtocol;
  stream_internal_url?: string | null; // Jamais transmis au client
  status: CameraStatus;
  is_primary: boolean;
  capabilities: CameraCapability[];
  latitude?: number | null;
  longitude?: number | null;
  location_description?: string | null;
  installation_notes?: string | null;
  last_seen_at?: string | null;
  last_health_check_at?: string | null;
  created_at: string;
  updated_at: string;
  
  // Hydratations optionnelles
  site_name?: string;
  system_name?: string;
}

export interface VideoEventRule {
  id: string;
  organization_id: string;
  protected_site_id: string;
  camera_id?: string | null;
  event_type: VideoEventType | string;
  action: VideoRuleAction;
  target_alert_type: AlertType;
  target_priority: AlertPriority;
  cooldown_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VideoEvent {
  id: string;
  organization_id: string;
  protected_site_id: string;
  camera_id?: string | null;
  video_system_id?: string | null;
  gateway_id?: string | null;
  provider: string; // 'ONVIF' | 'DAHUA' | 'HIKVISION' | 'MILESTONE' | 'AXIS' | 'TEST_VIDEO_PROVIDER'
  event_id: string; // Identifiant unique émis par la source
  event_type: VideoEventType | string;
  confidence?: number | null;
  snapshot_url?: string | null;
  raw_metadata?: Record<string, any>;
  status: VideoEventProcessingStatus;
  correlated_alert_id?: string | null;
  detected_at: string;
  created_at: string;

  // Hydratations
  camera_name?: string;
  site_name?: string;
}

export interface IngestVideoEventPayload {
  provider: string;
  event_id: string;
  organization_id?: string;
  protected_site_id?: string;
  camera_id?: string;
  camera_internal_id?: string;
  event_type: VideoEventType | string;
  confidence?: number;
  detected_at?: string;
  snapshot_url?: string;
  metadata?: Record<string, any>;
}

export interface EphemeralStreamToken {
  token: string;
  expires_at: string;
  camera_id: string;
  site_id: string;
  organization_id: string;
  user_id: string;
  protocol: VideoProtocol;
  stream_relay_url?: string;
}

export type GatewayStatus =
  | 'PENDING'
  | 'PAIRING'
  | 'ONLINE'
  | 'OFFLINE'
  | 'REVOKED'
  | 'ERROR';

export interface GatewayHeartbeatData {
  cpu_pct?: number;
  mem_used_mb?: number;
  mem_total_mb?: number;
  cameras_online?: number;
  cameras_total?: number;
  cameras_status?: Record<string, CameraStatus>;
  uptime_seconds?: number;
  last_discovery_at?: string;
  load_avg?: number[];
  storage_free_mb?: number;
}

export interface VideoGateway {
  id: string;
  organization_id: string;
  protected_site_id: string;
  name: string;
  gateway_code: string;
  pairing_code?: string | null;
  pairing_expires_at?: string | null;
  status: GatewayStatus;
  hardware_id?: string | null;
  version: string;
  last_heartbeat_at?: string | null;
  heartbeat_data?: GatewayHeartbeatData;
  ip_address_local?: string | null;
  capabilities: string[];
  secret_token_hash?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Hydratations UI
  site_name?: string;
  cameras_count?: number;
  cameras_online_count?: number;
}

export interface GatewayHeartbeatPayload {
  gateway_id: string;
  version: string;
  status?: GatewayStatus;
  cpu_pct?: number;
  mem_used_mb?: number;
  mem_total_mb?: number;
  cameras_status?: Record<string, CameraStatus>;
  uptime_seconds?: number;
  ip_address_local?: string;
  timestamp: string;
  queue_length?: number;
}

export interface GatewayPairingRequest {
  pairing_code: string;
  hardware_id: string;
  version: string;
  ip_address_local?: string;
}

export interface GatewayPairingResponse {
  ok: boolean;
  gateway_id: string;
  gateway_code: string;
  organization_id: string;
  protected_site_id: string;
  secret_token: string;
  cloud_url: string;
  heartbeat_interval_seconds: number;
}

export interface GatewayCameraSyncItem {
  internal_id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  camera_type?: CameraType;
  protocol?: VideoProtocol;
  stream_internal_url?: string;
  status?: CameraStatus;
  capabilities?: CameraCapability[];
  ip_address?: string;
  onvif_xaddr?: string;
  snapshot_url?: string;
}


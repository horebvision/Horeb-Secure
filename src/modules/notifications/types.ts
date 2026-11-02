import { UserRole } from '../users/types';

export type NotificationChannel = 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';

export type NotificationDeliveryStatus = 'PENDING' | 'DELIVERED' | 'READ' | 'FAILED';

export type NotificationPriority = 'LOW' | 'MEDIUM' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type NotificationType =
  | 'NEW_ALERT_RECEIVED'       // Nouvelle alerte reçue (pour régulateurs)
  | 'INTERVENTION_ACKNOWLEDGED' // Intervention prise en charge (pour habitant)
  | 'AGENT_ASSIGNED'           // Agent affecté (pour agent et habitant)
  | 'AGENT_EN_ROUTE'           // Agent en route (pour habitant avec ETA)
  | 'AGENT_ARRIVED'            // Agent arrivé (pour habitant et centre)
  | 'INTERVENTION_COMPLETED'   // Intervention terminée (pour habitant et centre)
  | 'AGENT_UNABLE_TO_RESPOND'  // Impossibilité d'intervention (pour centre)
  | 'ALERT_ESCALATED'          // Alerte escaladée
  | 'ADMINISTRATIVE_NOTICE';   // Notice administrative (pour responsable/admin)

export interface NotificationPayload {
  title: string;
  body: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  sound?: boolean;
  vibrate?: boolean;
}

export interface SecuriaNotification {
  id: string;
  user_id: string;
  organization_id?: string | null;
  title: string;
  message: string;
  type: NotificationType | string;
  link?: string | null;
  alert_id?: string | null;
  intervention_id?: string | null;
  agent_id?: string | null;
  role?: UserRole | string | null;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export interface SendNotificationDto {
  user_id: string;
  organization_id?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  alert_id?: string;
  intervention_id?: string;
  agent_id?: string;
  role?: UserRole;
  channels?: NotificationChannel[]; // Permet la diffusion multi-canaux (ex: IN_APP + PUSH + SMS fallback)
  priority?: NotificationPriority;
  metadata?: Record<string, any>;
}

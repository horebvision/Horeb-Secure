/**
 * SECURIA V2 — PHASE 4 : WEBHOOKS & INTEGRATION PARTNERS TYPES
 */

export type PartnerType = 'INSURER' | 'CLIENT_SYSTEM' | 'SECURITY_PARTNER' | 'OTHER';

export type PartnerStatus = 'ACTIVE' | 'INACTIVE';

export type WebhookEventType =
  | 'REPORT_VALIDATED'
  | 'REPORT_SIGNED'
  | 'INTERVENTION_RESOLVED'
  | 'REPORT_PUBLISHED';

export type DeliveryStatus = 'PENDING' | 'SUCCESS' | 'RETRYING' | 'FAILED';

export interface IntegrationPartner {
  id: string;
  organization_id: string;
  name: string;
  type: PartnerType;
  status: PartnerStatus;
  endpoint_url: string;
  secret_hash: string;
  events: WebhookEventType[];
  created_at: string;
  updated_at: string;
  // Non persisté en clair en base, retourné uniquement lors de la création ou rotation
  raw_secret?: string;
  stats?: {
    total_deliveries: number;
    success_count: number;
    failure_count: number;
    last_delivery_at?: string | null;
  };
}

export interface WebhookDelivery {
  id: string;
  partner_id: string;
  organization_id: string;
  event_id: string;
  event_type: WebhookEventType | string;
  status: DeliveryStatus;
  attempt_count: number;
  response_code?: number | null;
  last_error?: string | null;
  payload: any;
  next_retry_at?: string | null;
  created_at: string;
  sent_at?: string | null;
  completed_at?: string | null;
}

export interface WebhookPayload {
  event: WebhookEventType | string;
  event_id: string;
  timestamp: string;
  organization_id: string;
  test?: boolean;
  intervention: {
    id: string;
    number: string;
    site: string;
    incident_type: string;
    severity: string;
    status: string;
  };
  report: {
    status: string;
    version: number;
  };
  sla: {
    arrival_status: string;
    total_status: string;
  };
  document: {
    available: boolean;
    download_url?: string | null;
  };
}

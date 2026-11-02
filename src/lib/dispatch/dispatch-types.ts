/**
 * SECURIA V2 — SMART DISPATCH ENGINE
 * Types et interfaces pour le moteur de recommandation et de scoring.
 */

import { AgentDutyStatus } from '@/modules/agents/types';
import { AlertType, AlertPriority, AlertStatus } from '@/modules/alerts/types';

export interface DispatchGpsPoint {
  latitude: number | null;
  longitude: number | null;
  accuracy?: number | null;
  updatedAt?: string | null;
}

export interface DispatchAgentInput {
  id: string; // security_agents.id
  userId: string; // users.id
  organizationId: string;
  fullName: string;
  badgeNumber: string;
  phone?: string | null;
  email?: string | null;
  dutyStatus: AgentDutyStatus;
  patrolVehicle?: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLocationUpdate?: string | null;
  isActive: boolean;
  activeInterventionsCount?: number;
}

export interface DispatchAlertInput {
  id: string; // alerts.id
  alertNumber: string;
  organizationId: string;
  type: AlertType;
  priority: AlertPriority;
  status: AlertStatus;
  latitude: number | null;
  longitude: number | null;
  locationAddress?: string | null;
  clientNotes?: string | null;
  assignedAgentId?: string | null;
  createdAt: string;
  siteName?: string | null;
  clientName?: string | null;
}

export interface DispatchContext {
  now?: Date;
  emergencySpeedKmh?: number;
  standardSpeedKmh?: number;
  trafficMarginPercent?: number;
  maxDistanceKmThreshold?: number;
  allowBusyAgents?: boolean;
}

export interface DispatchScoreBreakdown {
  availability: number; // Max 30
  distance: number; // Max 30
  gpsFreshness: number; // Max 15
  workload: number; // Max 15
  operationalStatus: number; // Max 10
}

export interface DispatchCandidate {
  agentId: string;
  userId: string;
  agentName: string;
  badgeNumber: string;
  phone: string;
  email: string;
  patrolVehicle: string;
  dutyStatus: AgentDutyStatus;
  organizationId: string;

  // Géographie et ETA
  distanceKm: number | null;
  formattedDistance: string;
  estimatedArrivalMinutes: number | null;
  formattedEta: string;

  // Télémétrie GPS
  hasGps: boolean;
  gpsAgeSeconds: number | null;
  gpsFreshnessLabel: string;
  gpsStatus: 'REALTIME' | 'RECENT' | 'ACCEPTABLE' | 'STALE' | 'UNKNOWN';

  // Charge opérationnelle
  activeInterventionsCount: number;

  // Score explicable (0 à 100)
  totalScore: number;
  scoreBreakdown: DispatchScoreBreakdown;

  // Explications SOC
  reasons: string[];
  warnings: string[];
  isEligible: boolean;
  ineligibilityReason?: string;
}

export interface SmartDispatchRecommendation {
  alertId: string;
  alertNumber: string;
  organizationId: string;
  alertPriority: AlertPriority;
  alertType: AlertType;
  alertStatus?: AlertStatus;
  locationAddress: string;
  siteName?: string | null;
  clientName?: string | null;
  securityCenter?: {
    id: string;
    name: string;
    code: string;
    is_active: boolean;
  } | null;
  securityCenters?: Array<{
    id: string;
    name: string;
    code: string;
    is_active: boolean;
  }>;
  recommendedAgent: DispatchCandidate | null;
  candidates: DispatchCandidate[];
  totalCandidatesEvaluated: number;
  eligibleCandidatesCount: number;
  generatedAt: string;
}

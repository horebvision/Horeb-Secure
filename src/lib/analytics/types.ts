/**
 * SECURIA V2 — PHASE 5 : SECURITY BUSINESS OS ANALYTICS TYPES
 */

import { SlaStatus } from '@/lib/sla/sla-types';

export type DateRangeKey = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface AnalyticsFilterInput {
  organizationId: string;
  dateRange?: DateRangeKey;
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  siteId?: string;
  clientId?: string;
  incidentType?: string;
  severity?: string;
  agentId?: string;
}

export interface DateRangeResolved {
  key: DateRangeKey;
  startDate: Date;
  endDate: Date;
  label: string;
  previousStartDate: Date;
  previousEndDate: Date;
}

/**
 * 17 KPIs Exécutifs de Direction (Section 4)
 */
export interface ExecutiveKpiSummary {
  // Volume & Criticité
  totalAlerts: number;
  totalInterventions: number;
  criticalAlertsCount: number;

  // Délais Opérationnels Moyens (en secondes ou formaté)
  avgAckDurationSeconds: number | null;
  formattedAvgAckDuration: string;
  avgAssignDurationSeconds: number | null;
  formattedAvgAssignDuration: string;
  avgAcceptDurationSeconds: number | null;
  formattedAvgAcceptDuration: string;
  avgDepartDurationSeconds: number | null;
  formattedAvgDepartDuration: string;
  avgArrivalDurationSeconds: number | null;
  formattedAvgArrivalDuration: string;
  avgResolutionDurationSeconds: number | null;
  formattedAvgResolutionDuration: string;

  // Taux de Performance & Qualité
  slaComplianceRatePct: number | null; // % des alertes dont le SLA est respecté
  resolutionRatePct: number | null;     // % résolues
  falseAlarmRatePct: number | null;     // % fausses alertes

  // Ressources Actives
  activeAgentsCount: number;
  availableAgentsCount: number;
  busyAgentsCount: number;
  protectedSitesCount: number;
  activeClientsCount: number;

  // Comparaison période précédente (% d'évolution)
  trends: {
    alertsEvolutionPct: number | null;
    interventionsEvolutionPct: number | null;
    slaEvolutionPct: number | null;
  };
}

/**
 * Données chronologiques de tendances pour graphiques
 */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  alerts: number;
  interventions: number;
  slaRespected: number;
  slaBreached: number;
  avgArrivalSeconds: number | null;
}

/**
 * Répartition par catégorie
 */
export interface CategoryBreakdown {
  label: string;
  count: number;
  percentage: number;
}

/**
 * Operations Analytics (Section 6)
 */
export interface OperationsAnalytics {
  volume: {
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
  };
  durations: {
    averageSeconds: number | null;
    medianSeconds: number | null;
    minSeconds: number | null;
    maxSeconds: number | null;
    formattedAverage: string;
    formattedMedian: string;
  };
  hourlyDistribution: { hour: number; count: number }[];
  dailyDistribution: { dayOfWeek: string; count: number }[];
  byType: CategoryBreakdown[];
  bySeverity: CategoryBreakdown[];
  bySite: { siteId: string; siteName: string; count: number }[];
}

/**
 * SLA Analytics (Section 7)
 */
export interface SlaAnalyticsSummary {
  overallCompliancePct: number | null;
  statusBreakdown: {
    completedOrNormal: number;
    atRisk: number;
    breached: number;
  };
  siteSlaTable: {
    siteId: string;
    siteName: string;
    interventionsCount: number;
    slaRespectedCount: number;
    slaBreachedCount: number;
    compliancePct: number | null;
    avgArrivalSeconds: number | null;
    formattedAvgArrival: string;
  }[];
  agentSlaTable: {
    agentId: string;
    agentName: string;
    interventionsCount: number;
    slaRespectedCount: number;
    slaBreachedCount: number;
    compliancePct: number | null;
    avgArrivalSeconds: number | null;
    formattedAvgArrival: string;
  }[];
  stepsBreakdown: {
    stepKey: string;
    label: string;
    targetSeconds: number;
    averageElapsedSeconds: number | null;
    formattedAvgElapsed: string;
    compliancePct: number | null;
  }[];
}

/**
 * Performance des Agents (Section 8)
 */
export interface AgentPerformanceRecord {
  agentId: string;
  userId: string;
  fullName: string;
  badgeNumber: string;
  patrolVehicle: string;
  dutyStatus: string;
  lastActiveAt?: string | null;
  interventionsAssigned: number;
  interventionsAccepted: number;
  interventionsCompleted: number;
  acceptanceRatePct: number | null;
  avgAcceptSeconds: number | null;
  avgDepartSeconds: number | null;
  avgArrivalSeconds: number | null;
  avgResolutionSeconds: number | null;
  slaCompliancePct: number | null;
  slaRespectedCount: number;
  slaBreachedCount: number;
}

/**
 * Risque & Heatmap Jour x Heure (Section 10 & 11)
 */
export interface RiskHeatmapCell {
  dayIndex: number; // 0 = Lundi, 6 = Dimanche
  dayName: string;
  hour: number;     // 0 à 23
  count: number;
  criticalCount: number;
}

export interface SiteIncidentRisk {
  siteId: string;
  siteName: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  totalIncidents: number;
  criticalIncidents: number;
  lastIncidentDate?: string | null;
  dominantIncidentType: string;
  slaCompliancePct: number | null;
}

export interface RiskAnalyticsSummary {
  heatmapMatrix: RiskHeatmapCell[];
  peakRiskPeriod: string; // e.g. "Vendredi entre 22h et 02h"
  topIncidentSites: SiteIncidentRisk[];
  concentrationZones: {
    zoneName: string;
    incidentCount: number;
    percentage: number;
  }[];
}

/**
 * Paramètres Financiers d'Organisation (Section 12 & 13)
 */
export interface OrganizationFinancialSettings {
  id?: string;
  organization_id: string;
  currency: string;
  agent_hourly_cost: number | null;       // Coût horaire agent chargé
  vehicle_hourly_cost: number | null;     // Coût horaire véhicule
  fixed_intervention_cost: number | null; // Forfait fixe par déploiement
  cost_per_kilometer: number | null;      // Coût par km
  default_billing_rate: number | null;    // Tarif de facturation client par intervention
  target_gross_margin_pct: number | null; // Cible de marge brute en %
  updated_at?: string;
}

/**
 * Rentabilité & Financial Analytics (Section 13)
 */
export interface FinancialAnalyticsSummary {
  isConfigured: boolean;
  currency: string;
  settings: OrganizationFinancialSettings | null;
  
  // Totaux de la période (estimés)
  totalInterventionsCount: number;
  totalEstimatedRevenue: number | null;
  totalEstimatedCost: number | null;
  estimatedGrossMargin: number | null;
  estimatedGrossMarginPct: number | null;

  // Moyennes par intervention
  avgEstimatedRevenuePerIntervention: number | null;
  avgEstimatedCostPerIntervention: number | null;
  avgEstimatedMarginPerIntervention: number | null;

  // Breakdown des coûts estimés
  costBreakdown: {
    agentCost: number;
    vehicleCost: number;
    fixedCost: number;
  } | null;

  // Facturations et rentabilité par site
  siteProfitabilityTable: {
    siteId: string;
    siteName: string;
    interventionsCount: number;
    estimatedRevenue: number | null;
    estimatedCost: number | null;
    estimatedMargin: number | null;
    estimatedMarginPct: number | null;
  }[];
}

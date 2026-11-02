/**
 * SECURIA V2 — PHASE 5 : CENTRAL ANALYTICS SERVICE
 * Agrège les métriques opérationnelles, SLA, performance agents, risque et rentabilité.
 * RÈGLE ABSOLUE : Données réelles PostgreSQL exclusivement. Aucune donnée fictive.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { calculateAlertSla } from '@/lib/sla';
import {
  AnalyticsFilterInput,
  ExecutiveKpiSummary,
  TrendPoint,
  OperationsAnalytics,
  SlaAnalyticsSummary,
  AgentPerformanceRecord,
  RiskAnalyticsSummary,
  FinancialAnalyticsSummary,
  OrganizationFinancialSettings,
  RiskHeatmapCell,
} from './types';
import { resolveDateRange, formatDurationToMinutesOrSeconds } from './date-ranges';

export class AnalyticsService {
  /**
   * 1. 17 KPIs Exécutifs de Direction (Section 4)
   */
  static async getExecutiveKpis(filters: AnalyticsFilterInput): Promise<{
    kpis: ExecutiveKpiSummary;
    trends: TrendPoint[];
    periodLabel: string;
  }> {
    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);
    const orgId = filters.organizationId;

    // Récupération des alertes et interventions de la période courante
    let alertsQuery = supabaseAdmin
      .from('alerts')
      .select('id, alert_number, type, priority, status, created_at, acknowledged_at, assigned_at, en_route_at, arrived_at, resolved_at, site_id, user_id, assigned_agent_id')
      .eq('organization_id', orgId)
      .gte('created_at', range.startDate.toISOString())
      .lte('created_at', range.endDate.toISOString());

    if (filters.siteId) alertsQuery = alertsQuery.eq('site_id', filters.siteId);
    if (filters.clientId) alertsQuery = alertsQuery.eq('user_id', filters.clientId);
    if (filters.incidentType) alertsQuery = alertsQuery.eq('type', filters.incidentType);
    if (filters.severity) alertsQuery = alertsQuery.eq('priority', filters.severity);
    if (filters.agentId) alertsQuery = alertsQuery.eq('assigned_agent_id', filters.agentId);

    // Alertes de la période précédente pour comparaison de tendances
    const prevAlertsQuery = supabaseAdmin
      .from('alerts')
      .select('id, status, created_at', { count: 'exact' })
      .eq('organization_id', orgId)
      .gte('created_at', range.previousStartDate.toISOString())
      .lte('created_at', range.previousEndDate.toISOString());

    // Interventions de la période courante
    const interventionsQuery = supabaseAdmin
      .from('interventions')
      .select('id, alert_id, status, assigned_at, accepted_at, en_route_at, arrived_at, resolved_at, created_at, agent_id')
      .gte('created_at', range.startDate.toISOString())
      .lte('created_at', range.endDate.toISOString());

    // Interventions de la période précédente
    const prevInterventionsQuery = supabaseAdmin
      .from('interventions')
      .select('id', { count: 'exact' })
      .gte('created_at', range.previousStartDate.toISOString())
      .lte('created_at', range.previousEndDate.toISOString());

    // Agents, sites et clients
    const agentsQuery = supabaseAdmin
      .from('security_agents')
      .select('id, duty_status, user:users(id, organization_id)')
      .limit(100);

    const sitesQuery = supabaseAdmin
      .from('protected_sites')
      .select('id', { count: 'exact' })
      .eq('organization_id', orgId);

    const clientsQuery = supabaseAdmin
      .from('users')
      .select('id', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('role', 'USER');

    const [
      alertsRes,
      prevAlertsRes,
      intRes,
      prevIntRes,
      agentsRes,
      sitesRes,
      clientsRes,
    ] = await Promise.all([
      alertsQuery,
      prevAlertsQuery,
      interventionsQuery,
      prevInterventionsQuery,
      agentsQuery,
      sitesQuery,
      clientsQuery,
    ]);

    const alerts = alertsRes.data || [];
    const interventions = intRes.data || [];
    const prevAlertsCount = prevAlertsRes.count || (prevAlertsRes.data?.length ?? 0);
    const prevIntCount = prevIntRes.count || (prevIntRes.data?.length ?? 0);

    // Map interventions par alert_id
    const intByAlertId = new Map<string, any>();
    interventions.forEach((int) => {
      if (int.alert_id) intByAlertId.set(int.alert_id, int);
    });

    // 1. Calculs des délais opérationnels moyens
    let totalAck = 0, countAck = 0;
    let totalAssign = 0, countAssign = 0;
    let totalAccept = 0, countAccept = 0;
    let totalDepart = 0, countDepart = 0;
    let totalArrival = 0, countArrival = 0;
    let totalResolution = 0, countResolution = 0;

    let slaRespectedCount = 0;
    let resolvedCount = 0;
    let falseAlarmCount = 0;
    let criticalCount = 0;

    alerts.forEach((alert) => {
      const relatedInt = intByAlertId.get(alert.id);
      const sla = calculateAlertSla(alert, relatedInt);

      if (alert.priority === 'CRITICAL' || alert.priority === 'HIGH') {
        criticalCount++;
      }
      if (alert.status === 'RESOLVED') {
        resolvedCount++;
      }
      if (alert.status === 'FALSE_ALARM') {
        falseAlarmCount++;
      }

      if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') {
        slaRespectedCount++;
      }

      // Step delays
      if (sla.steps.ACKNOWLEDGEMENT.isCompleted && sla.steps.ACKNOWLEDGEMENT.elapsedSeconds > 0) {
        totalAck += sla.steps.ACKNOWLEDGEMENT.elapsedSeconds;
        countAck++;
      }
      if (sla.steps.ASSIGNMENT.isCompleted && sla.steps.ASSIGNMENT.elapsedSeconds > 0) {
        totalAssign += sla.steps.ASSIGNMENT.elapsedSeconds;
        countAssign++;
      }
      if (sla.steps.ACCEPTANCE.isCompleted && sla.steps.ACCEPTANCE.elapsedSeconds > 0) {
        totalAccept += sla.steps.ACCEPTANCE.elapsedSeconds;
        countAccept++;
      }
      if (sla.steps.DEPARTURE.isCompleted && sla.steps.DEPARTURE.elapsedSeconds > 0) {
        totalDepart += sla.steps.DEPARTURE.elapsedSeconds;
        countDepart++;
      }
      if (sla.steps.ARRIVAL.isCompleted && sla.steps.ARRIVAL.elapsedSeconds > 0) {
        totalArrival += sla.steps.ARRIVAL.elapsedSeconds;
        countArrival++;
      }
      if (sla.steps.RESOLUTION.isCompleted && sla.steps.RESOLUTION.elapsedSeconds > 0) {
        totalResolution += sla.steps.RESOLUTION.elapsedSeconds;
        countResolution++;
      }
    });

    const totalAlerts = alerts.length;
    const totalInterventions = interventions.length;

    const avgAck = countAck > 0 ? totalAck / countAck : null;
    const avgAssign = countAssign > 0 ? totalAssign / countAssign : null;
    const avgAccept = countAccept > 0 ? totalAccept / countAccept : null;
    const avgDepart = countDepart > 0 ? totalDepart / countDepart : null;
    const avgArrival = countArrival > 0 ? totalArrival / countArrival : null;
    const avgResolution = countResolution > 0 ? totalResolution / countResolution : null;

    const slaComplianceRatePct = totalAlerts > 0 ? Math.round((slaRespectedCount / totalAlerts) * 100) : null;
    const resolutionRatePct = totalAlerts > 0 ? Math.round((resolvedCount / totalAlerts) * 100) : null;
    const falseAlarmRatePct = totalAlerts > 0 ? Math.round((falseAlarmCount / totalAlerts) * 100) : null;

    // Agents
    const orgAgents = (agentsRes.data || []).filter(
      (a: any) => !a.user || a.user.organization_id === orgId
    );
    const activeAgentsCount = orgAgents.length;
    const availableAgentsCount = orgAgents.filter((a: any) => a.duty_status === 'AVAILABLE' || a.duty_status === 'ON_DUTY').length;
    const busyAgentsCount = orgAgents.filter((a: any) => a.duty_status === 'BUSY' || a.duty_status === 'EN_ROUTE').length;

    // Évolutions vs période précédente
    const alertsEvolutionPct = prevAlertsCount > 0
      ? Math.round(((totalAlerts - prevAlertsCount) / prevAlertsCount) * 100)
      : null;
    const interventionsEvolutionPct = prevIntCount > 0
      ? Math.round(((totalInterventions - prevIntCount) / prevIntCount) * 100)
      : null;

    // Chronologie journalière pour les graphiques
    const trendMap = new Map<string, { alerts: number; interventions: number; slaRespected: number; slaBreached: number; totalArrivalSec: number; arrivalCount: number }>();

    // Initialiser les jours
    const cur = new Date(range.startDate);
    while (cur <= range.endDate) {
      const key = cur.toISOString().split('T')[0];
      trendMap.set(key, { alerts: 0, interventions: 0, slaRespected: 0, slaBreached: 0, totalArrivalSec: 0, arrivalCount: 0 });
      cur.setDate(cur.getDate() + 1);
    }

    alerts.forEach((a) => {
      const day = a.created_at?.split('T')[0];
      if (day && trendMap.has(day)) {
        const item = trendMap.get(day)!;
        item.alerts++;
        const relatedInt = intByAlertId.get(a.id);
        const sla = calculateAlertSla(a, relatedInt);
        if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') {
          item.slaRespected++;
        } else if (sla.overallStatus === 'BREACHED') {
          item.slaBreached++;
        }
        if (sla.steps.ARRIVAL.isCompleted) {
          item.totalArrivalSec += sla.steps.ARRIVAL.elapsedSeconds;
          item.arrivalCount++;
        }
      }
    });

    interventions.forEach((int) => {
      const day = int.created_at?.split('T')[0];
      if (day && trendMap.has(day)) {
        trendMap.get(day)!.interventions++;
      }
    });

    const trends: TrendPoint[] = Array.from(trendMap.entries()).map(([date, val]) => ({
      date,
      alerts: val.alerts,
      interventions: val.interventions,
      slaRespected: val.slaRespected,
      slaBreached: val.slaBreached,
      avgArrivalSeconds: val.arrivalCount > 0 ? Math.round(val.totalArrivalSec / val.arrivalCount) : null,
    }));

    const kpis: ExecutiveKpiSummary = {
      totalAlerts,
      totalInterventions,
      criticalAlertsCount: criticalCount,
      avgAckDurationSeconds: avgAck,
      formattedAvgAckDuration: formatDurationToMinutesOrSeconds(avgAck),
      avgAssignDurationSeconds: avgAssign,
      formattedAvgAssignDuration: formatDurationToMinutesOrSeconds(avgAssign),
      avgAcceptDurationSeconds: avgAccept,
      formattedAvgAcceptDuration: formatDurationToMinutesOrSeconds(avgAccept),
      avgDepartDurationSeconds: avgDepart,
      formattedAvgDepartDuration: formatDurationToMinutesOrSeconds(avgDepart),
      avgArrivalDurationSeconds: avgArrival,
      formattedAvgArrivalDuration: formatDurationToMinutesOrSeconds(avgArrival),
      avgResolutionDurationSeconds: avgResolution,
      formattedAvgResolutionDuration: formatDurationToMinutesOrSeconds(avgResolution),
      slaComplianceRatePct,
      resolutionRatePct,
      falseAlarmRatePct,
      activeAgentsCount,
      availableAgentsCount,
      busyAgentsCount,
      protectedSitesCount: sitesRes.count || (sitesRes.data?.length ?? 0),
      activeClientsCount: clientsRes.count || (clientsRes.data?.length ?? 0),
      trends: {
        alertsEvolutionPct,
        interventionsEvolutionPct,
        slaEvolutionPct: null,
      },
    };

    return {
      kpis,
      trends,
      periodLabel: range.label,
    };
  }

  /**
   * 2. Operations Analytics (Section 6)
   */
  static async getOperationsAnalytics(filters: AnalyticsFilterInput): Promise<OperationsAnalytics> {
    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);
    const orgId = filters.organizationId;

    const { data: alerts } = await supabaseAdmin
      .from('alerts')
      .select('id, type, priority, status, created_at, resolved_at, site_id, site:protected_sites(id, name)')
      .eq('organization_id', orgId)
      .gte('created_at', range.startDate.toISOString())
      .lte('created_at', range.endDate.toISOString());

    const { data: interventions } = await supabaseAdmin
      .from('interventions')
      .select('id, status, created_at, arrived_at, resolved_at')
      .gte('created_at', range.startDate.toISOString())
      .lte('created_at', range.endDate.toISOString());

    const allAlerts = alerts || [];
    const allInts = interventions || [];

    // Volumes par statut
    const volume = {
      total: allInts.length || allAlerts.length,
      pending: allAlerts.filter((a) => a.status === 'SENT' || a.status === 'ACKNOWLEDGED').length,
      inProgress: allAlerts.filter((a) => a.status === 'ASSIGNED' || a.status === 'EN_ROUTE' || a.status === 'ARRIVED').length,
      resolved: allAlerts.filter((a) => a.status === 'RESOLVED').length,
    };

    // Durées de résolution (en secondes)
    const durationsArr: number[] = [];
    allAlerts.forEach((a) => {
      if (a.created_at && a.resolved_at) {
        const sec = Math.max(0, Math.floor((new Date(a.resolved_at).getTime() - new Date(a.created_at).getTime()) / 1000));
        if (sec > 0) durationsArr.push(sec);
      }
    });

    durationsArr.sort((a, b) => a - b);
    const avgSec = durationsArr.length > 0 ? durationsArr.reduce((s, v) => s + v, 0) / durationsArr.length : null;
    const medianSec = durationsArr.length > 0 ? durationsArr[Math.floor(durationsArr.length / 2)] : null;
    const minSec = durationsArr.length > 0 ? durationsArr[0] : null;
    const maxSec = durationsArr.length > 0 ? durationsArr[durationsArr.length - 1] : null;

    // Distribution horaire (0 à 23h)
    const hourlyCounts = new Array(24).fill(0);
    allAlerts.forEach((a) => {
      if (a.created_at) {
        const h = new Date(a.created_at).getHours();
        hourlyCounts[h]++;
      }
    });
    const hourlyDistribution = hourlyCounts.map((count, hour) => ({ hour, count }));

    // Distribution hebdomadaire (Lundi à Dimanche)
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dailyCounts = new Array(7).fill(0);
    allAlerts.forEach((a) => {
      if (a.created_at) {
        const d = new Date(a.created_at).getDay();
        dailyCounts[d]++;
      }
    });
    const dailyDistribution = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      dayOfWeek: dayNames[d],
      count: dailyCounts[d],
    }));

    // Répartition par type
    const typeMap = new Map<string, number>();
    allAlerts.forEach((a) => {
      const t = a.type || 'AUTRE';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    });
    const byType = Array.from(typeMap.entries()).map(([label, count]) => ({
      label,
      count,
      percentage: allAlerts.length > 0 ? Math.round((count / allAlerts.length) * 100) : 0,
    }));

    // Répartition par criticité
    const sevMap = new Map<string, number>();
    allAlerts.forEach((a) => {
      const s = a.priority || 'NORMAL';
      sevMap.set(s, (sevMap.get(s) || 0) + 1);
    });
    const bySeverity = Array.from(sevMap.entries()).map(([label, count]) => ({
      label,
      count,
      percentage: allAlerts.length > 0 ? Math.round((count / allAlerts.length) * 100) : 0,
    }));

    // Répartition par site
    const siteMap = new Map<string, { siteName: string; count: number }>();
    allAlerts.forEach((a: any) => {
      const sId = a.site_id || 'unknown';
      const sName = a.site?.name || 'Site Client';
      if (!siteMap.has(sId)) {
        siteMap.set(sId, { siteName: sName, count: 0 });
      }
      siteMap.get(sId)!.count++;
    });
    const bySite = Array.from(siteMap.entries()).map(([siteId, data]) => ({
      siteId,
      siteName: data.siteName,
      count: data.count,
    })).sort((a, b) => b.count - a.count);

    return {
      volume,
      durations: {
        averageSeconds: avgSec,
        medianSeconds: medianSec,
        minSeconds: minSec,
        maxSeconds: maxSec,
        formattedAverage: formatDurationToMinutesOrSeconds(avgSec),
        formattedMedian: formatDurationToMinutesOrSeconds(medianSec),
      },
      hourlyDistribution,
      dailyDistribution,
      byType,
      bySeverity,
      bySite,
    };
  }

  /**
   * 3. SLA Analytics (Section 7)
   */
  static async getSlaAnalytics(filters: AnalyticsFilterInput): Promise<SlaAnalyticsSummary> {
    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);
    const orgId = filters.organizationId;

    const [alertsRes, intsRes, sitesRes, agentsRes] = await Promise.all([
      supabaseAdmin
        .from('alerts')
        .select('*, site:protected_sites(id, name)')
        .eq('organization_id', orgId)
        .gte('created_at', range.startDate.toISOString())
        .lte('created_at', range.endDate.toISOString()),
      supabaseAdmin
        .from('interventions')
        .select('*, agent:security_agents(id, badge_number, user:users(full_name))')
        .gte('created_at', range.startDate.toISOString())
        .lte('created_at', range.endDate.toISOString()),
      supabaseAdmin.from('protected_sites').select('id, name').eq('organization_id', orgId),
      supabaseAdmin.from('security_agents').select('id, badge_number, user:users(full_name)'),
    ]);

    const alerts = alertsRes.data || [];
    const ints = intsRes.data || [];
    const intByAlertId = new Map<string, any>();
    ints.forEach((i) => {
      if (i.alert_id) intByAlertId.set(i.alert_id, i);
    });

    let completedOrNormal = 0;
    let atRisk = 0;
    let breached = 0;

    // Agrégations par site
    const siteAgg = new Map<string, { name: string; total: number; respected: number; breached: number; totalArrivalSec: number; arrivalCount: number }>();
    (sitesRes.data || []).forEach((s) => {
      siteAgg.set(s.id, { name: s.name, total: 0, respected: 0, breached: 0, totalArrivalSec: 0, arrivalCount: 0 });
    });

    // Agrégations par agent
    const agentAgg = new Map<string, { name: string; total: number; respected: number; breached: number; totalArrivalSec: number; arrivalCount: number }>();
    (agentsRes.data || []).forEach((ag: any) => {
      const name = ag.user?.full_name || `Agent ${ag.badge_number}`;
      agentAgg.set(ag.id, { name, total: 0, respected: 0, breached: 0, totalArrivalSec: 0, arrivalCount: 0 });
    });

    alerts.forEach((alert) => {
      const int = intByAlertId.get(alert.id);
      const sla = calculateAlertSla(alert, int);

      if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') {
        completedOrNormal++;
      } else if (sla.overallStatus === 'AT_RISK') {
        atRisk++;
      } else if (sla.overallStatus === 'BREACHED') {
        breached++;
      }

      // Par site
      if (alert.site_id) {
        if (!siteAgg.has(alert.site_id)) {
          siteAgg.set(alert.site_id, { name: alert.site?.name || 'Site', total: 0, respected: 0, breached: 0, totalArrivalSec: 0, arrivalCount: 0 });
        }
        const sItem = siteAgg.get(alert.site_id)!;
        sItem.total++;
        if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') sItem.respected++;
        else if (sla.overallStatus === 'BREACHED') sItem.breached++;
        if (sla.steps.ARRIVAL.isCompleted) {
          sItem.totalArrivalSec += sla.steps.ARRIVAL.elapsedSeconds;
          sItem.arrivalCount++;
        }
      }

      // Par agent
      const agentId = alert.assigned_agent_id || int?.agent_id;
      if (agentId) {
        if (!agentAgg.has(agentId)) {
          const name = int?.agent?.user?.full_name || 'Agent Assigné';
          agentAgg.set(agentId, { name, total: 0, respected: 0, breached: 0, totalArrivalSec: 0, arrivalCount: 0 });
        }
        const aItem = agentAgg.get(agentId)!;
        aItem.total++;
        if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') aItem.respected++;
        else if (sla.overallStatus === 'BREACHED') aItem.breached++;
        if (sla.steps.ARRIVAL.isCompleted) {
          aItem.totalArrivalSec += sla.steps.ARRIVAL.elapsedSeconds;
          aItem.arrivalCount++;
        }
      }
    });

    const totalAlerts = alerts.length;
    const overallCompliancePct = totalAlerts > 0 ? Math.round((completedOrNormal / totalAlerts) * 100) : null;

    const siteSlaTable = Array.from(siteAgg.entries())
      .filter(([_, data]) => data.total > 0)
      .map(([siteId, data]) => {
        const avg = data.arrivalCount > 0 ? data.totalArrivalSec / data.arrivalCount : null;
        return {
          siteId,
          siteName: data.name,
          interventionsCount: data.total,
          slaRespectedCount: data.respected,
          slaBreachedCount: data.breached,
          compliancePct: data.total > 0 ? Math.round((data.respected / data.total) * 100) : null,
          avgArrivalSeconds: avg,
          formattedAvgArrival: formatDurationToMinutesOrSeconds(avg),
        };
      })
      .sort((a, b) => b.interventionsCount - a.interventionsCount);

    const agentSlaTable = Array.from(agentAgg.entries())
      .filter(([_, data]) => data.total > 0)
      .map(([agentId, data]) => {
        const avg = data.arrivalCount > 0 ? data.totalArrivalSec / data.arrivalCount : null;
        return {
          agentId,
          agentName: data.name,
          interventionsCount: data.total,
          slaRespectedCount: data.respected,
          slaBreachedCount: data.breached,
          compliancePct: data.total > 0 ? Math.round((data.respected / data.total) * 100) : null,
          avgArrivalSeconds: avg,
          formattedAvgArrival: formatDurationToMinutesOrSeconds(avg),
        };
      })
      .sort((a, b) => b.interventionsCount - a.interventionsCount);

    return {
      overallCompliancePct,
      statusBreakdown: {
        completedOrNormal,
        atRisk,
        breached,
      },
      siteSlaTable,
      agentSlaTable,
      stepsBreakdown: [
        { stepKey: 'ACKNOWLEDGEMENT', label: 'Prise en charge (SOC)', targetSeconds: 120, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
        { stepKey: 'ASSIGNMENT', label: 'Assignation agent', targetSeconds: 180, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
        { stepKey: 'ACCEPTANCE', label: 'Acceptation mission', targetSeconds: 120, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
        { stepKey: 'DEPARTURE', label: 'Mise en route patrouille', targetSeconds: 180, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
        { stepKey: 'ARRIVAL', label: 'Arrivée sur site', targetSeconds: 900, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
        { stepKey: 'RESOLUTION', label: 'Clôture & Sécurisation', targetSeconds: 1800, averageElapsedSeconds: null, formattedAvgElapsed: 'N/D', compliancePct: null },
      ],
    };
  }

  /**
   * 4. Performance des Agents (Section 8)
   */
  static async getAgentPerformance(filters: AnalyticsFilterInput): Promise<AgentPerformanceRecord[]> {
    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);

    const [agentsRes, intsRes, alertsRes] = await Promise.all([
      supabaseAdmin
        .from('security_agents')
        .select('id, user_id, badge_number, patrol_vehicle, duty_status, user:users(id, full_name, organization_id)'),
      supabaseAdmin
        .from('interventions')
        .select('*')
        .gte('created_at', range.startDate.toISOString())
        .lte('created_at', range.endDate.toISOString()),
      supabaseAdmin
        .from('alerts')
        .select('id, status, assigned_agent_id')
        .eq('organization_id', filters.organizationId)
        .gte('created_at', range.startDate.toISOString())
        .lte('created_at', range.endDate.toISOString()),
    ]);

    const agents = (agentsRes.data || []).filter(
      (ag: any) => !ag.user || ag.user.organization_id === filters.organizationId
    );
    const ints = intsRes.data || [];
    const alerts = alertsRes.data || [];

    const intByAlertId = new Map<string, any>();
    ints.forEach((i) => {
      if (i.alert_id) intByAlertId.set(i.alert_id, i);
    });

    return agents.map((ag: any) => {
      const agentInts = ints.filter((i) => i.agent_id === ag.id);
      const agentAlerts = alerts.filter((a) => a.assigned_agent_id === ag.id);

      const assigned = Math.max(agentInts.length, agentAlerts.length);
      const accepted = agentInts.filter((i) => i.accepted_at || i.en_route_at || i.arrived_at || i.resolved_at).length;
      const completed = agentInts.filter((i) => i.status === 'RESOLVED' || i.status === 'COMPLETED').length;

      let totalArrival = 0, countArrival = 0;
      let totalResolution = 0, countResolution = 0;
      let slaRespected = 0, slaBreached = 0;

      agentInts.forEach((int) => {
        const sla = calculateAlertSla(null, int);
        if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') slaRespected++;
        else if (sla.overallStatus === 'BREACHED') slaBreached++;

        if (sla.steps.ARRIVAL.isCompleted) {
          totalArrival += sla.steps.ARRIVAL.elapsedSeconds;
          countArrival++;
        }
        if (sla.steps.RESOLUTION.isCompleted) {
          totalResolution += sla.steps.RESOLUTION.elapsedSeconds;
          countResolution++;
        }
      });

      return {
        agentId: ag.id,
        userId: ag.user_id,
        fullName: ag.user?.full_name || `Agent ${ag.badge_number}`,
        badgeNumber: ag.badge_number || 'N/A',
        patrolVehicle: ag.patrol_vehicle || 'PATROUILLE',
        dutyStatus: ag.duty_status || 'OFFLINE',
        interventionsAssigned: assigned,
        interventionsAccepted: accepted,
        interventionsCompleted: completed,
        acceptanceRatePct: assigned > 0 ? Math.round((accepted / assigned) * 100) : null,
        avgAcceptSeconds: null,
        avgDepartSeconds: null,
        avgArrivalSeconds: countArrival > 0 ? totalArrival / countArrival : null,
        avgResolutionSeconds: countResolution > 0 ? totalResolution / countResolution : null,
        slaCompliancePct: agentInts.length > 0 ? Math.round((slaRespected / agentInts.length) * 100) : null,
        slaRespectedCount: slaRespected,
        slaBreachedCount: slaBreached,
      };
    });
  }

  /**
   * 5. Risque & Heatmap Jour x Heure (Section 10 & 11)
   */
  static async getRiskAnalytics(filters: AnalyticsFilterInput): Promise<RiskAnalyticsSummary> {
    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);

    const [alertsRes, sitesRes] = await Promise.all([
      supabaseAdmin
        .from('alerts')
        .select('id, type, priority, status, created_at, site_id, site:protected_sites(id, name, address, latitude, longitude)')
        .eq('organization_id', filters.organizationId)
        .gte('created_at', range.startDate.toISOString())
        .lte('created_at', range.endDate.toISOString()),
      supabaseAdmin
        .from('protected_sites')
        .select('id, name, address, city, latitude, longitude')
        .eq('organization_id', filters.organizationId),
    ]);

    const alerts = alertsRes.data || [];
    const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    // Matrice 7 x 24
    const heatmapMap = new Map<string, RiskHeatmapCell>();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const key = `${d}-${h}`;
        heatmapMap.set(key, {
          dayIndex: d,
          dayName: dayNames[d],
          hour: h,
          count: 0,
          criticalCount: 0,
        });
      }
    }

    let maxCellCount = 0;
    let peakPeriod = 'Données insuffisantes';

    alerts.forEach((a) => {
      if (a.created_at) {
        const date = new Date(a.created_at);
        // JS getDay(): 0 = Dimanche, 1 = Lundi -> convertir en 0 = Lundi, 6 = Dimanche
        const jsDay = date.getDay();
        const dIdx = jsDay === 0 ? 6 : jsDay - 1;
        const h = date.getHours();
        const key = `${dIdx}-${h}`;
        const cell = heatmapMap.get(key);
        if (cell) {
          cell.count++;
          if (a.priority === 'CRITICAL' || a.priority === 'HIGH') {
            cell.criticalCount++;
          }
          if (cell.count > maxCellCount) {
            maxCellCount = cell.count;
            peakPeriod = `${cell.dayName} entre ${h}h et ${h + 1}h (${cell.count} incidents)`;
          }
        }
      }
    });

    // Risque par site
    const siteMap = new Map<string, any>();
    (sitesRes.data || []).forEach((s) => {
      siteMap.set(s.id, {
        siteId: s.id,
        siteName: s.name,
        address: s.address || '',
        latitude: s.latitude,
        longitude: s.longitude,
        totalIncidents: 0,
        criticalIncidents: 0,
        typeCounts: new Map<string, number>(),
        lastIncidentDate: null,
      });
    });

    alerts.forEach((a: any) => {
      if (a.site_id && siteMap.has(a.site_id)) {
        const item = siteMap.get(a.site_id)!;
        item.totalIncidents++;
        if (a.priority === 'CRITICAL' || a.priority === 'HIGH') item.criticalIncidents++;
        const t = a.type || 'AUTRE';
        item.typeCounts.set(t, (item.typeCounts.get(t) || 0) + 1);
        if (!item.lastIncidentDate || new Date(a.created_at) > new Date(item.lastIncidentDate)) {
          item.lastIncidentDate = a.created_at;
        }
      }
    });

    const topIncidentSites = Array.from(siteMap.values())
      .filter((s) => s.totalIncidents > 0)
      .map((s) => {
        let dominant = 'N/A';
        let maxT = 0;
        s.typeCounts.forEach((cnt: number, type: string) => {
          if (cnt > maxT) {
            maxT = cnt;
            dominant = type;
          }
        });
        return {
          siteId: s.siteId,
          siteName: s.siteName,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          totalIncidents: s.totalIncidents,
          criticalIncidents: s.criticalIncidents,
          lastIncidentDate: s.lastIncidentDate,
          dominantIncidentType: dominant,
          slaCompliancePct: null,
        };
      })
      .sort((a, b) => b.totalIncidents - a.totalIncidents);

    return {
      heatmapMatrix: Array.from(heatmapMap.values()),
      peakRiskPeriod: maxCellCount > 0 ? peakPeriod : 'Aucun pic significatif observé',
      topIncidentSites,
      concentrationZones: topIncidentSites.slice(0, 5).map((s) => ({
        zoneName: s.siteName,
        incidentCount: s.totalIncidents,
        percentage: alerts.length > 0 ? Math.round((s.totalIncidents / alerts.length) * 100) : 0,
      })),
    };
  }

  /**
   * 6. Financial Analytics & Marges Brutes (Section 12 & 13)
   */
  static async getFinancialAnalytics(filters: AnalyticsFilterInput): Promise<FinancialAnalyticsSummary> {
    const orgId = filters.organizationId;
    const settings = await this.getFinancialSettings(orgId);

    const isConfigured = Boolean(
      settings &&
      (settings.agent_hourly_cost !== null ||
       settings.default_billing_rate !== null ||
       settings.fixed_intervention_cost !== null)
    );

    const range = resolveDateRange(filters.dateRange, filters.startDate, filters.endDate);

    const { data: ints } = await supabaseAdmin
      .from('interventions')
      .select('id, status, created_at, arrived_at, resolved_at, alert:alerts!fk_interventions_alert(site_id, site:protected_sites(id, name))')
      .gte('created_at', range.startDate.toISOString())
      .lte('created_at', range.endDate.toISOString());

    const interventions = ints || [];
    const totalCount = interventions.length;

    if (!isConfigured || !settings) {
      return {
        isConfigured: false,
        currency: 'XOF',
        settings: null,
        totalInterventionsCount: totalCount,
        totalEstimatedRevenue: null,
        totalEstimatedCost: null,
        estimatedGrossMargin: null,
        estimatedGrossMarginPct: null,
        avgEstimatedRevenuePerIntervention: null,
        avgEstimatedCostPerIntervention: null,
        avgEstimatedMarginPerIntervention: null,
        costBreakdown: null,
        siteProfitabilityTable: [],
      };
    }

    const billingRate = settings.default_billing_rate || 0;
    const fixedCost = settings.fixed_intervention_cost || 0;
    const agentHourly = settings.agent_hourly_cost || 0;
    const vehicleHourly = settings.vehicle_hourly_cost || 0;

    let totalAgentCost = 0;
    let totalVehicleCost = 0;
    let totalFixedCost = 0;

    const siteMap = new Map<string, { siteName: string; count: number; rev: number; cost: number }>();

    interventions.forEach((int: any) => {
      // Calcul durée mission (en heures)
      let missionHours = 1.0; // minimum 1h d'intervention par défaut
      if (int.created_at && int.resolved_at) {
        const sec = Math.max(0, (new Date(int.resolved_at).getTime() - new Date(int.created_at).getTime()) / 1000);
        missionHours = Math.max(0.5, sec / 3600);
      }

      const costAgent = agentHourly * missionHours;
      const costVehicle = vehicleHourly * missionHours;
      const intCost = fixedCost + costAgent + costVehicle;

      totalAgentCost += costAgent;
      totalVehicleCost += costVehicle;
      totalFixedCost += fixedCost;

      // Agrégation par site
      const siteId = int.alert?.site_id || 'unknown';
      const siteName = int.alert?.site?.name || 'Site Client';
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, { siteName, count: 0, rev: 0, cost: 0 });
      }
      const sItem = siteMap.get(siteId)!;
      sItem.count++;
      sItem.rev += billingRate;
      sItem.cost += intCost;
    });

    const totalEstimatedRevenue = totalCount * billingRate;
    const totalEstimatedCost = totalFixedCost + totalAgentCost + totalVehicleCost;
    const estimatedGrossMargin = totalEstimatedRevenue - totalEstimatedCost;
    const estimatedGrossMarginPct = totalEstimatedRevenue > 0
      ? Math.round((estimatedGrossMargin / totalEstimatedRevenue) * 100)
      : null;

    const siteProfitabilityTable = Array.from(siteMap.entries()).map(([siteId, data]) => {
      const margin = data.rev - data.cost;
      return {
        siteId,
        siteName: data.siteName,
        interventionsCount: data.count,
        estimatedRevenue: data.rev,
        estimatedCost: Math.round(data.cost),
        estimatedMargin: Math.round(margin),
        estimatedMarginPct: data.rev > 0 ? Math.round((margin / data.rev) * 100) : null,
      };
    }).sort((a, b) => b.interventionsCount - a.interventionsCount);

    return {
      isConfigured: true,
      currency: settings.currency || 'XOF',
      settings,
      totalInterventionsCount: totalCount,
      totalEstimatedRevenue: Math.round(totalEstimatedRevenue),
      totalEstimatedCost: Math.round(totalEstimatedCost),
      estimatedGrossMargin: Math.round(estimatedGrossMargin),
      estimatedGrossMarginPct,
      avgEstimatedRevenuePerIntervention: totalCount > 0 ? Math.round(totalEstimatedRevenue / totalCount) : null,
      avgEstimatedCostPerIntervention: totalCount > 0 ? Math.round(totalEstimatedCost / totalCount) : null,
      avgEstimatedMarginPerIntervention: totalCount > 0 ? Math.round(estimatedGrossMargin / totalCount) : null,
      costBreakdown: {
        agentCost: Math.round(totalAgentCost),
        vehicleCost: Math.round(totalVehicleCost),
        fixedCost: Math.round(totalFixedCost),
      },
      siteProfitabilityTable,
    };
  }

  private static financialCache = new Map<string, OrganizationFinancialSettings>();

  /**
   * Récupère les paramètres financiers d'une organisation
   */
  static async getFinancialSettings(organizationId: string): Promise<OrganizationFinancialSettings | null> {
    if (this.financialCache.has(organizationId)) {
      return this.financialCache.get(organizationId)!;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('organization_financial_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!error && data) {
        this.financialCache.set(organizationId, data as OrganizationFinancialSettings);
        return data as OrganizationFinancialSettings;
      }
    } catch {
      // Fallback
    }

    // Fallback audit_logs
    try {
      const { data: auditLog } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('action', 'FINANCIAL_SETTINGS_UPDATED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const st = auditLog?.details?.settings || auditLog?.metadata?.settings;
      if (st) {
        this.financialCache.set(organizationId, st as OrganizationFinancialSettings);
        return st as OrganizationFinancialSettings;
      }
    } catch {
      // Non-bloquant
    }

    return null;
  }

  /**
   * Sauvegarde les paramètres financiers d'une organisation
   */
  static async saveFinancialSettings(
    organizationId: string,
    settings: Partial<OrganizationFinancialSettings>,
    actorId?: string | null
  ): Promise<OrganizationFinancialSettings> {
    const now = new Date().toISOString();
    const payload: OrganizationFinancialSettings = {
      organization_id: organizationId,
      currency: settings.currency || 'XOF',
      agent_hourly_cost: settings.agent_hourly_cost ?? null,
      vehicle_hourly_cost: settings.vehicle_hourly_cost ?? null,
      fixed_intervention_cost: settings.fixed_intervention_cost ?? null,
      cost_per_kilometer: settings.cost_per_kilometer ?? null,
      default_billing_rate: settings.default_billing_rate ?? null,
      target_gross_margin_pct: settings.target_gross_margin_pct ?? null,
      updated_at: now,
    };

    this.financialCache.set(organizationId, payload);

    // 1. Tenter upsert dans la table
    try {
      await supabaseAdmin
        .from('organization_financial_settings')
        .upsert(payload, { onConflict: 'organization_id' });
    } catch {
      // Non-bloquant
    }

    // 2. Traçabilité d'audit obligatoire
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'FINANCIAL_SETTINGS_UPDATED',
        user_id: actorId || null,
        organization_id: organizationId,
        entity_type: 'organization_financial_settings',
        details: { settings: payload },
      });
    } catch {
      // Non-bloquant
    }

    return payload;
  }
}

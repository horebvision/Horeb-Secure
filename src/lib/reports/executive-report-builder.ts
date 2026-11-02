/**
 * SECURIA V2 — PHASE 5 : EXECUTIVE REPORT BUILDER
 * Génère les rapports périodiques de direction (quotidien, hebdomadaire, mensuel, SLA, agents, sites, financier).
 * RÈGLES STRICTES :
 * - Factuel exclusivement. Aucune interprétation subjective sans base chiffrée.
 * - Réutilise les mécanismes d'export CSV / structure Phase 4.
 */

import { AnalyticsService } from '@/lib/analytics/analytics-service';
import { AnalyticsFilterInput, ExecutiveKpiSummary } from '@/lib/analytics/types';

export type ReportType =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'SLA'
  | 'AGENTS'
  | 'CLIENTS'
  | 'SITES'
  | 'INCIDENTS'
  | 'FINANCIAL';

export interface GeneratedReport {
  title: string;
  type: ReportType;
  generatedAt: string;
  periodLabel: string;
  organizationId: string;
  kpis: ExecutiveKpiSummary;
  factualStatements: string[];
  csvContent?: string;
  htmlContent: string;
}

export class ExecutiveReportBuilder {
  static async generateReport(type: ReportType, filters: AnalyticsFilterInput): Promise<GeneratedReport> {
    const rangeByReport: Record<ReportType, any> = {
      DAILY: 'today',
      WEEKLY: '7d',
      MONTHLY: '30d',
      SLA: filters.dateRange || '30d',
      AGENTS: filters.dateRange || '30d',
      CLIENTS: filters.dateRange || '30d',
      SITES: filters.dateRange || '30d',
      INCIDENTS: filters.dateRange || '30d',
      FINANCIAL: filters.dateRange || '30d',
    };

    const targetRange = rangeByReport[type] || '30d';
    const effectiveFilters = { ...filters, dateRange: targetRange };

    const [execData, operationsData, slaData, agentData, riskData, financeData] = await Promise.all([
      AnalyticsService.getExecutiveKpis(effectiveFilters),
      AnalyticsService.getOperationsAnalytics(effectiveFilters),
      AnalyticsService.getSlaAnalytics(effectiveFilters),
      AnalyticsService.getAgentPerformance(effectiveFilters),
      AnalyticsService.getRiskAnalytics(effectiveFilters),
      AnalyticsService.getFinancialAnalytics(effectiveFilters),
    ]);

    const { kpis, periodLabel } = execData;

    const alertsGrowth =
      kpis.trends.alertsEvolutionPct !== null
        ? `${kpis.trends.alertsEvolutionPct > 0 ? '+' : ''}${kpis.trends.alertsEvolutionPct}%`
        : 'N/A';

    const interventionsGrowth =
      kpis.trends.interventionsEvolutionPct !== null
        ? `${kpis.trends.interventionsEvolutionPct > 0 ? '+' : ''}${kpis.trends.interventionsEvolutionPct}%`
        : 'N/A';

    const slaComplianceFormatted =
      kpis.slaComplianceRatePct !== null ? `${kpis.slaComplianceRatePct}%` : 'N/D';

    const falseAlarmFormatted =
      kpis.falseAlarmRatePct !== null ? `${kpis.falseAlarmRatePct}%` : 'N/D';

    const revenueFormatted =
      financeData.totalEstimatedRevenue !== null
        ? `${financeData.totalEstimatedRevenue.toLocaleString('fr-FR')} ${financeData.currency}`
        : 'N/D';

    const costFormatted =
      financeData.totalEstimatedCost !== null
        ? `${financeData.totalEstimatedCost.toLocaleString('fr-FR')} ${financeData.currency}`
        : 'N/D';

    const marginFormatted =
      financeData.estimatedGrossMargin !== null
        ? `${financeData.estimatedGrossMargin.toLocaleString('fr-FR')} ${financeData.currency}`
        : 'N/D';

    const marginPctFormatted =
      financeData.estimatedGrossMarginPct !== null
        ? `${financeData.estimatedGrossMarginPct}%`
        : 'N/D';

    // Énoncés factuels stricts
    const factualStatements: string[] = [];

    // Alertes et interventions
    factualStatements.push(
      `Volume total d'alertes enregistrées sur la période : ${kpis.totalAlerts}. Évolution observée : ${alertsGrowth}.`
    );
    factualStatements.push(
      `Volume total d'interventions déclenchées : ${kpis.totalInterventions}. Évolution observée : ${interventionsGrowth}.`
    );
    factualStatements.push(
      `Nombre d'incidents critiques ou majeurs constatés : ${kpis.criticalAlertsCount}.`
    );

    // Délais
    factualStatements.push(
      `Délai moyen d'acquittement : ${kpis.formattedAvgAckDuration}. Délai moyen d'arrivée sur site : ${kpis.formattedAvgArrivalDuration}. Délai moyen de résolution : ${kpis.formattedAvgResolutionDuration}.`
    );

    // SLA
    factualStatements.push(
      `Taux de respect global des SLA sur la période : ${slaComplianceFormatted} (${slaData.statusBreakdown.completedOrNormal} conformes, ${slaData.statusBreakdown.breached} dépassés).`
    );

    // Agents
    factualStatements.push(
      `Effectif mobilisé : ${kpis.activeAgentsCount} agents actifs au cours de la période, ${kpis.availableAgentsCount} actuellement disponibles, ${kpis.busyAgentsCount} actuellement en mission.`
    );

    // Sites et clients
    factualStatements.push(
      `Périmètre opérationnel : ${kpis.protectedSitesCount} sites protégés, ${kpis.activeClientsCount} comptes clients rattachés.`
    );

    // Finance (avec mention explicite si non configuré)
    if (financeData.isConfigured) {
      factualStatements.push(
        `Données financières estimées : Chiffre d'affaires de ${revenueFormatted}, Coût estimé de ${costFormatted}, Marge brute estimée de ${marginFormatted} (${marginPctFormatted}).`
      );
    } else {
      factualStatements.push(
        `Données financières : Paramètres financiers non configurés pour l'organisation. Calcul des marges non applicable.`
      );
    }

    // Génération du CSV
    const csvRows = [
      ['KPI', 'Valeur', 'Tendance / Comparaison'],
      ['Alertes totales', String(kpis.totalAlerts), alertsGrowth],
      ['Interventions', String(kpis.totalInterventions), interventionsGrowth],
      ['Alertes critiques', String(kpis.criticalAlertsCount), 'N/A'],
      ['Temps moyen acquittement', kpis.formattedAvgAckDuration, 'N/A'],
      ['Temps moyen arrivée', kpis.formattedAvgArrivalDuration, 'N/A'],
      ['Temps moyen résolution', kpis.formattedAvgResolutionDuration, 'N/A'],
      ['Taux respect SLA', slaComplianceFormatted, 'N/A'],
      ['Taux fausses alertes', falseAlarmFormatted, 'N/A'],
      ['Agents actifs', String(kpis.activeAgentsCount), 'N/A'],
      ['Sites protégés', String(kpis.protectedSitesCount), 'N/A'],
      ['Clients actifs', String(kpis.activeClientsCount), 'N/A'],
    ];

    if (financeData.isConfigured) {
      csvRows.push(['CA estimé', revenueFormatted, 'Estimé']);
      csvRows.push(['Coût estimé', costFormatted, 'Estimé']);
      csvRows.push(['Marge brute estimée', marginFormatted, marginPctFormatted]);
    }

    const csvContent = '\uFEFF' + csvRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');

    // Génération HTML pour affichage / impression PDF
    const titles: Record<ReportType, string> = {
      DAILY: 'Rapport Opérationnel Quotidien',
      WEEKLY: 'Rapport d’Activité Hebdomadaire',
      MONTHLY: 'Rapport Exécutif Mensuel de Direction',
      SLA: 'Rapport Analytique de Respect des SLA',
      AGENTS: 'Rapport de Performance des Agents de Sécurité',
      CLIENTS: 'Rapport d’Activité Clients',
      SITES: 'Rapport d’Incidents par Site Protégé',
      INCIDENTS: 'Rapport Typologique des Incidents et Risques',
      FINANCIAL: 'Rapport Financier et Marges Estimées d’Intervention',
    };

    const title = titles[type] || 'Rapport Analytique de Direction';

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${title} - HOREB SECURE</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 40px; background: #fff; }
    h1 { color: #0f172a; margin-bottom: 4px; font-size: 24px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 30px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .kpi-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-card .val { font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 6px; }
    .kpi-card .growth { font-size: 12px; color: #0284c7; margin-top: 4px; }
    .statements { background: #f1f5f9; border-left: 4px solid #0284c7; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px; }
    .statements h3 { margin-top: 0; color: #0f172a; font-size: 16px; }
    .statements ul { margin: 0; padding-left: 20px; }
    .statements li { margin-bottom: 6px; font-size: 14px; color: #334155; }
    .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Organisation ID : ${filters.organizationId} &bull; Période : ${periodLabel} &bull; Généré le : ${new Date().toLocaleString('fr-FR')}</div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="label">Total Alertes</div>
      <div class="val">${kpis.totalAlerts}</div>
      <div class="growth">${alertsGrowth}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Interventions</div>
      <div class="val">${kpis.totalInterventions}</div>
      <div class="growth">${interventionsGrowth}</div>
    </div>
    <div class="kpi-card">
      <div class="label">Respect SLA</div>
      <div class="val">${slaComplianceFormatted}</div>
      <div class="growth">${slaData.statusBreakdown.breached} dépassés</div>
    </div>
    <div class="kpi-card">
      <div class="label">Arrivée Moyenne</div>
      <div class="val">${kpis.formattedAvgArrivalDuration}</div>
      <div class="growth">Sur site</div>
    </div>
  </div>

  <div class="statements">
    <h3>Observations Factuelles Déduites des Données Réelles</h3>
    <ul>
      ${factualStatements.map(s => `<li>${s}</li>`).join('')}
    </ul>
  </div>

  <div class="footer">
    <span>HOREB SECURE — Security Business OS (Rapport Certifié)</span>
    <span>Données réelles extraites de l'instance opérationnelle</span>
  </div>
</body>
</html>
    `;

    return {
      title,
      type,
      generatedAt: new Date().toISOString(),
      periodLabel,
      organizationId: filters.organizationId,
      kpis,
      factualStatements,
      csvContent,
      htmlContent,
    };
  }
}

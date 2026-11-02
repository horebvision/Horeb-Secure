/**
 * SECURIA V2 — REPORT PARSER & SERIALIZER
 * Sérialisation canonique et désérialisation tolérante du rapport structuré d'intervention.
 * Garantit la rétro-compatibilité avec les rapports texte brut V1.
 */

import { StructuredAgentReport, DEFAULT_CHECKLIST, ReportStatus } from './types';

export function createEmptyReport(): StructuredAgentReport {
  return {
    version: '2.0',
    report_status: 'REPORT_DRAFT',
    findings: '',
    actions_taken: '',
    outcome: '',
    observations: '',
    damages: '',
    recommendations: '',
    checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item })),
    photos: [],
    gps: {},
    validation: {},
  };
}

export function isStructuredReport(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  let trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const unescaped = JSON.parse(trimmed);
      if (typeof unescaped === 'string') trimmed = unescaped.trim();
    } catch {}
  }
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

export function parseStructuredReport(raw: string | null | undefined): StructuredAgentReport {
  if (!raw || !raw.trim()) {
    return createEmptyReport();
  }

  let trimmed = raw.trim();

  // Tolérance si la chaîne a été doublement sérialisée avec guillemets externes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const unescaped = JSON.parse(trimmed);
      if (typeof unescaped === 'string') {
        trimmed = unescaped.trim();
      }
    } catch {}
  }

  // Détection d'un payload JSON structuré
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          version: '2.0',
          report_version: typeof parsed.report_version === 'number' ? parsed.report_version : 1,
          report_status: (parsed.report_status as ReportStatus) || 'REPORT_SUBMITTED',
          findings: parsed.findings || parsed.report || '',
          actions_taken: parsed.actions_taken || '',
          outcome: parsed.outcome || '',
          observations: parsed.observations || '',
          damages: parsed.damages || '',
          recommendations: parsed.recommendations || '',
          checklist: Array.isArray(parsed.checklist) ? parsed.checklist : DEFAULT_CHECKLIST,
          photos: Array.isArray(parsed.photos) ? parsed.photos : [],
          gps: parsed.gps || {},
          validation: parsed.validation || {},
          signature: parsed.signature || null,
        };
      }
    } catch {
      // En cas d'erreur de parse, traiter comme texte brut
    }
  }

  // Rétro-compatibilité V1 : Texte brut
  return {
    version: '2.0',
    report_status: 'REPORT_SUBMITTED',
    findings: trimmed,
    actions_taken: 'Levée de doute et sécurisation opérée par le patrouilleur.',
    outcome: 'Site contrôlé et sécurisé.',
    observations: '',
    damages: '',
    recommendations: '',
    checklist: DEFAULT_CHECKLIST.map((item) => ({
      ...item,
      checked: item.id === 'site_access_checked' || item.id === 'perimeter_checked',
    })),
    photos: [],
    gps: {},
    validation: {},
  };
}

/**
 * Extrait une synthèse textuelle claire et lisible par un humain
 * à partir de n'importe quel rapport (JSON structuré ou texte brut).
 */
export function getReportSummaryText(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return 'Zone sécurisée, vérifications terminées sans incident.';
  
  // Si ce n'est pas du JSON, retourner le texte brut directement
  if (!isStructuredReport(raw)) {
    return raw.trim();
  }

  const report = parseStructuredReport(raw);
  const elements: string[] = [];

  if (report.findings) {
    elements.push(`Constat : ${report.findings}`);
  }
  if (report.actions_taken && report.actions_taken !== 'Levée de doute et sécurisation opérée par le patrouilleur.') {
    elements.push(`Actions : ${report.actions_taken}`);
  }
  if (report.outcome && report.outcome !== report.findings) {
    elements.push(`Bilan : ${report.outcome}`);
  }
  if (report.damages && report.damages.toLowerCase() !== 'aucun' && report.damages.toLowerCase() !== 'ras') {
    elements.push(`Dommages : ${report.damages}`);
  }
  if (report.recommendations) {
    elements.push(`Conseil : ${report.recommendations}`);
  }

  if (elements.length === 0) {
    return report.outcome || report.findings || 'Intervention terminée avec succès.';
  }

  return elements.join(' • ');
}

export function serializeStructuredReport(report: StructuredAgentReport): string {
  return JSON.stringify(report);
}

// Alias pour compatibilité
export const parseAgentReport = parseStructuredReport;
export const serializeAgentReport = serializeStructuredReport;


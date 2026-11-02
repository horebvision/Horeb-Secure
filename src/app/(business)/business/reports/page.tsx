'use client';

import React, { useState } from 'react';
import { FileText, Download, Printer, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { ReportType } from '@/lib/reports/executive-report-builder';
import { authFetch } from '@/lib/utils/api-client';

export default function ReportsManagementPage() {
  const [selectedType, setSelectedType] = useState<ReportType>('MONTHLY');
  const [format, setFormat] = useState<'html' | 'csv'>('html');
  const [loading, setLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportCatalog: { type: ReportType; title: string; desc: string; defaultPeriod: string }[] = [
    { type: 'DAILY', title: 'Rapport Opérationnel Quotidien', desc: 'Synthèse des interventions et alertes de la journée.', defaultPeriod: "Aujourd'hui" },
    { type: 'WEEKLY', title: 'Rapport d’Activité Hebdomadaire', desc: 'Bilan sur 7 jours roulants des volumes et débits opérationnels.', defaultPeriod: '7 Jours' },
    { type: 'MONTHLY', title: 'Rapport Exécutif Mensuel Direction', desc: 'Rapport stratégique complet avec évolutions, SLA et synthèse.', defaultPeriod: '30 Jours' },
    { type: 'SLA', title: 'Rapport Analytique des SLA', desc: 'Audit des dépassements contractuels par site et par agent.', defaultPeriod: '30 Jours' },
    { type: 'AGENTS', title: 'Rapport de Performance Agents', desc: 'Détail factuel des délais de réponse, acceptation et missions.', defaultPeriod: '30 Jours' },
    { type: 'CLIENTS', title: 'Rapport d’Activité Clients', desc: 'Historique des sollicitations par compte client.', defaultPeriod: '30 Jours' },
    { type: 'SITES', title: 'Rapport d’Incidents par Site', desc: 'Fréquence, criticité et typologie des incidents par emplacement.', defaultPeriod: '30 Jours' },
    { type: 'INCIDENTS', title: 'Rapport Typologique des Incidents', desc: 'Distribution des risques et concentrations temporelles.', defaultPeriod: '30 Jours' },
    { type: 'FINANCIAL', title: 'Rapport Financier & Marges', desc: 'Chiffre d’affaires estimé, coûts horaires et marge brute.', defaultPeriod: '30 Jours' },
  ];

  const handleGenerate = async (targetFormat: 'html' | 'csv') => {
    try {
      setLoading(true);
      setError(null);

      if (targetFormat === 'csv') {
        window.open(`/api/business/reports?type=${selectedType}&format=csv`, '_blank');
        setLoading(false);
        return;
      }

      const res = await authFetch(`/api/business/reports?type=${selectedType}&format=html`);
      if (!res.ok) throw new Error('Erreur lors de la génération du rapport');
      const html = await res.text();
      setPreviewHtml(html);
    } catch (err: any) {
      setError(err.message || 'Impossible de générer le rapport');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!previewHtml) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(previewHtml);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          Générateur de Rapports Exécutifs Automatiques
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Production instantanée de rapports certifiés d'activité, conformité SLA et rentabilité en formats PDF / HTML et CSV.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCatalog.map((r) => {
          const isSelected = selectedType === r.type;
          return (
            <div
              key={r.type}
              onClick={() => {
                setSelectedType(r.type);
                setPreviewHtml(null);
              }}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-800/90 border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                  : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                  {r.defaultPeriod}
                </span>
                {isSelected && <CheckCircle className="w-4 h-4 text-cyan-400" />}
              </div>
              <h3 className="font-bold text-white text-sm mt-3">{r.title}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{r.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-400">Rapport sélectionné :</span>
          <div className="text-sm font-bold text-white">
            {reportCatalog.find((c) => c.type === selectedType)?.title}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleGenerate('html')}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Génération...' : 'Prévisualiser / Imprimer'}</span>
          </button>

          <button
            onClick={() => handleGenerate('csv')}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* Preview Section */}
      {previewHtml && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Printer className="w-4 h-4 text-cyan-400" />
              Aperçu du Rapport Prêt pour Impression PDF
            </h3>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer / Sauvegarder PDF</span>
            </button>
          </div>

          <div className="p-2 rounded-xl bg-white text-slate-900 overflow-auto max-h-[600px] border border-slate-300">
            <iframe
              srcDoc={previewHtml}
              title="Aperçu Rapport"
              className="w-full h-[550px] border-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { ShieldCheck, X, FileText } from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';

interface ResolutionReportModalProps {
  isOpen: boolean;
  alertId: string;
  alertNumber: string;
  agentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResolutionReportModal({
  isOpen,
  alertId,
  alertNumber,
  agentId,
  onClose,
  onSuccess,
}: ResolutionReportModalProps) {
  const [report, setReport] = useState('');
  const [checks, setChecks] = useState<string[]>([
    'Ronde périmétrique effectuée',
    'Issues et accès vérifiés',
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const toggleCheck = (item: string) => {
    setChecks((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report.trim()) {
      setErrorMsg('Veuillez rédiger un court compte-rendu pour clôturer la mission');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const formattedReport = `${report.trim()}${
      checks.length > 0 ? ` [Vérifications : ${checks.join(', ')}]` : ''
    }`;

    try {
      const res = await authFetch('/api/interventions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alertId,
          agent_id: agentId,
          action: 'COMPLETE',
          notes: formattedReport,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la clôture');
      }

      soundService.playConfirmation();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de transmettre le rapport');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-emerald-800/80 rounded-3xl shadow-2xl p-6 text-white space-y-4">
        {/* En-tête */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Clôture d'intervention</h3>
              <p className="text-xs text-emerald-300 font-mono">Mission {alertNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vérifications rapides */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Contrôles de sécurité effectués sur site :
            </label>
            <div className="space-y-1.5">
              {[
                'Ronde périmétrique effectuée',
                'Issues et accès vérifiés',
                'Contact direct établi avec le résident',
                'Aucune intrusion ni menace résiduelle',
                'Site remis sous alarme et sécurisé',
              ].map((item) => (
                <label
                  key={item}
                  className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={checks.includes(item)}
                    onChange={() => toggleCheck(item)}
                    className="rounded text-emerald-500 focus:ring-emerald-400 bg-slate-900 border-slate-700"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Compte-rendu détaillé des opérations :
            </label>
            <textarea
              rows={3}
              required
              value={report}
              onChange={(e) => setReport(e.target.value)}
              placeholder="Ex : Arrivée sur site à 14h25. Ronde complète extérieure et vérification des fenêtres arrière. Porte verrouillée, aucune trace d'effraction. Échange rassurant avec l'habitant. Mission achevée sans incident."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950"
            >
              <FileText className="w-4 h-4" />
              <span>{isSubmitting ? 'Enregistrement...' : 'CLÔTURER LA MISSION'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

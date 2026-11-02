'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Check } from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';

interface AbortMissionModalProps {
  isOpen: boolean;
  alertId: string;
  alertNumber: string;
  agentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_REASONS = [
  'Panne mécanique ou crevaison véhicule de patrouille',
  'Accident de circulation en cours de trajet',
  'Voie d’accès totalement bloquée / travaux infranchissables',
  'Danger vital imminent / effectif isolé en attente de renfort',
  'Malaise ou blessure physique de l’agent',
  'Autre motif impérieux',
];

export function AbortMissionModal({
  isOpen,
  alertId,
  alertNumber,
  agentId,
  onClose,
  onSuccess,
}: AbortMissionModalProps) {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_REASONS[0]);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    const fullReason = details.trim()
      ? `${selectedPreset} : ${details.trim()}`
      : selectedPreset;

    try {
      const res = await authFetch('/api/interventions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: alertId,
          agent_id: agentId,
          action: 'ABORT',
          notes: fullReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du signalement');
      }

      soundService.vibrate([200, 100, 200]);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de transmettre le signalement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-3xl shadow-2xl p-6 text-white space-y-4">
        {/* En-tête d'alerte */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Signaler une impossibilité</h3>
              <p className="text-xs text-rose-300 font-mono">Mission {alertNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300">
          En déclarant cette impossibilité d’intervenir, le centre de régulation sera alerté en priorité maximale pour réaffecter immédiatement un autre patrouilleur disponible.
        </p>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Motif principal constaté :
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {PRESET_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedPreset(reason)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs flex items-center justify-between border transition-all ${
                    selectedPreset === reason
                      ? 'bg-rose-950/50 border-rose-600 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="truncate pr-2">{reason}</span>
                  {selectedPreset === reason && (
                    <Check className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Précisions ou consignes pour le centre (facultatif) :
            </label>
            <textarea
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Ex : Attente dépanneuse sur A86, pneu avant droit éclaté..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
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
              className="flex-2 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{isSubmitting ? 'Transmission...' : 'TRANSMETTRE AU DISPATCH'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

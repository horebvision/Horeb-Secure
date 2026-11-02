'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  X,
  FileText,
  Camera,
  Trash2,
  Save,
  Send,
  CheckSquare,
  Square,
  AlertTriangle,
  Upload,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';
import { DEFAULT_CHECKLIST, ReportChecklistItem, ReportPhoto } from '@/lib/interventions/types';

interface AgentReportModalProps {
  isOpen: boolean;
  alertId: string;
  alertNumber: string;
  interventionId: string;
  agentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AgentReportModal({
  isOpen,
  alertId,
  alertNumber,
  interventionId,
  agentId,
  onClose,
  onSuccess,
}: AgentReportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [findings, setFindings] = useState('');
  const [actionsTaken, setActionsTaken] = useState('');
  const [outcome, setOutcome] = useState('');
  const [observations, setObservations] = useState('');
  const [damages, setDamages] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [checklist, setChecklist] = useState<ReportChecklistItem[]>(DEFAULT_CHECKLIST);
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isOfflineDraft, setIsOfflineDraft] = useState(false);

  const draftKey = `securia_draft_report_${interventionId || alertId}`;

  // Chargement du brouillon local s'il existe
  useEffect(() => {
    if (!isOpen) return;

    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.findings) setFindings(parsed.findings);
        if (parsed.actionsTaken) setActionsTaken(parsed.actionsTaken);
        if (parsed.outcome) setOutcome(parsed.outcome);
        if (parsed.observations) setObservations(parsed.observations);
        if (parsed.damages) setDamages(parsed.damages);
        if (parsed.recommendations) setRecommendations(parsed.recommendations);
        if (Array.isArray(parsed.checklist)) setChecklist(parsed.checklist);
        if (Array.isArray(parsed.photos)) setPhotos(parsed.photos);
        setIsOfflineDraft(true);
      }
    } catch {}
  }, [isOpen, draftKey]);

  if (!isOpen) return null;

  // Sauvegarde automatique du brouillon local
  const saveLocalDraft = (overrides?: any) => {
    try {
      const draftData = {
        findings,
        actionsTaken,
        outcome,
        observations,
        damages,
        recommendations,
        checklist,
        photos,
        updatedAt: new Date().toISOString(),
        ...overrides,
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      setIsOfflineDraft(true);
    } catch {}
  };

  const toggleChecklistItem = (id: string) => {
    const updated = checklist.map((item) =>
      item.id === id
        ? {
            ...item,
            checked: !item.checked,
            checked_at: !item.checked ? new Date().toISOString() : undefined,
          }
        : item
    );
    setChecklist(updated);
    saveLocalDraft({ checklist: updated });
  };

  // Traitement d'ajout de photo avec compression canvas WebP/JPEG
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length >= 6) {
      setErrorMsg('Nombre maximal de 6 photos atteint.');
      return;
    }

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionnement fluide pour mobile
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

          const newPhoto: ReportPhoto = {
            id: `p-${Date.now()}`,
            url: compressedDataUrl,
            caption: `Photo terrain (${photos.length + 1})`,
            timestamp: new Date().toISOString(),
            author_name: 'Agent Terrain',
          };

          const updated = [...photos, newPhoto];
          setPhotos(updated);
          saveLocalDraft({ photos: updated });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    const updated = photos.filter((p) => p.id !== id);
    setPhotos(updated);
    saveLocalDraft({ photos: updated });
  };

  // Enregistrement brouillon (serveur + local)
  const handleSaveDraft = async () => {
    setIsDraftSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    saveLocalDraft();

    try {
      const targetId = interventionId || alertId;
      const res = await authFetch(`/api/interventions/${targetId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findings,
          actions_taken: actionsTaken,
          outcome,
          observations,
          damages,
          recommendations,
          checklist,
          photos,
          is_draft: true,
          report_status: 'REPORT_DRAFT',
        }),
      });

      if (res.ok) {
        soundService.playConfirmation();
        setSuccessMsg('Brouillon sauvegardé sur le serveur avec succès.');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setSuccessMsg('Brouillon conservé localement sur votre appareil.');
      }
    } catch {
      setSuccessMsg('Mode hors-ligne : Brouillon conservé sur l’appareil.');
    } finally {
      setIsDraftSaving(false);
    }
  };

  // Soumission finale officielle
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findings.trim() || !actionsTaken.trim() || !outcome.trim()) {
      setErrorMsg(
        'Veuillez remplir au minimum : le Constat, les Actions menées et le Résultat final.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const targetId = interventionId || alertId;
      const res = await authFetch(`/api/interventions/${targetId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          findings: findings.trim(),
          actions_taken: actionsTaken.trim(),
          outcome: outcome.trim(),
          observations: observations.trim() || undefined,
          damages: damages.trim() || undefined,
          recommendations: recommendations.trim() || undefined,
          checklist,
          photos,
          is_draft: false,
          report_status: 'REPORT_SUBMITTED',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la transmission du rapport');
      }

      // Nettoyer le brouillon local
      localStorage.removeItem(draftKey);
      soundService.playConfirmation();
      soundService.vibrate([150, 100, 200]);

      onSuccess();
      onClose();
    } catch (err: any) {
      // Résilience hors connexion : sauvegarde locale IndexedDB et mise en file Outbox
      try {
        const { syncManager } = await import('@/lib/sync/sync-manager');
        const { offlineDb } = await import('@/lib/offline/indexed-db');
        const targetId = interventionId || alertId;
        const draftData = {
          findings: findings.trim(),
          actions_taken: actionsTaken.trim(),
          outcome: outcome.trim(),
          observations: observations.trim() || undefined,
          damages: damages.trim() || undefined,
          recommendations: recommendations.trim() || undefined,
          checklist,
          photos,
          saved_offline: true,
        };
        await offlineDb.saveDraftReport(targetId, draftData);
        await syncManager.enqueue('INTERVENTION_REPORT', targetId, 'REPORT_SUBMIT', draftData);
        soundService.playConfirmation();
        setSuccessMsg('Rapport enregistré sur l’appareil — en attente de synchronisation réseau');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } catch {
        setErrorMsg(err.message || 'Impossible de transmettre le rapport');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl text-white">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Rapport de Mission Terrain
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Mission #{alertNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOfflineDraft && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Brouillon local</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corps défilable */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-800 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-xs text-emerald-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1 : Constat initial */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>1. Constat Initial sur les Lieux *</span>
              <span className="text-[10px] text-slate-500 font-normal">Obligatoire</span>
            </label>
            <textarea
              rows={3}
              value={findings}
              onChange={(e) => {
                setFindings(e.target.value);
                saveLocalDraft({ findings: e.target.value });
              }}
              placeholder="Ex: Porte d’accès principale fermée, bruits suspects entendus dans la cour arrière..."
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          {/* Section 2 : Actions menées */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>2. Actions Menées par le Patrouilleur *</span>
              <span className="text-[10px] text-slate-500 font-normal">Obligatoire</span>
            </label>
            <textarea
              rows={3}
              value={actionsTaken}
              onChange={(e) => {
                setActionsTaken(e.target.value);
                saveLocalDraft({ actionsTaken: e.target.value });
              }}
              placeholder="Ex: Ronde périmétrique complète, inspection des baies vitrées, contact avec le gardien..."
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          {/* Section 3 : Résultat & Situation finale */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>3. Résultat & Situation Finale *</span>
              <span className="text-[10px] text-slate-500 font-normal">Obligatoire</span>
            </label>
            <textarea
              rows={2}
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                saveLocalDraft({ outcome: e.target.value });
              }}
              placeholder="Ex: Aucune intrusion confirmée, fausse alerte liée au vent, site remis sous alarme."
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          {/* Section 4 : Checklist opérationnelle */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Points de Contrôle Périmétrique
            </span>
            <div className="space-y-2">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggleChecklistItem(item.id)}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-900 cursor-pointer transition-colors"
                >
                  {item.checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span
                    className={`text-xs ${
                      item.checked ? 'text-white font-medium' : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5 : Photos & Pièces justificatives */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Photographies / Preuves ({photos.length}/6)
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300 flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                <span>Prendre Photo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {photos.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-5 border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl text-center cursor-pointer transition-colors"
              >
                <Upload className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                <p className="text-xs text-slate-400 font-semibold">
                  Ajouter des photos du site ou des dommages
                </p>
                <span className="text-[10px] text-slate-600 block mt-0.5">
                  Prendre une photo directement avec la caméra du smartphone
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center"
                  >
                    <img
                      src={p.url}
                      alt={p.caption || 'Preuve'}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/70 text-rose-400 hover:bg-rose-950 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {p.caption && (
                      <span className="absolute bottom-0 inset-x-0 bg-black/75 px-1.5 py-0.5 text-[9px] text-slate-300 truncate">
                        {p.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6 : Observations & Recommandations (Optionnels) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 block">
                Dommages éventuels
              </label>
              <input
                type="text"
                value={damages}
                onChange={(e) => {
                  setDamages(e.target.value);
                  saveLocalDraft({ damages: e.target.value });
                }}
                placeholder="Ex: Serrure endommagée..."
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 block">
                Recommandations client
              </label>
              <input
                type="text"
                value={recommendations}
                onChange={(e) => {
                  setRecommendations(e.target.value);
                  saveLocalDraft({ recommendations: e.target.value });
                }}
                placeholder="Ex: Remplacer le cadenas..."
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600"
              />
            </div>
          </div>

          {/* Boutons d'action : Brouillon & Soumission */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isDraftSaving || isSubmitting}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-95"
            >
              <Save className="w-4 h-4 text-cyan-400" />
              <span>{isDraftSaving ? 'Sauvegarde...' : 'Sauvegarder Brouillon'}</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isDraftSaving}
              className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting ? 'Transmission en cours...' : 'SOUMETTRE LE RAPPORT OFFICIEL'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

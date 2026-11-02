'use client';

import React, { useRef, useState, useEffect } from 'react';
import { PenTool, RotateCcw, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';

interface SignaturePadProps {
  interventionId: string;
  interventionNumber: string;
  siteName: string;
  clientName: string;
  reportSummary?: string;
  onSave: (signatureData: {
    signer_name: string;
    signer_role: string;
    signature_image: string;
    consent: boolean;
    consent_text: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const DEFAULT_CONSENT =
  "Je confirme avoir pris connaissance des informations présentées dans ce rapport d'intervention.";

export function SignaturePad({
  interventionId,
  interventionNumber,
  siteName,
  clientName,
  reportSummary,
  onSave,
  onClose,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState(clientName || '');
  const [signerRole, setSignerRole] = useState('CLIENT');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialisation du canvas avec résolution retina
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Définir la couleur et le style de trait
    ctx.strokeStyle = '#0284c7'; // sky-600
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fond blanc propre
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else if ('clientX' in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleValidate = async () => {
    if (!consentAccepted) {
      setError('Vous devez accepter la mention de consentement pour valider votre émargement.');
      return;
    }

    if (!hasDrawn) {
      setError('Veuillez tracer votre signature manuscrite dans le cadre ci-dessous.');
      return;
    }

    if (!signerName.trim()) {
      setError('Veuillez renseigner votre nom complet.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setSubmitting(true);
      setError(null);
      const dataUrl = canvas.toDataURL('image/png');

      await onSave({
        signer_name: signerName.trim(),
        signer_role: signerRole,
        signature_image: dataUrl,
        consent: true,
        consent_text: DEFAULT_CONSENT,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l’enregistrement de la signature.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-auto animate-in zoom-in-95 duration-200">
        {/* Titre Modal */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Émargement Numérique & Signature
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Validation contradictoire d'intervention • #{interventionNumber}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Récapitulatif Intervention (Section 18) */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Site Protégé :</span>
            <strong className="text-slate-200">{siteName}</strong>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Date & Heure :</span>
            <span className="font-mono text-slate-300">{new Date().toLocaleString('fr-FR')}</span>
          </div>
          {reportSummary && (
            <div className="pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span className="font-bold text-slate-300">Constat : </span>
              {reportSummary}
            </div>
          )}
        </div>

        {/* Formulaire Signataire */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Nom du Signataire</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nom et prénom..."
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Qualité / Rôle</label>
            <select
              value={signerRole}
              onChange={(e) => setSignerRole(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-cyan-500 outline-none"
            >
              <option value="CLIENT">Résident / Client Abonné</option>
              <option value="ON_SITE_REPRESENTATIVE">Représentant sur site</option>
              <option value="WITNESS">Témoin / Gardien</option>
              <option value="SECURITY_MANAGER">Superviseur Sécurité</option>
            </select>
          </div>
        </div>

        {/* Zone de Dessin Tactile (Canvas) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tracez votre signature au doigt ou au stylet :</span>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-[11px] font-bold text-cyan-400 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Effacer</span>
            </button>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-white overflow-hidden shadow-inner touch-none">
            <canvas
              ref={canvasRef}
              width={460}
              height={180}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-44 cursor-crosshair block"
            />
          </div>
        </div>

        {/* Mentions de Consentement Explicite (Section 19) */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-0"
            />
            <span className="leading-snug">
              <strong>J'accepte et je confirme : </strong>
              "{DEFAULT_CONSENT}"
            </span>
          </label>
          <p className="text-[10px] text-slate-500 font-mono leading-tight pl-6">
            Cette signature génère une empreinte numérique SHA-256 infalsifiable intégrée au dossier officiel Proof of Intervention.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleValidate}
            disabled={submitting || !consentAccepted || !hasDrawn}
            className={`py-2.5 px-6 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-lg transition-all ${
              submitting || !consentAccepted || !hasDrawn
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950 hover:scale-[1.02]'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? 'Validation...' : 'Signer et Valider'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

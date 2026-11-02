'use client';

import React, { useRef, useState, useEffect } from 'react';
import { PenTool, RotateCcw, Check, X, ShieldCheck, AlertCircle, Ban } from 'lucide-react';
import type { SignatureStatus } from '@/lib/secretariat/types';

interface VisitorSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitorName: string;
  onSave: (result: {
    signatureDataUrl?: string;
    signatureStatus: SignatureStatus;
    consent: boolean;
    refusalReason?: string;
  }) => void;
}

export const VISITOR_DEFAULT_CONSENT =
  'Je confirme l’exactitude de mon identité déclarée et consens à l’enregistrement de mon passage sur le registre de présence.';

export function VisitorSignatureModal({
  isOpen,
  onClose,
  visitorName,
  onSave,
}: VisitorSignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [isRefusalMode, setIsRefusalMode] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialisation canvas
  useEffect(() => {
    if (isOpen && !isRefusalMode) {
      setTimeout(() => {
        initCanvas();
      }, 50);
    }
  }, [isOpen, isRefusalMode]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#0284c7'; // sky-600
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

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
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRefusalMode) {
      if (!refusalReason.trim()) {
        setError('Veuillez indiquer le motif du refus ou de l’impossibilité de signer.');
        return;
      }
      onSave({
        signatureStatus: 'REFUSED',
        consent: false,
        refusalReason: refusalReason.trim(),
      });
      onClose();
      return;
    }

    if (!hasDrawn) {
      setError('Veuillez apposer votre signature sur le cadre blanc avant de valider.');
      return;
    }

    if (!consentAccepted) {
      setError('Le consentement à l’enregistrement de la présence doit être validé.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSave({
      signatureDataUrl: dataUrl,
      signatureStatus: 'SIGNED',
      consent: true,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-7 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Signature du Visiteur</h3>
              <p className="text-[11px] text-slate-400">Signataire : {visitorName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!isRefusalMode ? (
            <>
              {/* Cadre de dessin Canvas */}
              <div>
                <div className="flex items-center justify-between mb-1.5 text-xs text-slate-400">
                  <span>Signez à l'aide de l'écran tactile ou de la souris :</span>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Effacer</span>
                  </button>
                </div>
                <div className="rounded-2xl border-2 border-slate-700 bg-white overflow-hidden shadow-inner touch-none">
                  <canvas
                    ref={canvasRef}
                    width={460}
                    height={180}
                    className="w-full h-[180px] cursor-crosshair block"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>

              {/* Consentement */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-[11px] text-slate-300 leading-tight">
                  {VISITOR_DEFAULT_CONSENT}
                </span>
              </label>

              {/* Option Bascule Refus de signer */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setIsRefusalMode(true)}
                  className="text-[11px] text-slate-500 hover:text-rose-400 font-medium cursor-pointer"
                >
                  Visiteur refuse de signer ? Déclarer un refus
                </button>
              </div>
            </>
          ) : (
            /* Mode Refus de signature */
            <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
              <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                <Ban className="w-4 h-4 shrink-0" />
                <span>Déclaration de refus ou d’impossibilité de signature</span>
              </div>
              <p className="text-[11px] text-slate-300">
                La politique du site autorise la poursuite de l’enregistrement de présence sous réserve d’indiquer le motif :
              </p>
              <textarea
                rows={3}
                required
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                placeholder="Ex: Le visiteur refuse d’apposer sa signature sur support numérique, ou incapacité physique temporaire..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setIsRefusalMode(false)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                >
                  Revenir à la signature manuscrite
                </button>
              </div>
            </div>
          )}

          {/* Boutons validation */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer ${
                isRefusalMode
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950/40'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isRefusalMode ? 'Enregistrer le refus' : 'Valider la signature'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

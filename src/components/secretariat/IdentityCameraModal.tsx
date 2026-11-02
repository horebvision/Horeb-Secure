'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, Upload, AlertCircle, ShieldAlert } from 'lucide-react';

interface IdentityCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: 'RECTO' | 'VERSO';
  visitorName: string;
  onCapture: (base64Image: string) => void;
}

export function IdentityCameraModal({
  isOpen,
  onClose,
  documentType,
  visitorName,
  onCapture,
}: IdentityCameraModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Démarrage du flux caméra
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    if (isOpen && !capturedImage) {
      startCamera();
    }

    return () => {
      stopCamera(activeStream);
    };
  }, [isOpen]);

  const stopCamera = (st?: MediaStream | null) => {
    const s = st || stream;
    if (s) {
      s.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsStartingCamera(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La capture directe par caméra n’est pas supportée par ce navigateur.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Caméra arrière sur mobile si disponible
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('[IdentityCameraModal] Erreur caméra:', err);
      let msg = 'Accès à la caméra refusé ou indisponible.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Autorisation caméra refusée. Vous pouvez utiliser le mode fichier ci-dessous ou la saisie manuelle.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Aucun périphérique caméra détecté sur cet appareil.';
      }
      setCameraError(msg);
    } finally {
      setIsStartingCamera(false);
    }
  };

  // Capture instantanée depuis le flux vidéo
  const takeSnapshot = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const maxDim = 1200;
    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;

    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      // Compression JPEG qualité 0.82 (nettoyage stripping EXIF)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  // Traitement d'une photo importée via fichier / caméra native
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          setCapturedImage(dataUrl);
          stopCamera();
        }
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  };

  const handleValidate = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleClose();
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setCameraError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Photo Pièce d'Identité ({documentType})
              </h3>
              <p className="text-[11px] text-slate-400">Pour : {visitorName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Zone de prévisualisation ou vidéo */}
          <div className="relative rounded-2xl bg-black border border-slate-800 aspect-video overflow-hidden flex items-center justify-center">
            {capturedImage ? (
              <img
                src={capturedImage}
                alt={`Aperçu ${documentType}`}
                className="w-full h-full object-contain"
              />
            ) : cameraError ? (
              <div className="p-6 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Importer un fichier / Prendre une photo</span>
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Cadre de guidage pour document */}
                <div className="absolute inset-6 border-2 border-dashed border-cyan-400/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-[11px] font-bold text-cyan-300/80 bg-slate-950/60 px-2 py-0.5 rounded">
                    Centrez le {documentType.toLowerCase()} du document
                  </span>
                </div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Note de confidentialité & conformité */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
            <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Les documents sont chiffrés et conservés dans un stockage privé sécurisé pendant la durée de conservation interne.
            </span>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {capturedImage ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reprendre</span>
                </button>
                <button
                  type="button"
                  onClick={handleValidate}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Valider la photo</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Fichier</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(cameraError) || isStartingCamera}
                  onClick={takeSnapshot}
                  className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-950/40 ml-auto"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capturer la photo</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

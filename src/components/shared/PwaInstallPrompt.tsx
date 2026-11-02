'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Smartphone,
  Download,
  Share2,
  PlusSquare,
  X,
  Zap,
  Radio,
  WifiOff,
  MoreVertical,
  ArrowRight,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallPrompt() {
  const [isMobile, setIsMobile] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const checkStandalone = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIosStandalone = (window.navigator as any).standalone === true;
    return Boolean(isDisplayStandalone || isIosStandalone);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Détection si l'application tourne déjà en mode autonome
    if (checkStandalone()) {
      setIsStandalone(true);
      return;
    }

    // 2. Détection du type de terminal
    const ua = navigator.userAgent || '';
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 840;
    const detectedMobile = mobileRegex.test(ua) || (isTouch && isSmallScreen);
    setIsMobile(detectedMobile);

    const detectedIos =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(detectedIos);

    // 3. Récupération du prompt s'il a déjà été capturé
    if ((window as any)._deferredPwaPrompt) {
      setDeferredPrompt((window as any)._deferredPwaPrompt);
    }

    // 4. Capture des événements de cycle de vie PWA
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const pEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(pEvent);
      (window as any)._deferredPwaPrompt = pEvent;
    };

    const handlePromptReady = () => {
      if ((window as any)._deferredPwaPrompt) {
        setDeferredPrompt((window as any)._deferredPwaPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsOpen(false);
      setDeferredPrompt(null);
      (window as any)._deferredPwaPrompt = null;
      localStorage.setItem('securia_pwa_installed', 'true');
    };

    const handleManualTrigger = () => {
      setIsOpen(true);
      setIsMinimized(false);
      setShowIosGuide(false);
      setShowAndroidGuide(false);
      if ((window as any)._deferredPwaPrompt) {
        setDeferredPrompt((window as any)._deferredPwaPrompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('securia:pwa_prompt_ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('securia:open_pwa_install_prompt', handleManualTrigger);

    // 5. Affichage automatique discret sur mobile après un délai
    if (detectedMobile) {
      const dismissedUntil = localStorage.getItem('securia_pwa_dismissed_until');
      const now = Date.now();
      const isDismissed = dismissedUntil && Number(dismissedUntil) > now;

      const timer = setTimeout(() => {
        if (!isDismissed) {
          setIsOpen(true);
        } else {
          setIsMinimized(true);
        }
      }, 1500);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('securia:pwa_prompt_ready', handlePromptReady);
        window.removeEventListener('appinstalled', handleAppInstalled);
        window.removeEventListener('securia:open_pwa_install_prompt', handleManualTrigger);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('securia:pwa_prompt_ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('securia:open_pwa_install_prompt', handleManualTrigger);
    };
  }, [checkStandalone]);

  const handleInstallClick = async () => {
    // 1. Détection iOS : guide Safari obligatoire
    if (isIos) {
      setShowIosGuide(true);
      setShowAndroidGuide(false);
      return;
    }

    // 2. Déclenchement natif Chrome / Edge / Samsung Internet
    const promptToUse = deferredPrompt || (typeof window !== 'undefined' ? (window as any)._deferredPwaPrompt : null);
    if (promptToUse && typeof promptToUse.prompt === 'function') {
      try {
        await promptToUse.prompt();
        const choice = await promptToUse.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setIsInstalled(true);
          setIsOpen(false);
          localStorage.setItem('securia_pwa_installed', 'true');
        }
        setDeferredPrompt(null);
        (window as any)._deferredPwaPrompt = null;
        return;
      } catch (err) {
        console.warn('[PWA] Déclenchement automatique non supporté:', err);
      }
    }

    // 3. Fallback Android / Desktop si pas de prompt natif disponible
    setShowAndroidGuide(true);
    setShowIosGuide(false);
  };

  const handleDismiss = () => {
    setIsOpen(false);
    setShowIosGuide(false);
    setShowAndroidGuide(false);
    if (isMobile) {
      setIsMinimized(true);
      const next24Hours = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('securia_pwa_dismissed_until', String(next24Hours));
    }
  };

  // Ne jamais afficher si déjà installée en standalone
  if (isStandalone || isInstalled) {
    return null;
  }

  // Pillule compacte discrète sur mobile
  if (isMinimized && !isOpen && isMobile) {
    return (
      <div className="fixed bottom-20 right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
            setShowIosGuide(false);
            setShowAndroidGuide(false);
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 text-cyan-300 text-xs font-bold border border-cyan-500/50 shadow-xl shadow-cyan-950/40 backdrop-blur-md active:scale-95 transition-all"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
          <span>Installer l'application</span>
        </button>
      </div>
    );
  }

  // Si pas ouvert, ne rien afficher
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900/95 via-slate-900/95 to-slate-950/98 border border-cyan-500/30 rounded-3xl p-6 shadow-2xl shadow-cyan-950/60 overflow-hidden animate-in slide-in-from-bottom-6 duration-300">
        {/* Glow décoratif de fond */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Bouton Fermer */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Entête avec Icône de l'Application HOREB SECURE */}
        <div className="flex items-start gap-4 mb-5">
          <div className="relative shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 border border-cyan-500/40 p-2 shadow-lg shadow-cyan-950/50 flex items-center justify-center">
            <Image
              src="/icon-192.png"
              alt="HOREB SECURE App Icon"
              width={56}
              height={56}
              className="rounded-xl object-contain"
              priority
            />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center text-[10px] text-slate-950 font-black">
              ★
            </span>
          </div>

          <div className="flex-1 pr-6">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-mono text-[10px] font-extrabold uppercase tracking-wider">
                Application PWA
              </span>
            </div>
            <h2 className="text-base font-extrabold text-white leading-tight">
              Installer HOREB SECURE
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Plateforme opérationnelle de sécurité, de patrouille et d'intervention d'urgence.
            </p>
          </div>
        </div>

        {/* Guide iOS Safari */}
        {showIosGuide && (
          <div className="space-y-4 py-2 animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 space-y-2.5">
              <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>Installation sur iPhone / iPad (Safari) :</span>
              </div>

              <ol className="text-xs text-slate-300 space-y-2.5 pl-1">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Touchez l'icône <strong className="text-white">Partager</strong>{' '}
                    <Share2 className="w-3.5 h-3.5 inline-block text-cyan-400 mx-1" /> en bas de votre écran Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Faites défiler la liste vers le bas et appuyez sur{' '}
                    <strong className="text-white">Sur l'écran d'accueil</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline-block text-cyan-400 mx-1" />.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Touchez <strong className="text-emerald-400">Ajouter</strong> en haut à droite. L'application HOREB SECURE s'ouvrira en plein écran direct !
                  </span>
                </li>
              </ol>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/60 transition-all text-center"
            >
              J'ai compris, fermer
            </button>
          </div>
        )}

        {/* Guide Android / Chrome */}
        {showAndroidGuide && (
          <div className="space-y-4 py-2 animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-cyan-500/30 space-y-2.5">
              <div className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>Installation sur Android / Google Chrome :</span>
              </div>

              <ol className="text-xs text-slate-300 space-y-2.5 pl-1">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Appuyez sur le menu <strong className="text-white">Options</strong>{' '}
                    <MoreVertical className="w-3.5 h-3.5 inline-block text-cyan-400 mx-1" /> (les 3 points verticaux en haut à droite de Chrome).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Sélectionnez <strong className="text-white">Installer l'application</strong> ou <strong className="text-white">Ajouter à l'écran d'accueil</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Confirmez en appuyant sur <strong className="text-emerald-400">Installer</strong>. L'application HOREB SECURE sera installée sur votre appareil !
                  </span>
                </li>
              </ol>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/60 transition-all text-center"
            >
              J'ai compris, fermer
            </button>
          </div>
        )}

        {/* Vue Standard avec Avantages Métier */}
        {!showIosGuide && !showAndroidGuide && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 py-1">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Bouton SOS 1-Clic</div>
                  <div className="text-[11px] text-slate-400">Déclenchement immédiat sans passer par un navigateur</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Télémétrie & GPS Live</div>
                  <div className="text-[11px] text-slate-400">Suivi continu des patrouilles et alertes en direct</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Résilience Hors-Ligne</div>
                  <div className="text-[11px] text-slate-400">Accès garanti même en zone réseau faible ou coupée</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-950/60 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {isIos ? "Voir comment installer sur iPhone" : "Installer l'application sur mon appareil"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="w-full py-2 px-3 text-center text-slate-400 hover:text-white text-xs font-medium transition-colors"
              >
                Continuer sur le navigateur web
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

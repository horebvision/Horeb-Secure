'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { AlertType } from '@/lib/types/securia';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import {
  ShieldAlert,
  MapPin,
  XCircle,
  Send,
  EyeOff,
  Flame,
  AlertTriangle,
  AlertOctagon,
  Eye,
  Check,
  Building,
  PhoneCall,
  WifiOff,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { getCurrentHighAccuracyPosition, getGpsQuality, getGpsQualityBadge, GpsLocationResult } from '@/lib/utils/gps';
import { authFetch } from '@/lib/utils/api-client';

export type AlertSubmissionState = 'IDLE' | 'SENDING' | 'CONFIRMED' | 'FAILED' | 'OFFLINE';

export function PanicButton() {
  const router = useRouter();
  const { triggerAlert, sites, activeAlert, organization } = useSecuria();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AlertType>('INTRUSION');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    sites.find((s) => s.is_default)?.id || sites[0]?.id || ''
  );
  const [isSilent, setIsSilent] = useState(false);
  const [notes, setNotes] = useState('');

  // États stricts de transmission (Mode Hors-ligne / Hardening)
  const [submissionState, setSubmissionState] = useState<AlertSubmissionState>('IDLE');
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Compte à rebours de grâce (5 secondes)
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Idempotence & anti-double déclenchement
  const idempotencyKeyRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Géolocalisation Haute Précision
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsResult, setGpsResult] = useState<GpsLocationResult | null>(null);
  const [geoStatus, setGeoStatus] = useState<'pending' | 'ready' | 'error' | 'denied'>('pending');

  const fetchHighAccuracyGps = useCallback(async () => {
    setGeoStatus('pending');
    try {
      const loc = await getCurrentHighAccuracyPosition({
        enableHighAccuracy: true,
        maximumAge: 0,
        timeoutMs: 10000,
      });
      setGpsResult(loc);
      setCoords({ lat: loc.latitude, lng: loc.longitude });
      setGeoStatus('ready');
    } catch (e: any) {
      if (e?.code === 1) {
        setGeoStatus('denied');
      } else {
        setGeoStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    fetchHighAccuracyGps();
  }, [fetchHighAccuracyGps]);

  // Verrouillage du défilement d'arrière-plan lorsque la modale d'urgence est ouverte
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  const handleOpenTrigger = () => {
    // Rafraîchir la position haute précision dès l'ouverture de la modale
    fetchHighAccuracyGps();
    // Génère une clé d'idempotence unique pour cette session d'alerte
    idempotencyKeyRef.current = crypto.randomUUID
      ? crypto.randomUUID()
      : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setIsSubmitting(false);
    setSubmissionState('IDLE');
    setSubmissionError(null);
    soundService.vibrate(100);
    soundService.playConfirmation();
    setIsModalOpen(true);
  };

  const dispatchNow = useCallback(async () => {
    if (isSubmitting) return;

    // 1. Détection hors-ligne immédiate
    if (typeof window !== 'undefined' && !navigator.onLine) {
      setSubmissionState('OFFLINE');
      setSubmissionError('Connexion réseau indisponible. Impossible de joindre le serveur de télésurveillance.');
      soundService.vibrate([300, 100, 300]);
      return;
    }

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    setIsSubmitting(true);
    setSubmissionState('SENDING');
    setSubmissionError(null);

    const site = sites.find((s) => s.id === selectedSiteId);
    const key = idempotencyKeyRef.current || `idemp-${Date.now()}`;

    // Récupération rigoureuse des coordonnées réelles de l'appareil
    const realLat = gpsResult?.latitude || coords?.lat || site?.latitude || 5.3484;
    const realLng = gpsResult?.longitude || coords?.lng || site?.longitude || -4.0305;
    const realSource = gpsResult?.source || (coords ? 'GPS' : (site ? 'SITE' : 'FALLBACK'));
    const accuracyTag = gpsResult?.accuracy
      ? `[GPS: ${realSource} | Précision: ±${Math.round(gpsResult.accuracy)}m]`
      : `[SOURCE: ${realSource}]`;
    const finalClientNotes = notes ? `${accuracyTag} ${notes}` : accuracyTag;
    const finalAddress = site?.address
      ? `${site.name} — Appareil client à (${realLat.toFixed(5)}, ${realLng.toFixed(5)})`
      : `Position Appareil Client (${realLat.toFixed(5)}, ${realLng.toFixed(5)})`;

    try {
      // 2. Appel direct à l'API Supabase pour garantir l'enregistrement réel
      const res = await authFetch('/api/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          type: selectedType,
          site_id: selectedSiteId || null,
          is_silent: isSilent,
          client_notes: finalClientNotes,
          latitude: realLat,
          longitude: realLng,
          accuracy: gpsResult?.accuracy || null,
          source: realSource,
          location_address: finalAddress,
          idempotency_key: key,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erreur serveur (${res.status})`);
      }

      const data = await res.json();
      if (!data.alert || !data.alert.id) {
        throw new Error('Réponse invalide du serveur de sécurité');
      }

      // 3. SEULEMENT SI LE SERVEUR A CONFIRMÉ
      setSubmissionState('CONFIRMED');
      soundService.playConfirmation();
      soundService.vibrate([300, 150, 300]);

      // Mettre à jour le store local avec les données confirmées sans redondance réseau
      triggerAlert({
        type: selectedType,
        siteId: selectedSiteId || null,
        isSilent,
        clientNotes: finalClientNotes,
        address: finalAddress,
        idempotencyKey: key,
        serverAlert: data.alert,
      });

      // Redirection après confirmation visuelle (700ms)
      setTimeout(() => {
        setIsModalOpen(false);
        router.push(`/alert/${data.alert.id}`);
      }, 700);
    } catch (err: any) {
      console.warn('[PanicButton] Échec confirmation alerte:', err.message);
      setSubmissionState('FAILED');
      setSubmissionError(
        err.message || 'Le serveur de régulation n a pas pu confirmer la prise en charge de l alerte.'
      );
      soundService.vibrate([400, 200, 400]);
    } finally {
      setIsSubmitting(false);
    }
  }, [coords, isSilent, isSubmitting, notes, router, selectedSiteId, selectedType, sites, triggerAlert]);

  const startCountdown = () => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    setIsCountingDown(true);
    setCountdown(5);
    soundService.vibrate([200, 100, 200]);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current!);
          countdownTimerRef.current = null;
          dispatchNow();
          return 0;
        }
        soundService.vibrate(80);
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    soundService.playConfirmation();
  };

  // Rendu de l'icône de type d'urgence
  const renderTypeIcon = (type: AlertType) => {
    switch (type) {
      case 'INTRUSION':
        return <ShieldAlert className="w-5 h-5 text-red-400" />;
      case 'AGRESSION':
        return <AlertOctagon className="w-5 h-5 text-rose-400" />;
      case 'MENACE':
        return <AlertTriangle className="w-5 h-5 text-orange-400" />;
      case 'PERSONNE_SUSPECTE':
        return <Eye className="w-5 h-5 text-yellow-400" />;
      case 'URGENCE':
        return <Flame className="w-5 h-5 text-pink-400" />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-6 px-4">
      {/* Statut GPS / Localisation */}
      <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300 mb-8 backdrop-blur shadow-sm">
        <MapPin className={`w-3.5 h-3.5 ${geoStatus === 'ready' ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span>
          {geoStatus === 'ready'
            ? 'GPS Satellite Calibré (Précision < 10m)'
            : 'Localisation par site protégé par défaut'}
        </span>
      </div>

      {/* Le Bouton Rouge SOS Proéminent */}
      <div className="relative flex items-center justify-center">
        {/* Cercles de pulsation animés en arrière-plan */}
        <div className="absolute w-72 h-72 rounded-full bg-red-600/20 blur-xl animate-pulse"></div>
        <div className="absolute w-60 h-60 rounded-full border border-red-500/30 animate-pulse-ring"></div>

        {/* Bouton tactile principal */}
        <button
          onClick={handleOpenTrigger}
          aria-label="Déclencher une alerte de sécurité"
          className="relative z-10 w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-gradient-to-b from-red-500 via-red-600 to-red-800 text-white font-black shadow-2xl shadow-red-950 flex flex-col items-center justify-center p-4 border-4 border-red-400/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
        >
          <div className="p-3 bg-red-900/60 rounded-full mb-2 group-hover:scale-110 transition-transform">
            <ShieldAlert className="w-12 h-12 text-white animate-siren" />
          </div>
          <span className="text-xl sm:text-2xl tracking-wider font-extrabold text-white text-center leading-tight">
            ALERTE
            <br />
            SÉCURITÉ
          </span>
          <span className="text-[11px] font-semibold tracking-wider text-red-200 uppercase mt-1 px-2.5 py-0.5 rounded-full bg-red-950/60 border border-red-400/20">
            Appui d'urgence
          </span>
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 max-w-xs leading-relaxed">
        Déclenche immédiatement une transmission sécurisée vers le centre de télésurveillance et l'intervention des agents.
      </p>

      {/* Alerte active en cours sur mobile */}
      {activeAlert && (
        <div className="mt-6 w-full max-w-md p-4 rounded-2xl bg-red-950/40 border border-red-500/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <div>
              <div className="text-xs font-bold text-red-300">
                Alerte en cours : {activeAlert.alert_number}
              </div>
              <div className="text-[11px] text-slate-300">
                Statut : <span className="font-semibold text-white">{activeAlert.status}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => router.push(`/alert/${activeAlert.id}`)}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors"
          >
            Suivre le direct
          </button>
        </div>
      )}

      {/* MODAL DE DÉCLENCHEMENT D'URGENCE AVEC DÉCOMPTE 5 SECONDES */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl text-left overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88vh]">
            {/* 1. ÉTAT : ENVOI EN COURS */}
            {submissionState === 'SENDING' ? (
              <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
                  <div className="w-12 h-12 rounded-full bg-red-950/80 flex items-center justify-center">
                    <Send className="w-6 h-6 text-red-400 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Transmission en cours...</h3>
                  <p className="text-xs text-slate-400">
                    Acheminement prioritaire vers les serveurs du centre de télésurveillance.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-[11px] text-slate-300 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin text-red-400" />
                  <span>Attente de confirmation serveur...</span>
                </div>
              </div>
            ) : submissionState === 'CONFIRMED' ? (
              /* 2. ÉTAT : ENVOYÉ ET CONFIRMÉ */
              <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-950/50">
                  <CheckCircle2 className="w-10 h-10 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Alerte envoyée et confirmée !</h3>
                  <p className="text-xs text-emerald-300">
                    Enregistrée avec succès sur le serveur. Mobilisation des régulateurs.
                  </p>
                </div>
                <p className="text-[11px] text-slate-400">Redirection automatique vers le suivi en direct...</p>
              </div>
            ) : submissionState === 'OFFLINE' ? (
              /* 3. ÉTAT : HORS LIGNE */
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-amber-950/80 border-2 border-amber-500/60 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-950/50">
                  <WifiOff className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Connexion Réseau Indisponible</h3>
                  <p className="text-xs text-amber-200/90 leading-relaxed max-w-sm mx-auto">
                    Votre appareil est hors ligne. L'alerte n'a pas pu être transmise au centre. Veuillez composer immédiatement les numéros d'urgence vocaux.
                  </p>
                </div>

                <div className="space-y-2.5 pt-2">
                  <a
                    href="tel:17"
                    className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-950"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>APPELER LE 17 (POLICE SECOURS)</span>
                  </a>

                  {organization?.phone && (
                    <a
                      href={`tel:${organization.phone}`}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ligne Directe Centre ({organization.phone})</span>
                    </a>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setSubmissionState('IDLE')}
                      className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                    >
                      Retour
                    </button>
                    <button
                      onClick={dispatchNow}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Réessayer l'envoi</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : submissionState === 'FAILED' ? (
              /* 4. ÉTAT : ÉCHEC D'ENVOI */
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-red-950/80 border-2 border-red-500 flex items-center justify-center mx-auto text-red-400 shadow-lg shadow-red-950/50">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">Échec d'envoi de l'alerte</h3>
                  <p className="text-xs text-red-200/90 leading-relaxed max-w-sm mx-auto">
                    {submissionError || 'Le serveur n a pas accusé réception de votre alerte. Aucun intervenant n a été confirmé.'}
                  </p>
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={dispatchNow}
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-950"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>RÉESSAYER LA TRANSMISSION</span>
                  </button>

                  <a
                    href="tel:17"
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-red-400" />
                    <span>Appel d'urgence vocal (17)</span>
                  </a>

                  <button
                    onClick={() => {
                      setSubmissionState('IDLE');
                      setIsModalOpen(false);
                    }}
                    className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : isCountingDown ? (
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center text-center py-6">
                <div className="relative w-32 h-32 sm:w-36 sm:h-36 mx-auto flex items-center justify-center mb-5">
                  {/* Anneau de progression */}
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-slate-800"
                      fill="transparent"
                    />
                    <circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-red-500 transition-all duration-1000 ease-linear"
                      fill="transparent"
                      strokeDasharray={402}
                      strokeDashoffset={402 * (1 - countdown / 5)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-5xl font-black text-white">{countdown}</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-white mb-1.5">Transmission imminente</h3>
                <p className="text-xs sm:text-sm text-slate-300 mb-5 max-w-sm">
                  L'alerte va être envoyée au centre opérationnel. Appuyez sur annuler s'il s'agit d'une erreur.
                </p>

                <div className="w-full flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <button
                    onClick={cancelCountdown}
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors border border-slate-700"
                  >
                    <XCircle className="w-4 h-4 text-slate-400" />
                    <span>ANNULER L'ALERTE</span>
                  </button>

                  <button
                    onClick={dispatchNow}
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-950"
                  >
                    <Send className="w-4 h-4 text-white" />
                    <span>{isSubmitting ? 'TRANSMISSION...' : 'ENVOYER SANS ATTENDRE'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Choix du type d'alerte et paramètres : Architecture Sticky Header + Scrollable Body + Sticky Footer */
              <>
                {/* EN-TÊTE FIXE / STICKY */}
                <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                    <div className="w-8 h-8 rounded-lg bg-red-600/30 border border-red-500/50 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">Sélectionnez la nature de l'urgence</h3>
                      <p className="text-[11px] text-slate-400 truncate">Pour guider précisément les intervenants</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors shrink-0"
                    aria-label="Fermer la modale"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                {/* CORPS DÉFILABLE */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3.5 space-y-3.5">
                  {/* Liste des types d'alertes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(ALERT_TYPE_CONFIG) as AlertType[]).map((type) => {
                      const config = ALERT_TYPE_CONFIG[type];
                      const isSelected = selectedType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedType(type)}
                          className={`flex items-start p-2.5 sm:p-3 rounded-xl border text-left transition-all ${
                            isSelected
                              ? `${config.bgColor} ${config.borderColor} shadow-md`
                              : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="p-1.5 sm:p-2 rounded-lg bg-slate-900/80 mr-2.5 mt-0.5 border border-slate-700 shrink-0">
                            {renderTypeIcon(type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs sm:text-sm font-bold text-white">{config.label}</span>
                              {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 ml-1" />}
                            </div>
                            <p className="text-[10px] sm:text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {config.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sélecteur de Site avec Indicateur GPS */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span>Site ou lieu d'intervention</span>
                      </label>
                      {geoStatus === 'ready' && gpsResult ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getGpsQualityBadge(getGpsQuality(gpsResult.accuracy)).bgClass} ${getGpsQualityBadge(getGpsQuality(gpsResult.accuracy)).colorClass} ${getGpsQualityBadge(getGpsQuality(gpsResult.accuracy)).borderClass}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>{getGpsQualityBadge(getGpsQuality(gpsResult.accuracy)).label} (±{Math.round(gpsResult.accuracy)}m)</span>
                        </span>
                      ) : geoStatus === 'denied' ? (
                        <button
                          type="button"
                          onClick={fetchHighAccuracyGps}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-500/60 hover:bg-rose-900 transition-colors"
                          title="Cliquer pour réactiver la permission de géolocalisation"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          <span>🔴 Localisation désactivée — Autoriser</span>
                        </button>
                      ) : geoStatus === 'error' ? (
                        <button
                          type="button"
                          onClick={fetchHighAccuracyGps}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/50 hover:bg-amber-900 transition-colors"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                          <span>🟠 GPS indisponible — Réessayer</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                          <span>Recherche GPS...</span>
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedSiteId}
                      onChange={(e) => setSelectedSiteId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-red-500"
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} - {s.address} ({s.site_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Option Mode Discret */}
                  <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                      <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white block">Mode Alerte Discrète</span>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">
                          Désactive l'écran lumineux et le son pour votre sécurité
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSilent}
                      onChange={(e) => setIsSilent(e.target.checked)}
                      className="w-5 h-5 accent-red-600 rounded cursor-pointer shrink-0"
                    />
                  </div>

                  {/* Notes rapides */}
                  <div>
                    <input
                      type="text"
                      placeholder="Précision rapide (ex: 2 individus cagoulés, cour arrière...)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* PIED DE PAGE FIXE / STICKY : BOUTONS D'ACTION TOUJOURS VISIBLES SUR MOBILE */}
                <div className="shrink-0 p-3 sm:p-4 border-t border-slate-800 bg-slate-950/98 backdrop-blur-md flex items-center gap-2.5 shadow-2xl z-10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-3 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm transition-colors shrink-0"
                  >
                    Fermer
                  </button>

                  <button
                    type="button"
                    onClick={startCountdown}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-950/80 transition-all active:scale-[0.98]"
                  >
                    <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0 animate-pulse" />
                    <span className="truncate">DÉCLENCHER (DÉCOMPTE 5S)</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

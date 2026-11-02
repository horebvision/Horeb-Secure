'use client';

import React, { useEffect, useState } from 'react';
import { soundService } from '@/modules/notifications/sound.service';
import { Volume2, VolumeX, BellRing, CheckCircle2, AlertOctagon } from 'lucide-react';

export function AudioControlBanner() {
  const [audioState, setAudioState] = useState({
    isUnlocked: false,
    isRinging: false,
    volume: 0.85,
  });

  useEffect(() => {
    const unsubscribe = soundService.subscribeState((state) => {
      setAudioState(state);
    });
    return unsubscribe;
  }, []);

  const handleUnlock = async () => {
    await soundService.unlockAudio();
    soundService.playConfirmation();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    soundService.setVolume(val);
  };

  return (
    <div className={`p-3 rounded-2xl border transition-all duration-300 flex flex-wrap items-center justify-between gap-3 ${
      audioState.isRinging
        ? 'bg-rose-950/90 border-red-500 shadow-lg shadow-rose-950/50 animate-pulse'
        : audioState.isUnlocked
        ? 'bg-slate-900/90 border-slate-800 text-slate-300'
        : 'bg-amber-950/40 border-amber-500/60 text-amber-200'
    }`}>
      {/* Statut sonore */}
      <div className="flex items-center space-x-2.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
          audioState.isRinging
            ? 'bg-red-600 text-white animate-bounce'
            : audioState.isUnlocked
            ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-400'
            : 'bg-amber-500/20 border border-amber-500/40 text-amber-400'
        }`}>
          {audioState.isRinging ? (
            <BellRing className="w-4 h-4" />
          ) : audioState.isUnlocked ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-white">
              {audioState.isRinging
                ? '🚨 SIRÈNE EN COURS — ALERTE CRITIQUE NON ACQUITTÉE'
                : audioState.isUnlocked
                ? 'Système audio opérationnel'
                : 'Attention : Alertes sonores en attente d’activation'}
            </span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
              audioState.isUnlocked
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
            }`}>
              {audioState.isUnlocked ? 'SON ACTIVÉ' : 'ACTIVATION REQUISE'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {audioState.isUnlocked
              ? 'Le SOC sonnera de manière répétitive à chaque nouvelle alerte jusqu’à son acquittement.'
              : 'Cliquez ci-contre pour autoriser le navigateur à diffuser la sonnerie d’urgence.'}
          </p>
        </div>
      </div>

      {/* Contrôles interactifs */}
      <div className="flex items-center space-x-3">
        {/* Curseur de volume */}
        <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800">
          <Volume2 className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audioState.volume}
            onChange={handleVolumeChange}
            className="w-16 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            title={`Volume : ${Math.round(audioState.volume * 100)}%`}
          />
          <span className="text-[10px] font-mono font-bold text-slate-300 w-7 text-right">
            {Math.round(audioState.volume * 100)}%
          </span>
        </div>

        {/* Bouton d'activation prioritaire si non débloqué */}
        {!audioState.isUnlocked && (
          <button
            onClick={handleUnlock}
            type="button"
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-950 animate-pulse"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>ACTIVER LE SON</span>
          </button>
        )}
      </div>
    </div>
  );
}

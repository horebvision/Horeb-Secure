'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { formatDurationSeconds, AlertSlaSummary } from '@/lib/sla';
import { Clock, AlertTriangle, AlertOctagon } from 'lucide-react';

interface SlaLiveTimerProps {
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
  targetSeconds?: number;
  warningSeconds?: number;
  isCompleted?: boolean;
  label?: string;
  compact?: boolean;
  slaSummary?: AlertSlaSummary;
}

export function SlaLiveTimer({
  startTime: propStartTime,
  endTime: propEndTime,
  targetSeconds: propTargetSeconds,
  warningSeconds: propWarningSeconds,
  isCompleted: propIsCompleted = false,
  label: propLabel,
  compact = false,
  slaSummary,
}: SlaLiveTimerProps) {
  // Dérivation depuis slaSummary si fourni
  const activeStep = slaSummary?.currentActiveStep;

  const startTime = slaSummary ? activeStep?.startTime : propStartTime;
  const endTime = slaSummary ? activeStep?.endTime : propEndTime;
  const targetSeconds = slaSummary ? (activeStep?.targetSeconds ?? 300) : (propTargetSeconds ?? 300);
  const warningSeconds = slaSummary ? (activeStep?.warningSeconds ?? 240) : (propWarningSeconds ?? 240);
  const isCompleted = slaSummary ? (!activeStep || activeStep.isCompleted) : propIsCompleted;
  const label = slaSummary ? (activeStep?.label ?? 'SLA :') : propLabel;

  // Calcul instantané initial
  const calculateElapsed = () => {
    if (!startTime) return 0;
    const startMs = new Date(startTime).getTime();
    const endMs = endTime ? new Date(endTime).getTime() : Date.now();
    return Math.max(0, Math.floor((endMs - startMs) / 1000));
  };

  const [elapsedSec, setElapsedSec] = useState<number>(calculateElapsed);

  useEffect(() => {
    // Si l'étape est achevée ou pas de début, pas besoin de timer actif
    if (isCompleted || !startTime || endTime) {
      setElapsedSec(calculateElapsed());
      return;
    }

    setElapsedSec(calculateElapsed());
    const interval = setInterval(() => {
      setElapsedSec(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, isCompleted]);

  const remainingSec = targetSeconds - elapsedSec;
  const isBreached = elapsedSec > targetSeconds;
  const isAtRisk = !isBreached && elapsedSec >= warningSeconds;

  const colorClasses = useMemo(() => {
    if (isBreached) {
      return {
        text: 'text-rose-400 font-extrabold',
        bg: 'bg-rose-950/40 border-rose-600/60',
        badge: 'bg-rose-950 text-rose-300 border-rose-500',
      };
    }
    if (isAtRisk) {
      return {
        text: 'text-amber-400 font-bold',
        bg: 'bg-amber-950/40 border-amber-600/60',
        badge: 'bg-amber-950 text-amber-300 border-amber-500',
      };
    }
    return {
      text: 'text-emerald-400 font-semibold',
      bg: 'bg-slate-950 border-slate-800',
      badge: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    };
  }, [isBreached, isAtRisk]);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-mono ${colorClasses.bg}`}
        title={`Objectif SLA étape : ${formatDurationSeconds(targetSeconds)}`}
      >
        <Clock className={`w-3 h-3 ${isBreached ? 'text-rose-400 animate-pulse' : isAtRisk ? 'text-amber-400' : 'text-slate-400'}`} />
        <span className={colorClasses.text}>{formatDurationSeconds(elapsedSec)}</span>
        <span className="text-slate-600">/</span>
        <span className="text-slate-400">{formatDurationSeconds(targetSeconds)}</span>
      </div>
    );
  }

  return (
    <div className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-mono ${colorClasses.bg}`}>
      <div className="flex items-center gap-1.5">
        {isBreached ? (
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-bounce" />
        ) : isAtRisk ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="text-slate-300 font-sans text-[11px] font-medium">
          {label || 'Temps étape :'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={colorClasses.text}>
          {formatDurationSeconds(elapsedSec)}
        </span>
        <span className="text-slate-600 text-[10px]">•</span>
        <span className="text-slate-400 text-[11px]">
          {isBreached ? (
            <span className="text-rose-400 font-bold">
              Retard : +{formatDurationSeconds(Math.abs(remainingSec))}
            </span>
          ) : (
            <span>
              Reste : {formatDurationSeconds(remainingSec)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

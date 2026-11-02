'use client';

import React, { useState } from 'react';
import { Shield, Car, CheckCircle2, PauseCircle, PowerOff } from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { getBrowserClient } from '@/lib/supabase/client';

import { authFetch } from '@/lib/utils/api-client';

interface DutyStatusSelectorProps {
  agentId: string;
  badgeNumber: string;
  agentName?: string;
  patrolVehicle?: string | null;
  currentStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY' | 'DISPATCHED';
  onStatusChange: (newStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY') => void;
}

export function DutyStatusSelector({
  agentId,
  badgeNumber,
  agentName,
  patrolVehicle,
  currentStatus,
  onStatusChange,
}: DutyStatusSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSelect = async (status: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY') => {
    if (status === currentStatus || isUpdating) return;
    setIsUpdating(true);
    soundService.vibrate(100);

    try {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('securia_agent_duty_status', status);
        } catch {}
      }

      const res = await authFetch('/api/agent/duty-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          duty_status: status,
        }),
      });

      if (res.ok) {
        soundService.playConfirmation();
        onStatusChange(status);
      }
    } catch (err) {
      console.error('Erreur changement statut:', err);
      // Maintien du statut en local même si réseau intermittent
      onStatusChange(status);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
      {/* Profil Agent & Véhicule */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center font-mono font-bold text-cyan-300 text-xs">
            {badgeNumber || 'AGT'}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-extrabold text-white">
                {agentName ? `${agentName} (${badgeNumber})` : `Patrouille ${badgeNumber}`}
              </span>
            </div>
            {patrolVehicle && (
              <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                <Car className="w-3 h-3 text-slate-500" />
                <span className="truncate max-w-[200px]">{patrolVehicle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Indicateur visuel d'état */}
        <div className="text-right">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
              currentStatus === 'AVAILABLE'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                : currentStatus === 'DISPATCHED'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 animate-pulse'
                : currentStatus === 'BUSY'
                ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentStatus === 'AVAILABLE'
                  ? 'bg-emerald-400'
                  : currentStatus === 'DISPATCHED'
                  ? 'bg-cyan-400 animate-ping'
                  : currentStatus === 'BUSY'
                  ? 'bg-amber-400'
                  : 'bg-slate-400'
              }`}
            />
            {currentStatus === 'AVAILABLE' && 'Disponible'}
            {currentStatus === 'DISPATCHED' && 'En mission'}
            {currentStatus === 'BUSY' && 'Occupé'}
            {currentStatus === 'OFF_DUTY' && 'Hors service'}
          </span>
        </div>
      </div>

      {/* Boutons Sélecteurs Tactiles 3 États */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => handleSelect('AVAILABLE')}
          className={`py-2 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            currentStatus === 'AVAILABLE'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950 border border-emerald-400'
              : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Disponible</span>
        </button>

        <button
          type="button"
          disabled={isUpdating}
          onClick={() => handleSelect('BUSY')}
          className={`py-2 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            currentStatus === 'BUSY'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-950 border border-amber-400'
              : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <PauseCircle className="w-4 h-4 text-amber-400" />
          <span>Occupé</span>
        </button>

        <button
          type="button"
          disabled={isUpdating}
          onClick={() => handleSelect('OFF_DUTY')}
          className={`py-2 px-2 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
            currentStatus === 'OFF_DUTY'
              ? 'bg-slate-700 text-white shadow-lg border border-slate-500'
              : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <PowerOff className="w-4 h-4 text-slate-400" />
          <span>Hors service</span>
        </button>
      </div>
    </div>
  );
}

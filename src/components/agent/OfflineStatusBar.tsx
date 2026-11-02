'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { syncManager, SyncStatusState } from '@/lib/sync/sync-manager';

interface OfflineStatusBarProps {
  onOpenSyncCenter?: () => void;
}

export function OfflineStatusBar({ onOpenSyncCenter }: OfflineStatusBarProps) {
  const [syncState, setSyncState] = useState<SyncStatusState>({
    connectivity: 'ONLINE',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    isSyncing: false,
  });

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  const { connectivity, pendingCount, isSyncing } = syncState;

  // Configuration visuelle selon l'état
  let config = {
    bg: 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300',
    dot: 'bg-emerald-400',
    icon: <Wifi className="w-3.5 h-3.5" />,
    label: 'Connecté (En ligne)',
  };

  if (isSyncing) {
    config = {
      bg: 'bg-blue-950/80 border-blue-800/60 text-blue-300',
      dot: 'bg-blue-400 animate-spin',
      icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
      label: 'Synchronisation en cours...',
    };
  } else if (connectivity === 'OFFLINE') {
    config = {
      bg: 'bg-rose-950/90 border-rose-800/80 text-rose-300',
      dot: 'bg-rose-500 animate-pulse',
      icon: <WifiOff className="w-3.5 h-3.5" />,
      label: 'Hors connexion (Mode Local Sécurisé)',
    };
  } else if (pendingCount > 0) {
    config = {
      bg: 'bg-amber-950/80 border-amber-800/60 text-amber-300',
      dot: 'bg-amber-400',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
      label: `${pendingCount} action(s) en attente`,
    };
  }

  return (
    <div
      onClick={onOpenSyncCenter}
      className={`cursor-pointer px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center justify-between gap-2 shadow-lg transition-all ${config.bg}`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        <span className="flex items-center gap-1.5">{config.icon}</span>
        <span className="truncate max-w-[200px] sm:max-w-none">{config.label}</span>
      </div>

      {pendingCount > 0 && !isSyncing && (
        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold border border-amber-500/40">
          Sync
        </span>
      )}
    </div>
  );
}

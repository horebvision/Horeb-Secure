'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  FileText,
  Camera,
  Car,
} from 'lucide-react';
import { syncManager, SyncStatusState } from '@/lib/sync/sync-manager';
import { offlineDb, OutboxItem } from '@/lib/offline/indexed-db';

interface SyncCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyncCenterModal({ isOpen, onClose }: SyncCenterModalProps) {
  const [syncState, setSyncState] = useState<SyncStatusState>({
    connectivity: 'ONLINE',
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    isSyncing: false,
  });
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });

    offlineDb.getPendingOutbox().then((outbox) => {
      setItems(outbox);
    });

    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    setManualSyncing(true);
    try {
      await syncManager.syncAll();
      const updated = await offlineDb.getPendingOutbox();
      setItems(updated);
    } finally {
      setManualSyncing(false);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'INTERVENTION_STATUS':
        return <Car className="w-4 h-4 text-cyan-400" />;
      case 'INTERVENTION_REPORT':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'GPS_LOG':
        return <MapPin className="w-4 h-4 text-emerald-400" />;
      case 'PHOTO':
        return <Camera className="w-4 h-4 text-purple-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <RefreshCw className={`w-5 h-5 ${manualSyncing ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Centre de Synchronisation</h3>
            <p className="text-xs text-slate-400">Résilience hors-ligne & Outbox agent</p>
          </div>
        </div>

        {/* État du Réseau */}
        <div className="mb-4 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div className="text-xs">
            <div className="text-slate-400">Connectivité réseau :</div>
            <div className="font-bold text-white mt-0.5">
              {syncState.connectivity === 'ONLINE'
                ? '🟢 Connecté (Réseau disponible)'
                : '🔴 Hors connexion (Mode Local Actif)'}
            </div>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={manualSyncing || syncState.isSyncing}
            className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${manualSyncing ? 'animate-spin' : ''}`} />
            <span>Synchroniser</span>
          </button>
        </div>

        {/* Liste des Opérations en attente */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
            <span>Actions en attente d'envoi</span>
            <span className="font-mono text-cyan-400">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center rounded-2xl bg-slate-950/40 border border-slate-800/60">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-xs font-semibold text-slate-300">Toutes vos actions sont synchronisées</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Aucune donnée en attente sur l'appareil</div>
            </div>
          ) : (
            <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
              {items.map((it) => (
                <div
                  key={it.client_event_id}
                  className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    {getItemIcon(it.entity_type)}
                    <div>
                      <div className="font-bold text-slate-200">{it.operation}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(it.created_at).toLocaleTimeString('fr-FR')}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      it.status === 'CONFLICT'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : it.status === 'FAILED'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800'
                        : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                    }`}
                  >
                    {it.status === 'CONFLICT'
                      ? 'Conflit'
                      : it.status === 'FAILED'
                      ? 'En échec'
                      : 'En attente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message de garantie et sécurité */}
        <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-900/40 text-[11px] text-cyan-200/90 leading-relaxed">
          Vos missions, rapports, photos et positions GPS sont enregistrés localement sur cet appareil et seront automatiquement transmis dès que la connexion sera rétablie.
        </div>
      </div>
    </div>
  );
}

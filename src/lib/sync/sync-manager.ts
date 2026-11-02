/**
 * SECURIA V2 — PHASE 7 : SYNC MANAGER (OUTBOX & OFFLINE-FIRST)
 * Synchronisation bidirectionnelle résiliente avec backoff exponentiel et détection réseau fine
 */

import { offlineDb, OutboxItem, GpsQueueItem } from '@/lib/offline/indexed-db';

export type NetworkConnectivityStatus = 'ONLINE' | 'OFFLINE' | 'WEAK' | 'SYNCING';

export interface SyncStatusState {
  connectivity: NetworkConnectivityStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
}

type SyncListener = (state: SyncStatusState) => void;

class SyncManagerClass {
  private connectivity: NetworkConnectivityStatus = 'ONLINE';
  private isSyncing = false;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncListener> = new Set();
  private retryTimeout: any = null;
  private retryDelays = [5000, 15000, 30000, 60000, 300000]; // 5s, 15s, 30s, 60s, 5m

  constructor() {
    if (typeof window !== 'undefined') {
      this.connectivity = navigator.onLine ? 'ONLINE' : 'OFFLINE';

      window.addEventListener('online', () => {
        this.checkRealConnectivity();
      });

      window.addEventListener('offline', () => {
        this.connectivity = 'OFFLINE';
        this.notify();
      });

      // Vérification périodique du réseau (toutes les 30s)
      setInterval(() => {
        if (navigator.onLine && this.connectivity === 'OFFLINE') {
          this.checkRealConnectivity();
        }
      }, 30000);
    }
  }

  /**
   * Vérifie la connectivité réelle en tentant un ping HTTP
   */
  public async checkRealConnectivity(): Promise<boolean> {
    if (typeof window === 'undefined') return true;

    try {
      const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        this.connectivity = 'ONLINE';
        this.notify();
        // Lancement automatique de la synchronisation au retour réseau
        this.syncAll();
        return true;
      }
    } catch {}

    this.connectivity = 'OFFLINE';
    this.notify();
    return false;
  }

  /**
   * Enregistre un écouteur de changement d'état de synchronisation
   */
  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.getPendingCount().then((count) => {
      listener({
        connectivity: this.connectivity,
        pendingCount: count,
        lastSyncAt: this.lastSyncAt,
        lastError: this.lastError,
        isSyncing: this.isSyncing,
      });
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify(): Promise<void> {
    const count = await this.getPendingCount();
    const state: SyncStatusState = {
      connectivity: this.isSyncing ? 'SYNCING' : this.connectivity,
      pendingCount: count,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      isSyncing: this.isSyncing,
    };
    this.listeners.forEach((fn) => fn(state));
  }

  public async getPendingCount(): Promise<number> {
    if (typeof window === 'undefined') return 0;
    try {
      const pending = await offlineDb.getPendingOutbox();
      return pending.length;
    } catch {
      return 0;
    }
  }

  /**
   * Enfile une opération dans l'Outbox locale (Garantie de non-perte)
   */
  public async enqueue(
    entityType: OutboxItem['entity_type'],
    entityId: string,
    operation: OutboxItem['operation'],
    payload: any
  ): Promise<string> {
    const clientEventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const item: OutboxItem = {
      client_event_id: clientEventId,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      payload,
      created_at: new Date().toISOString(),
      status: 'PENDING',
      retry_count: 0,
    };

    await offlineDb.enqueueOutbox(item);
    this.notify();

    // Si nous sommes en ligne, tenter la transmission immédiate
    if (this.connectivity === 'ONLINE') {
      this.syncAll();
    }

    return clientEventId;
  }

  /**
   * Déclenche la synchronisation complète de l'Outbox et des positions GPS
   */
  public async syncAll(): Promise<{ syncedCount: number; failedCount: number }> {
    if (this.isSyncing || typeof window === 'undefined') {
      return { syncedCount: 0, failedCount: 0 };
    }

    this.isSyncing = true;
    this.notify();

    let syncedCount = 0;
    let failedCount = 0;

    try {
      const pendingItems = await offlineDb.getPendingOutbox();
      const unsyncedGps = await offlineDb.getUnsyncedGps();

      if (pendingItems.length === 0 && unsyncedGps.length === 0) {
        this.isSyncing = false;
        this.notify();
        return { syncedCount: 0, failedCount: 0 };
      }

      // Transmission par lot (Batch Sync)
      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: pendingItems,
          gps_points: unsyncedGps,
        }),
      });

      if (!res.ok) {
        throw new Error(`Serveur non disponible (HTTP ${res.status})`);
      }

      const data = await res.json();
      const results: Record<string, { status: string; error?: string }> = data.results || {};

      // Mise à jour locale selon les retours individuels du serveur
      for (const item of pendingItems) {
        const itemResult = results[item.client_event_id];
        if (itemResult) {
          if (itemResult.status === 'SYNCED' || itemResult.status === 'ALREADY_PROCESSED') {
            await offlineDb.deleteOutboxItem(item.client_event_id);
            syncedCount++;
          } else if (itemResult.status === 'CONFLICT') {
            await offlineDb.updateOutboxStatus(item.client_event_id, 'CONFLICT', itemResult.error);
            failedCount++;
          } else {
            await offlineDb.updateOutboxStatus(item.client_event_id, 'FAILED', itemResult.error);
            failedCount++;
          }
        }
      }

      // Nettoyage des points GPS validés
      if (data.gps_synced && unsyncedGps.length > 0) {
        const ids = unsyncedGps.map((g) => g.id).filter((id): id is number => id !== undefined);
        await offlineDb.clearGpsPoints(ids);
      }

      this.lastSyncAt = new Date().toISOString();
      this.lastError = failedCount > 0 ? `${failedCount} action(s) en échec` : null;
    } catch (err: any) {
      this.lastError = err.message || 'Échec de synchronisation';
      failedCount++;

      // Programmation du retry exponentiel
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { syncedCount, failedCount };
  }

  private scheduleRetry(): void {
    if (this.retryTimeout) clearTimeout(this.retryTimeout);

    // Délai progressif selon le premier élément en attente
    const delay = this.retryDelays[0];
    this.retryTimeout = setTimeout(() => {
      if (this.connectivity === 'ONLINE') {
        this.syncAll();
      }
    }, delay);
  }
}

export const syncManager = new SyncManagerClass();

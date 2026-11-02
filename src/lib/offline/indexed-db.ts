/**
 * SECURIA V2 — PHASE 7 : INDEXED-DB SECURE LOCAL STORE
 * Stockage structuré haute performance pour agents terrain (Missions, Outbox, GPS, Photos, Brouillons)
 * Sécurité : Isolation stricte et nettoyage complet lors du logout.
 */

export interface OutboxItem {
  client_event_id: string; // UUID v4
  organization_id?: string;
  user_id?: string;
  entity_type: 'INTERVENTION' | 'INTERVENTION_STATUS' | 'INTERVENTION_REPORT' | 'GPS_LOG' | 'PHOTO' | 'CHECKLIST' | string;
  entity_id: string;
  operation: 'STATUS_CHANGE' | 'REPORT_SUBMIT' | 'GPS_SYNC' | 'PHOTO_UPLOAD' | 'ARRIVED' | 'RESOLVED' | string;
  payload: any;
  created_at: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';
  retry_count: number;
  last_error?: string | null;
  synced_at?: string | null;
}

export type OfflineSyncEvent = OutboxItem;

export interface GpsQueueItem {
  id?: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source: string;
  synced: boolean;
}

const DB_NAME = 'securia_agent_db';
const DB_VERSION = 1;

class SecuriaIndexedDb {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('IndexedDB indisponible hors navigateur'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event: any) => {
          const db: IDBDatabase = event.target.result;

          if (!db.objectStoreNames.contains('missions')) {
            db.createObjectStore('missions', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('outbox')) {
            db.createObjectStore('outbox', { keyPath: 'client_event_id' });
          }
          if (!db.objectStoreNames.contains('gps_queue')) {
            db.createObjectStore('gps_queue', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('draft_reports')) {
            db.createObjectStore('draft_reports', { keyPath: 'intervention_id' });
          }
          if (!db.objectStoreNames.contains('offline_photos')) {
            db.createObjectStore('offline_photos', { keyPath: 'id' });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    return this.dbPromise;
  }

  // --- 1. GESTION DES MISSIONS HORS LIGNE ---
  public async cacheMission(mission: any): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('missions', 'readwrite');
      const store = tx.objectStore('missions');
      const req = store.put(mission);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getCachedMission(id: string): Promise<any | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('missions', 'readonly');
      const store = tx.objectStore('missions');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllCachedMissions(): Promise<any[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('missions', 'readonly');
      const store = tx.objectStore('missions');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- 2. OUTBOX PATTERN ---
  public async enqueueOutbox(item: OutboxItem): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getPendingOutbox(): Promise<OutboxItem[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const req = store.getAll();
      req.onsuccess = () => {
        const items: OutboxItem[] = req.result || [];
        resolve(items.filter((i) => i.status === 'PENDING' || i.status === 'FAILED'));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async updateOutboxStatus(
    clientEventId: string,
    status: OutboxItem['status'],
    errorMsg?: string
  ): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const getReq = store.get(clientEventId);

      getReq.onsuccess = () => {
        const item: OutboxItem = getReq.result;
        if (!item) return resolve();

        item.status = status;
        if (status === 'SYNCED') {
          item.synced_at = new Date().toISOString();
        }
        if (status === 'FAILED') {
          item.retry_count = (item.retry_count || 0) + 1;
          item.last_error = errorMsg || 'Erreur réseau';
        }
        store.put(item);
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  public async deleteOutboxItem(clientEventId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.delete(clientEventId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- 3. BROUILLONS DE RAPPORTS ---
  public async saveDraftReport(interventionId: string, draft: any): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('draft_reports', 'readwrite');
      const store = tx.objectStore('draft_reports');
      const req = store.put({ intervention_id: interventionId, ...draft, saved_at: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getDraftReport(interventionId: string): Promise<any | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('draft_reports', 'readonly');
      const store = tx.objectStore('draft_reports');
      const req = store.get(interventionId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteDraftReport(interventionId: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('draft_reports', 'readwrite');
      const store = tx.objectStore('draft_reports');
      const req = store.delete(interventionId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- 4. GPS OFFLINE QUEUE ---
  public async enqueueGps(point: Omit<GpsQueueItem, 'id'>): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_queue', 'readwrite');
      const store = tx.objectStore('gps_queue');
      const req = store.add({ ...point, synced: false });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getUnsyncedGps(): Promise<GpsQueueItem[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_queue', 'readonly');
      const store = tx.objectStore('gps_queue');
      const req = store.getAll();
      req.onsuccess = () => {
        const list: GpsQueueItem[] = req.result || [];
        resolve(list.filter((p) => !p.synced));
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async clearGpsPoints(ids: number[]): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_queue', 'readwrite');
      const store = tx.objectStore('gps_queue');
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- 5. NETTOYAGE SÉCURISÉ LORS DU LOGOUT ---
  public async clearAllUserData(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const db = await this.getDb();
      const stores = ['missions', 'outbox', 'gps_queue', 'draft_reports', 'offline_photos'];
      const tx = db.transaction(stores, 'readwrite');
      stores.forEach((s) => tx.objectStore(s).clear());
    } catch (err) {
      console.error('[IndexedDB] Erreur nettoyage logout:', err);
    }
  }
}

export const offlineDb = new SecuriaIndexedDb();

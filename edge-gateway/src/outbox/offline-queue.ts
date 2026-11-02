/**
 * SECURIA EDGE VIDEO GATEWAY — TAMPON D'ÉVÉNEMENTS HORS-LIGNE (Section 17, 28)
 * - Persistance locale sur disque (JSON/SQLite file)
 * - File d'attente FIFO ordonnée
 * - Rejeu automatique et idempotent dès restauration de la connexion Internet
 * - Gestion de l'anti-débordement et rétention configurable
 */

import fs from 'fs';
import path from 'path';
import { QueuedVideoEvent } from '../types';

export class OfflineEventQueue {
  private filePath: string;
  private queue: QueuedVideoEvent[] = [];
  private readonly maxQueueSize = 5000;

  constructor(storageDir: string = path.join(process.cwd(), 'data')) {
    if (!fs.existsSync(storageDir)) {
      try {
        fs.mkdirSync(storageDir, { recursive: true });
      } catch {}
    }
    this.filePath = path.join(storageDir, 'offline_events.json');
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.queue = JSON.parse(raw);
        console.log(`[OfflineQueue] ${this.queue.length} événement(s) en attente chargés depuis le disque.`);
      } catch (err) {
        console.error('[OfflineQueue] Erreur lecture fichier outbox:', err);
        this.queue = [];
      }
    }
  }

  private saveToDisk(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.queue, null, 2), 'utf-8');
    } catch (err) {
      console.error('[OfflineQueue] Erreur écriture outbox sur disque:', err);
    }
  }

  /**
   * Enfile un nouvel événement vidéo détecté sur le réseau local
   */
  public enqueue(event: Omit<QueuedVideoEvent, 'id' | 'created_at' | 'retry_count' | 'offline_buffered'>): QueuedVideoEvent {
    // Vérification anti-duplication locale
    const existing = this.queue.find((e) => e.event_id === event.event_id);
    if (existing) return existing;

    const queued: QueuedVideoEvent = {
      ...event,
      id: `local_evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      created_at: new Date().toISOString(),
      retry_count: 0,
      offline_buffered: true,
    };

    if (this.queue.length >= this.maxQueueSize) {
      // Rotation : purge les plus anciens pour éviter saturation disque
      this.queue.shift();
    }

    this.queue.push(queued);
    this.saveToDisk();
    return queued;
  }

  /**
   * Retourne tous les événements en attente
   */
  public getPendingEvents(): QueuedVideoEvent[] {
    return [...this.queue];
  }

  /**
   * Taille de la file d'attente
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Supprime les événements confirmés par le Cloud
   */
  public acknowledgeEvents(eventIds: string[]): void {
    const idSet = new Set(eventIds);
    this.queue = this.queue.filter((e) => !idSet.has(e.event_id));
    this.saveToDisk();
  }

  /**
   * Incrémente les compteurs de tentative
   */
  public markFailedAttempts(eventIds: string[]): void {
    const idSet = new Set(eventIds);
    for (const e of this.queue) {
      if (idSet.has(e.event_id)) {
        e.retry_count++;
      }
    }
    this.saveToDisk();
  }

  /**
   * Purge de la file locale
   */
  public clear(): void {
    this.queue = [];
    this.saveToDisk();
  }
}

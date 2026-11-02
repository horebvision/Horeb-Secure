/**
 * SECURIA EDGE VIDEO GATEWAY — DAEMON DE SUPERVISION PRINCIPAL
 * Coordonne la découverte locale, le relais média, le tampon hors-ligne et les battements de cœur
 */

import { loadGatewayConfig, saveGatewayConfig } from './config';
import { OnvifScanner } from './discovery/onvif-scanner';
import { StreamBridge } from './media/stream-bridge';
import { OfflineEventQueue } from './outbox/offline-queue';
import { CloudClient } from './client/cloud-client';
import { DiscoveredCamera } from './types';

export class EdgeGatewayDaemon {
  private config = loadGatewayConfig();
  private scanner = OnvifScanner;
  private bridge: StreamBridge;
  private outbox: OfflineEventQueue;
  private client: CloudClient;

  private discoveredCameras: DiscoveredCamera[] = [];
  private isRunning: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.bridge = new StreamBridge(this.config.go2rtcApiUrl);
    this.outbox = new OfflineEventQueue(this.config.storagePath);
    this.client = new CloudClient(this.config);
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('================================================================');
    console.log(`🚀 SECURIA EDGE VIDEO GATEWAY v${this.config.version}`);
    console.log(`Hardware ID : ${this.config.hardwareId}`);
    console.log(`Cloud URL   : ${this.config.cloudUrl}`);
    console.log('================================================================');

    // 1. Vérification / Appairage si nécessaire
    if (!this.config.secretToken && this.config.pairingCode) {
      console.log(`[Appairage] Tentative d’appairage automatique avec le code ${this.config.pairingCode}...`);
      try {
        const paired = await this.client.pair(this.config.pairingCode);
        console.log(`✔ [Appairage] Succès ! Gateway ID: ${paired.gateway_id}, Site: ${paired.protected_site_id}`);
        saveGatewayConfig({
          gatewayId: paired.gateway_id,
          gatewayCode: paired.gateway_code,
          secretToken: paired.secret_token,
          organizationId: paired.organization_id,
          protectedSiteId: paired.protected_site_id,
          pairingCode: undefined,
        });
        this.config = loadGatewayConfig();
        this.client.updateConfig(this.config);
      } catch (err: any) {
        console.error(`❌ [Appairage] Échec : ${err.message}`);
      }
    }

    // 2. Découverte initiale ONVIF
    await this.runDiscovery();

    // 3. Démarrage des boucles de supervision
    this.startHeartbeatLoop();
    this.startDiscoveryLoop();
    this.startOutboxFlushLoop();

    console.log('✔ Gateway opérationnel et connecté en mode écoute locale.');
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    console.log('[Gateway] Arrêt propre du service.');
  }

  /**
   * Exécute une passe de découverte locale ONVIF
   */
  public async runDiscovery(): Promise<DiscoveredCamera[]> {
    console.log('[Discovery] Lancement de la découverte multicast ONVIF sur le LAN...');
    try {
      const found = await OnvifScanner.discoverMulticast(3500);
      this.discoveredCameras = found;
      console.log(`✔ [Discovery] ${found.length} équipement(s) vidéo détecté(s).`);

      // Enregistrement des flux dans le StreamBridge
      for (const cam of found) {
        if (cam.rtspUrl) {
          const streamName = cam.serialNumber || `cam_${cam.ip.replace(/\./g, '_')}`;
          await this.bridge.registerStream(streamName, cam.rtspUrl);
        }
      }

      // Synchronisation vers Securia Cloud
      if (this.config.secretToken && found.length > 0) {
        await this.client.syncCameras(found);
        console.log('✔ [Sync] Caméras synchronisées avec le registre Cloud.');
      }

      return found;
    } catch (err: any) {
      console.error('[Discovery] Erreur lors du scan ONVIF:', err.message);
      return [];
    }
  }

  /**
   * Simule ou injecte un événement de détection local (IA caméra, GPIO, radar)
   */
  public triggerLocalEvent(eventType: string, cameraId?: string, confidence: number = 95): void {
    const cam = this.discoveredCameras.find((c) => c.serialNumber === cameraId || c.ip === cameraId) || this.discoveredCameras[0];
    const eventId = `evt_edge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`[Event Detected] ${eventType} sur caméra ${cam?.name || 'Inconnue'} (ID: ${eventId})`);

    this.outbox.enqueue({
      event_id: eventId,
      event_type: eventType,
      provider: cam?.manufacturer || 'EDGE_GATEWAY',
      camera_id: cameraId,
      camera_internal_id: cam?.serialNumber || 'CAM-01',
      organization_id: this.config.organizationId,
      protected_site_id: this.config.protectedSiteId,
      confidence,
      detected_at: new Date().toISOString(),
      metadata: {
        camera_ip: cam?.ip,
        detection_zone: 'Zone Périmétrique Ouest',
      },
    });

    // Tentative de transmission immédiate
    this.flushOutbox();
  }

  private startHeartbeatLoop(): void {
    const intervalMs = (this.config.heartbeatIntervalSec || 30) * 1000;
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) return;

      const camerasStatus: Record<string, string> = {};
      for (const c of this.discoveredCameras) {
        camerasStatus[c.serialNumber || c.ip] = c.status;
      }

      const ok = await this.client.sendHeartbeat(camerasStatus, this.outbox.size());
      if (ok) {
        // En cas de succès du heartbeat, si des événements hors ligne sont en attente, les flusher
        if (this.outbox.size() > 0) {
          this.flushOutbox();
        }
      }
    }, intervalMs);
  }

  private startDiscoveryLoop(): void {
    const intervalMs = (this.config.discoveryIntervalMin || 15) * 60 * 1000;
    this.discoveryTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.runDiscovery();
    }, intervalMs);
  }

  private startOutboxFlushLoop(): void {
    this.flushTimer = setInterval(async () => {
      if (!this.isRunning) return;
      if (this.outbox.size() > 0) {
        await this.flushOutbox();
      }
    }, 10000); // Vérification toutes les 10 secondes
  }

  private async flushOutbox(): Promise<void> {
    const pending = this.outbox.getPendingEvents();
    if (pending.length === 0) return;

    try {
      const res = await this.client.pushEvents(pending);
      if (res.success) {
        console.log(`✔ [Outbox] ${pending.length} événement(s) transmis et acquittés par Securia Cloud.`);
        this.outbox.acknowledgeEvents(pending.map((e) => e.event_id));
      }
    } catch (err: any) {
      console.warn(`[Outbox] Échec transmission vers le Cloud (${err.message}). Maintien en mémoire tampon locale.`);
      this.outbox.markFailedAttempts(pending.map((e) => e.event_id));
    }
  }

  public getDiscoveredCameras(): DiscoveredCamera[] {
    return [...this.discoveredCameras];
  }

  public getOutboxSize(): number {
    return this.outbox.size();
  }
}

// Point d'entrée direct si exécuté en tant que script principal
if (require.main === module) {
  const daemon = new EdgeGatewayDaemon();
  daemon.start().catch((err) => {
    console.error('Fatal daemon error:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await daemon.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await daemon.stop();
    process.exit(0);
  });
}

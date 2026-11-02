/**
 * SECURIA EDGE VIDEO GATEWAY — CLIENT DE COMMUNICATION CLOUD (Section 9, 10, 13)
 * Connexions STRICTEMENT SORTANTES (Outbound HTTPS/WSS) vers SECURIA Cloud
 * Aucun port entrant requis sur le routeur pare-feu du client.
 */

import http from 'http';
import https from 'https';
import os from 'os';
import { EdgeGatewayConfig, DiscoveredCamera, QueuedVideoEvent } from '../types';

export class CloudClient {
  private config: EdgeGatewayConfig;
  private isOnline: boolean = false;

  constructor(config: EdgeGatewayConfig) {
    this.config = config;
  }

  public updateConfig(newConfig: Partial<EdgeGatewayConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private async makeRequest<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: T }> {
    const fullUrl = `${this.config.cloudUrl}${path}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `Securia-Edge-Gateway/${this.config.version} (${os.platform()}; ${os.arch()})`,
      ...headers,
    };

    if (this.config.gatewayId) {
      requestHeaders['x-gateway-id'] = this.config.gatewayId;
    }
    if (this.config.secretToken) {
      requestHeaders['x-gateway-token'] = this.config.secretToken;
      requestHeaders['Authorization'] = `Bearer ${this.config.secretToken}`;
    }

    const payloadStr = body ? JSON.stringify(body) : undefined;
    if (payloadStr) {
      requestHeaders['Content-Length'] = Buffer.byteLength(payloadStr).toString();
    }

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method,
          headers: requestHeaders,
          timeout: 10000,
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              const parsedData = raw ? JSON.parse(raw) : {};
              this.isOnline = true;
              resolve({ status: res.statusCode || 200, data: parsedData });
            } catch {
              this.isOnline = true;
              resolve({ status: res.statusCode || 200, data: raw as any });
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        this.isOnline = false;
        reject(new Error(`Timeout de connexion Cloud (${fullUrl})`));
      });

      req.on('error', (err) => {
        this.isOnline = false;
        reject(err);
      });

      if (payloadStr) req.write(payloadStr);
      req.end();
    });
  }

  /**
   * Appairage initial avec Securia Cloud à partir du code temporaire émis au SOC
   */
  public async pair(pairingCode: string): Promise<any> {
    const res = await this.makeRequest('/api/video/gateways/pair', 'POST', {
      pairing_code: pairingCode,
      hardware_id: this.config.hardwareId,
      version: this.config.version,
      ip_address_local: this.getLocalIp(),
    });

    if (res.status >= 400) {
      throw new Error(res.data?.error || `Échec appairage (HTTP ${res.status})`);
    }

    return res.data;
  }

  /**
   * Envoi du battement de cœur périodique avec métriques système
   */
  public async sendHeartbeat(camerasStatus: Record<string, string> = {}, queueLength: number = 0): Promise<boolean> {
    if (!this.config.gatewayId || !this.config.secretToken) return false;

    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024);
    const usedMem = totalMem - freeMem;

    // Calcul approximatif charge CPU
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const cpuPct = Math.min(100, Math.round((loadAvg[0] / (cpus.length || 1)) * 100));

    try {
      const res = await this.makeRequest('/api/video/gateways/heartbeat', 'POST', {
        version: this.config.version,
        cpu_pct: cpuPct,
        mem_used_mb: usedMem,
        mem_total_mb: totalMem,
        cameras_status: camerasStatus,
        uptime_seconds: Math.round(os.uptime()),
        ip_address_local: this.getLocalIp(),
        queue_length: queueLength,
        timestamp: new Date().toISOString(),
      });

      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Synchronise les caméras découvertes localement avec le registre Cloud
   */
  public async syncCameras(cameras: DiscoveredCamera[]): Promise<any> {
    if (!this.config.gatewayId || !this.config.organizationId || !this.config.protectedSiteId) {
      return { success: false, reason: 'Passerelle non appairée ou site non assigné' };
    }

    const payload = {
      organization_id: this.config.organizationId,
      protected_site_id: this.config.protectedSiteId,
      cameras: cameras.map((c, idx) => ({
        internal_id: c.serialNumber || `CAM-LOCAL-${idx + 1}`,
        name: c.name,
        manufacturer: c.manufacturer,
        model: c.model,
        camera_type: 'FIXED',
        protocol: 'ONVIF',
        stream_internal_url: c.rtspUrl,
        status: c.status,
        capabilities: ['MOTION', 'INTRUSION_DETECTION'],
        ip_address: c.ip,
        onvif_xaddr: c.xaddr,
        snapshot_url: c.snapshotUrl,
      })),
    };

    const res = await this.makeRequest('/api/video/gateways/sync-cameras', 'POST', payload);
    return res.data;
  }

  /**
   * Pousse un lot d'événements vers le Cloud (temps réel ou vidage d'outbox)
   */
  public async pushEvents(events: QueuedVideoEvent[]): Promise<{ success: boolean; processed: number; duplicates: number }> {
    if (events.length === 0) return { success: true, processed: 0, duplicates: 0 };

    const res = await this.makeRequest('/api/video/gateways/events', 'POST', {
      events: events.map((e) => ({
        provider: e.provider,
        event_id: e.event_id,
        organization_id: this.config.organizationId,
        protected_site_id: this.config.protectedSiteId,
        camera_id: e.camera_id,
        camera_internal_id: e.camera_internal_id,
        event_type: e.event_type,
        confidence: e.confidence,
        detected_at: e.detected_at,
        snapshot_url: e.snapshot_url,
        offline_buffered: e.offline_buffered,
        metadata: e.metadata,
      })),
    });

    if (res.status >= 400) {
      throw new Error(res.data?.error || `Échec envoi événements (HTTP ${res.status})`);
    }

    return {
      success: true,
      processed: res.data?.processed || events.length,
      duplicates: res.data?.duplicates || 0,
    };
  }

  public isCloudReachable(): boolean {
    return this.isOnline;
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (!net.internal && net.family === 'IPv4') {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
}

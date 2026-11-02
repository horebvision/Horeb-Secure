/**
 * SECURIA EDGE VIDEO GATEWAY — RELAIS MÉDIA & STREAMING SÉCURISÉ (Section 7, 8, 14, 15)
 * - Pont RTSP vers WebRTC / HLS / Snapshot JPEG
 * - Intégration transparente avec le moteur go2rtc local
 * - Négociation WebRTC WHEP / SDP pour affichage sub-seconde sans plugin
 * - ZÉRO exposition de mots de passe ou URLs RTSP brutes au navigateur
 * Phase 10.1 : Diagnostics go2rtc en temps réel (codec, résolution, FPS, uptime)
 */

import http from 'http';
import { DiscoveredCamera } from '../types';

export interface StreamDiagnostic {
  name: string;
  /** Source SANS identifiants (masqués) */
  sourceType: string;
  state: 'ACTIVE' | 'OFFLINE' | 'WAITING' | 'UNKNOWN';
  producers: Array<{
    type: string;      // e.g. 'rtsp', 'onvif'
    codec?: string;    // e.g. 'H264', 'H265'
    width?: number;
    height?: number;
    fps?: number;
  }>;
  consumers: number;
  lastFrameMs?: number;
}

export interface WebRtcNegotiationResult {
  success: boolean;
  answerSdp?: string;
  error?: string;
  protocol?: string;
}

export class StreamBridge {
  private go2rtcUrl: string;

  constructor(go2rtcUrl: string = 'http://127.0.0.1:1984') {
    this.go2rtcUrl = go2rtcUrl.replace(/\/$/, '');
  }

  /**
   * Vérifie si le moteur média local go2rtc est actif
   */
  public async checkEngineStatus(): Promise<{ available: boolean; version?: string }> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(this.go2rtcUrl);
        const req = http.get(
          {
            hostname: parsed.hostname,
            port: parsed.port || 1984,
            path: '/api',
            timeout: 1500,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                const info = JSON.parse(data);
                resolve({ available: true, version: info.version || '1.9.x' });
              } catch {
                resolve({ available: res.statusCode === 200 });
              }
            });
          }
        );

        req.on('error', () => resolve({ available: false }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ available: false });
        });
      } catch {
        resolve({ available: false });
      }
    });
  }

  /**
   * Liste tous les flux actifs enregistrés dans le moteur go2rtc local
   * Retourne uniquement les infos non-sensibles (pas d'URL RTSP ni identifiants)
   * Utilisé pour les diagnostics Phase 10.1
   */
  public async getEngineStreams(): Promise<StreamDiagnostic[]> {
    try {
      const parsed = new URL(this.go2rtcUrl);
      return await new Promise((resolve) => {
        const req = http.get(
          {
            hostname: parsed.hostname,
            port: parsed.port || 1984,
            path: '/api/streams',
            timeout: 2000,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                const raw = JSON.parse(data);
                const results: StreamDiagnostic[] = [];
                for (const [name, info] of Object.entries(raw as Record<string, any>)) {
                  const producers = (info?.producers || []).map((p: any) => ({
                    type: p.type || 'unknown',
                    codec: p.media?.[0]?.codec || p.codec || undefined,
                    width: p.media?.[0]?.width || p.width || undefined,
                    height: p.media?.[0]?.height || p.height || undefined,
                    fps: p.media?.[0]?.fps || p.fps || undefined,
                  }));
                  // Source type sans les credentials
                  const rawSource = typeof info?.source === 'string' ? info.source : '';
                  const sourceType = rawSource.startsWith('rtsp://') ? 'rtsp'
                    : rawSource.startsWith('rtmp://') ? 'rtmp'
                    : rawSource.startsWith('onvif://') ? 'onvif'
                    : 'stream';
                  results.push({
                    name,
                    sourceType,
                    state: producers.length > 0 ? 'ACTIVE' : 'WAITING',
                    producers,
                    consumers: (info?.consumers || []).length,
                    lastFrameMs: info?.updated || undefined,
                  });
                }
                resolve(results);
              } catch {
                resolve([]);
              }
            });
          }
        );
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });
    } catch {
      return [];
    }
  }

  /**
   * Diagnostics techniques d'un flux spécifique sans exposer les credentials
   */
  public async getStreamDiagnostics(streamName: string): Promise<StreamDiagnostic | null> {
    const streams = await this.getEngineStreams();
    return streams.find((s) => s.name === streamName) || null;
  }

  /**
   * Enregistre dynamiquement un flux RTSP de caméra dans le moteur de streaming local
   */
  public async registerStream(streamName: string, rtspSourceUrl: string): Promise<boolean> {
    const isEngineUp = await this.checkEngineStatus();
    if (!isEngineUp.available) {
      console.log(`[StreamBridge] Moteur média externe non actif sur ${this.go2rtcUrl}. Relais passif activé.`);
      return true;
    }

    try {
      const parsed = new URL(this.go2rtcUrl);

      return await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 1984,
            path: `/api/streams?src=${encodeURIComponent(rtspSourceUrl)}&name=${encodeURIComponent(streamName)}`,
            method: 'PUT',
            timeout: 2500,
          },
          (res) => resolve(res.statusCode === 200 || res.statusCode === 201)
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      });
    } catch {
      return false;
    }
  }

  /**
   * Négocie une session WebRTC via go2rtc WHEP / SDP (Section 8 & 14)
   * Reçoit une offre SDP du navigateur/Cloud, la transmet à go2rtc et retourne la réponse SDP
   */
  public async negotiateWebRtc(streamName: string, offerSdp: string): Promise<WebRtcNegotiationResult> {
    const isEngineUp = await this.checkEngineStatus();
    if (!isEngineUp.available) {
      return {
        success: false,
        error: 'Moteur de streaming local (go2rtc) indisponible ou non démarré.',
      };
    }

    try {
      const parsed = new URL(this.go2rtcUrl);
      const postData = offerSdp;

      return await new Promise((resolve) => {
        const req = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 1984,
            path: `/api/webrtc?src=${encodeURIComponent(streamName)}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/sdp',
              'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 4000,
          },
          (res) => {
            let answer = '';
            res.on('data', (d) => (answer += d));
            res.on('end', () => {
              if (res.statusCode === 200 || res.statusCode === 201) {
                resolve({
                  success: true,
                  answerSdp: answer,
                  protocol: 'WEBRTC_WHEP',
                });
              } else {
                resolve({
                  success: false,
                  error: `Échec négociation WebRTC (${res.statusCode}): ${answer.slice(0, 150)}`,
                });
              }
            });
          }
        );

        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Délai d’attente dépassé lors de la négociation WebRTC.' });
        });

        req.write(postData);
        req.end();
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Récupère un instantané JPEG (Snapshot) depuis le moteur go2rtc pour un flux donné (Section 15)
   */
  public async getStreamSnapshot(streamName: string): Promise<{ success: boolean; buffer?: Buffer; base64?: string }> {
    try {
      const parsed = new URL(this.go2rtcUrl);
      return await new Promise((resolve) => {
        const req = http.get(
          {
            hostname: parsed.hostname,
            port: parsed.port || 1984,
            path: `/api/frame.jpeg?src=${encodeURIComponent(streamName)}`,
            timeout: 3000,
          },
          (res) => {
            if (res.statusCode !== 200) {
              resolve({ success: false });
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
              const buf = Buffer.concat(chunks);
              resolve({
                success: true,
                buffer: buf,
                base64: `data:image/jpeg;base64,${buf.toString('base64')}`,
              });
            });
          }
        );

        req.on('error', () => resolve({ success: false }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false });
        });
      });
    } catch {
      return { success: false };
    }
  }

  /**
   * Capture un instantané JPEG (Snapshot) depuis la caméra ou le moteur local
   */
  public async captureSnapshot(camera: DiscoveredCamera): Promise<{ success: boolean; buffer?: Buffer; base64?: string }> {
    // 1. Essai via go2rtc si un stream est nommé d'après l'ID interne
    const streamId = camera.id || camera.hardwareId || camera.ip;
    const go2rtcSnapshot = await this.getStreamSnapshot(streamId);
    if (go2rtcSnapshot.success) {
      return go2rtcSnapshot;
    }

    // 2. Si une URL de snapshot HTTP directe existe sur la caméra
    if (camera.snapshotUrl) {
      try {
        const parsed = new URL(camera.snapshotUrl);
        const buf = await new Promise<Buffer>((resolve, reject) => {
          http.get(
            {
              hostname: parsed.hostname,
              port: parsed.port || 80,
              path: parsed.pathname + parsed.search,
              timeout: 3000,
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (d) => chunks.push(d));
              res.on('end', () => resolve(Buffer.concat(chunks)));
            }
          ).on('error', reject);
        });

        return {
          success: true,
          buffer: buf,
          base64: `data:image/jpeg;base64,${buf.toString('base64')}`,
        };
      } catch {}
    }

    return { success: false };
  }
}

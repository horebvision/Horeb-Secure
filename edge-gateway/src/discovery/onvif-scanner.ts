/**
 * SECURIA EDGE VIDEO GATEWAY — MOTEUR DE DÉCOUVERTE LOCALE ONVIF (Section 5, 6, 26)
 * - Découverte multicast WS-Discovery (UDP 239.255.255.250:3702) locale
 * - Fallback scan IP subnet
 * - Clients SOAP pour DeviceService & MediaService (GetDeviceInformation, GetProfiles, GetStreamUri)
 * - Aucune dépendance externe lourde (requêtes SOAP et sockets UDP natifs)
 */

import dgram from 'dgram';
import http from 'http';
import https from 'https';
import os from 'os';
import { DiscoveredCamera, HardwareProbeResult } from '../types';

export class OnvifScanner {
  private static readonly MULTICAST_ADDRESS = '239.255.255.250';
  private static readonly MULTICAST_PORT = 3702;

  /**
   * Enveloppe XML standard pour sonde WS-Discovery (Probe)
   */
  private static createProbeEnvelope(): string {
    const messageId = `uuid:${Math.random().toString(36).substring(2)}-${Date.now()}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${messageId}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
  }

  /**
   * Exécute une découverte ONVIF multicast sur le réseau local
   */
  public static async discoverMulticast(timeoutMs: number = 3500): Promise<DiscoveredCamera[]> {
    const cameras = new Map<string, DiscoveredCamera>();
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const probeMessage = Buffer.from(this.createProbeEnvelope());

    return new Promise((resolve) => {
      let isClosed = false;

      const finish = async () => {
        if (isClosed) return;
        isClosed = true;
        try {
          socket.close();
        } catch {}

        // Compléter les informations des caméras découvertes
        const results: DiscoveredCamera[] = [];
        for (const cam of cameras.values()) {
          try {
            const enriched = await this.enrichCameraDetails(cam);
            results.push(enriched);
          } catch {
            results.push(cam);
          }
        }
        resolve(results);
      };

      const timer = setTimeout(finish, timeoutMs);

      socket.on('error', (err) => {
        console.warn('[ONVIF Discovery] Multicast warning:', err.message);
        clearTimeout(timer);
        finish();
      });

      socket.on('message', (msg, rinfo) => {
        const text = msg.toString('utf-8');
        if (text.includes('ProbeMatches') || text.includes('XAddrs')) {
          const xaddrMatch = text.match(/<(?:\w+:)?XAddrs>([^<]+)<\/(?:\w+:)?XAddrs>/i);
          const xaddr = xaddrMatch ? xaddrMatch[1].trim().split(/\s+/)[0] : `http://${rinfo.address}/onvif/device_service`;

          let port = 80;
          try {
            const parsed = new URL(xaddr);
            port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
          } catch {}

          if (!cameras.has(rinfo.address)) {
            cameras.set(rinfo.address, {
              ip: rinfo.address,
              port,
              xaddr,
              name: `Caméra ONVIF (${rinfo.address})`,
              onvifSupported: true,
              rtspSupported: true,
              discoveredAt: new Date().toISOString(),
              status: 'ONLINE',
            });
          }
        }
      });

      socket.bind(0, () => {
        try {
          socket.addMembership(this.MULTICAST_ADDRESS);
          socket.setBroadcast(true);
          socket.setMulticastTTL(2);
          socket.send(probeMessage, 0, probeMessage.length, this.MULTICAST_PORT, this.MULTICAST_ADDRESS);
        } catch (e: any) {
          console.warn('[ONVIF Discovery] Multicast membership error:', e.message);
          clearTimeout(timer);
          finish();
        }
      });
    });
  }

  /**
   * Envoi d'une requête SOAP ONVIF vers un endpoint
   */
  public static async sendSoapRequest(
    serviceUrl: string,
    soapBody: string,
    options: { timeoutMs?: number; username?: string; password?: string } = {}
  ): Promise<string> {
    const timeout = options.timeoutMs || 3000;
    const parsed = new URL(serviceUrl);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    let authHeader = '';
    if (options.username && options.password) {
      // WS-Security UsernameToken (PasswordText pour compatibilité directe)
      const nonce = Math.random().toString(36).substring(2);
      const created = new Date().toISOString();
      authHeader = `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                                   xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken>
          <wsse:Username>${options.username}</wsse:Username>
          <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${options.password}</wsse:Password>
          <wsse:Nonce>${Buffer.from(nonce).toString('base64')}</wsse:Nonce>
          <wsu:Created>${created}</wsu:Created>
        </wsse:UsernameToken>
      </wsse:Security>`;
    }

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:tds="http://www.onvif.org/ver10/device/wsdl"
               xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
               xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Header>${authHeader}</soap:Header>
  <soap:Body>
    ${soapBody}
  </soap:Body>
</soap:Envelope>`;

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(envelope),
          },
          timeout,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout (${timeout}ms) vers ${serviceUrl}`));
      });

      req.on('error', (err) => reject(err));
      req.write(envelope);
      req.end();
    });
  }

  /**
   * Interroge le service ONVIF pour récupérer Manufacturer, Model, Firmware, etc.
   */
  public static async enrichCameraDetails(camera: DiscoveredCamera): Promise<DiscoveredCamera> {
    try {
      const resp = await this.sendSoapRequest(
        camera.xaddr,
        `<tds:GetDeviceInformation/>`,
        { timeoutMs: 2500 }
      );

      const mfg = resp.match(/<(?:\w+:)?Manufacturer>([^<]+)<\/(?:\w+:)?Manufacturer>/i);
      const mdl = resp.match(/<(?:\w+:)?Model>([^<]+)<\/(?:\w+:)?Model>/i);
      const fw = resp.match(/<(?:\w+:)?FirmwareVersion>([^<]+)<\/(?:\w+:)?FirmwareVersion>/i);
      const sn = resp.match(/<(?:\w+:)?SerialNumber>([^<]+)<\/(?:\w+:)?SerialNumber>/i);
      const hw = resp.match(/<(?:\w+:)?HardwareId>([^<]+)<\/(?:\w+:)?HardwareId>/i);

      if (mfg) camera.manufacturer = mfg[1].trim();
      if (mdl) camera.model = mdl[1].trim();
      if (fw) camera.firmwareVersion = fw[1].trim();
      if (sn) camera.serialNumber = sn[1].trim();
      if (hw) camera.hardwareId = hw[1].trim();

      if (camera.manufacturer || camera.model) {
        camera.name = `${camera.manufacturer || 'IP'} ${camera.model || 'Camera'} (${camera.ip})`;
      }
    } catch {}

    // Tentative de récupération des profils et stream URI
    try {
      const mediaUrl = camera.xaddr.replace(/device_service$/i, 'media_service');
      const profilesResp = await this.sendSoapRequest(mediaUrl, `<trt:GetProfiles/>`, { timeoutMs: 2000 });
      const tokenMatch = profilesResp.match(/token="([^"]+)"/i);
      if (tokenMatch) {
        const profileToken = tokenMatch[1];
        const streamUriResp = await this.sendSoapRequest(
          mediaUrl,
          `<trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream><tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup><trt:ProfileToken>${profileToken}</trt:ProfileToken></trt:GetStreamUri>`,
          { timeoutMs: 2000 }
        );
        const uriMatch = streamUriResp.match(/<(?:\w+:)?Uri>([^<]+)<\/(?:\w+:)?Uri>/i);
        if (uriMatch) {
          camera.rtspUrl = uriMatch[1].trim();
        }
      }
    } catch {}

    return camera;
  }

  /**
   * Sonde physique détaillée d'un équipement IP (caméra ou NVR)
   * Répond au critère de la Section 26 & 27 (Test Réel)
   */
  public static async probePhysicalCamera(
    ip: string,
    port: number = 80,
    credentials?: { username?: string; password?: string }
  ): Promise<HardwareProbeResult> {
    const startTime = Date.now();
    const result: HardwareProbeResult = {
      ip,
      port,
      isReachable: false,
      onvifDetected: false,
      rtspDetected: false,
      snapshotAvailable: false,
      testedAt: new Date().toISOString(),
      diagnosticNotes: [],
    };

    // 1. Test connectivité HTTP/ONVIF
    const deviceUrl = `http://${ip}:${port}/onvif/device_service`;
    result.onvifDeviceServiceUrl = deviceUrl;

    try {
      const response = await this.sendSoapRequest(
        deviceUrl,
        `<tds:GetDeviceInformation/>`,
        { timeoutMs: 3000, username: credentials?.username, password: credentials?.password }
      );

      result.isReachable = true;
      result.pingLatencyMs = Date.now() - startTime;
      result.onvifDetected = true;
      result.diagnosticNotes.push(`Port ${port} ONVIF joignable (latence: ${result.pingLatencyMs}ms).`);

      const mfg = response.match(/<(?:\w+:)?Manufacturer>([^<]+)<\/(?:\w+:)?Manufacturer>/i);
      const mdl = response.match(/<(?:\w+:)?Model>([^<]+)<\/(?:\w+:)?Model>/i);
      const fw = response.match(/<(?:\w+:)?FirmwareVersion>([^<]+)<\/(?:\w+:)?FirmwareVersion>/i);
      const sn = response.match(/<(?:\w+:)?SerialNumber>([^<]+)<\/(?:\w+:)?SerialNumber>/i);

      if (mfg) result.manufacturer = mfg[1].trim();
      if (mdl) result.model = mdl[1].trim();
      if (fw) result.firmwareVersion = fw[1].trim();
      if (sn) result.serialNumber = sn[1].trim();

      result.diagnosticNotes.push(
        `Identification matérielle : ${result.manufacturer || 'Inconnu'} ${result.model || ''} (Firmware: ${result.firmwareVersion || 'N/A'})`
      );
    } catch (err: any) {
      result.diagnosticNotes.push(`ONVIF non détecté sur ${deviceUrl} : ${err.message}`);
    }

    // 2. Test port RTSP (554)
    result.rtspUriTested = `rtsp://${ip}:554/live/ch0`;
    try {
      // Vérification basique TCP de disponibilité du port RTSP
      const net = await import('net');
      await new Promise<void>((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(2000);
        client.connect(554, ip, () => {
          result.rtspDetected = true;
          result.diagnosticNotes.push(`Port RTSP 554 actif et prêt pour streaming.`);
          client.destroy();
          resolve();
        });
        client.on('error', (e) => reject(e));
        client.on('timeout', () => {
          client.destroy();
          reject(new Error('Timeout port 554'));
        });
      });
    } catch {
      result.diagnosticNotes.push(`Port RTSP 554 non joignable directement.`);
    }

    return result;
  }
}

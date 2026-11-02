/**
 * SECURIA EDGE VIDEO GATEWAY — GESTION DE CONFIGURATION
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { EdgeGatewayConfig } from './types';

const CONFIG_PATHS = [
  path.join(process.cwd(), 'config', 'gateway.config.json'),
  path.join(process.cwd(), 'gateway.config.json'),
  path.join(os.homedir(), '.securia', 'gateway.config.json'),
  '/etc/securia/gateway.config.json',
];

export function getHardwareId(): string {
  // Dérivation d'identifiant matériel unique et stable
  const interfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  if (mac) {
    return `HW-${mac.replace(/:/g, '').toUpperCase()}`;
  }

  const hostHash = crypto.createHash('sha256').update(os.hostname() + os.platform() + os.arch()).digest('hex').slice(0, 12).toUpperCase();
  return `HW-HOST-${hostHash}`;
}

export function loadGatewayConfig(): EdgeGatewayConfig {
  let fileConfig: Partial<EdgeGatewayConfig> = {};

  for (const p of CONFIG_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        fileConfig = JSON.parse(raw);
        break;
      } catch (err) {
        console.warn(`[Config] Erreur lecture ${p}:`, err);
      }
    }
  }

  const cloudUrl = process.env.SECURIA_CLOUD_URL || fileConfig.cloudUrl || 'https://securia-pilot.netlify.app';
  const hardwareId = process.env.SECURIA_HARDWARE_ID || fileConfig.hardwareId || getHardwareId();

  return {
    cloudUrl: cloudUrl.replace(/\/$/, ''),
    gatewayId: process.env.SECURIA_GATEWAY_ID || fileConfig.gatewayId,
    gatewayCode: process.env.SECURIA_GATEWAY_CODE || fileConfig.gatewayCode,
    secretToken: process.env.SECURIA_GATEWAY_TOKEN || fileConfig.secretToken,
    organizationId: process.env.SECURIA_ORG_ID || fileConfig.organizationId,
    protectedSiteId: process.env.SECURIA_SITE_ID || fileConfig.protectedSiteId,
    pairingCode: process.env.SECURIA_PAIRING_CODE || fileConfig.pairingCode,
    hardwareId,
    version: '0.1.0',
    heartbeatIntervalSec: Number(process.env.SECURIA_HEARTBEAT_SEC) || fileConfig.heartbeatIntervalSec || 30,
    discoveryIntervalMin: Number(process.env.SECURIA_DISCOVERY_MIN) || fileConfig.discoveryIntervalMin || 15,
    localSubnets: fileConfig.localSubnets || ['192.168.1.0/24', '192.168.100.0/24', '10.0.0.0/24'],
    onvifPorts: fileConfig.onvifPorts || [80, 8080, 8000, 8899, 5000],
    rtspPorts: fileConfig.rtspPorts || [554, 8554],
    go2rtcApiUrl: process.env.GO2RTC_API_URL || fileConfig.go2rtcApiUrl || 'http://127.0.0.1:1984',
    storagePath: process.env.SECURIA_STORAGE_PATH || fileConfig.storagePath || path.join(process.cwd(), 'data'),
  };
}

export function saveGatewayConfig(updates: Partial<EdgeGatewayConfig>): void {
  const current = loadGatewayConfig();
  const merged = { ...current, ...updates };

  const targetDir = path.join(process.cwd(), 'config');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, 'gateway.config.json');
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2), 'utf-8');
}

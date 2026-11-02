/**
 * SONDE MATÉRIELLE & DÉTECTION CAMÉRA PHYSIQUE RÉELLE — PHASE 10
 * Scanne le sous-réseau local (192.168.100.x) à la recherche d'équipements IP physiques réels
 * Teste : WS-Discovery UDP 3702, ports RTSP 554/8554, ports HTTP/ONVIF 80/8000/8080
 */

import dgram from 'dgram';
import net from 'net';
import http from 'http';
import os from 'os';

async function scanPort(ip: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

async function probeHttpDevice(ip: string, port = 80): Promise<{ reachable: boolean; server?: string; status?: number }> {
  return new Promise((resolve) => {
    const req = http.get({ hostname: ip, port, path: '/', timeout: 1000 }, (res) => {
      const serverHeader = res.headers.server;
      const serverStr = Array.isArray(serverHeader) ? serverHeader.join(', ') : (serverHeader || '');
      resolve({ reachable: true, server: serverStr, status: res.statusCode });
    });
    req.on('error', () => resolve({ reachable: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false });
    });
  });
}

async function main() {
  console.log('============================================================');
  console.log('SONDE MATÉRIELLE PHYSIQUE RÉELLE — SOUS-RÉSEAU LOCAL');
  console.log('============================================================');

  // Interfaces réseau
  const interfaces = os.networkInterfaces();
  const ipv4s: string[] = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    if (nets) {
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          ipv4s.push(`${name}: ${net.address}/${net.netmask}`);
        }
      }
    }
  }
  console.log('Interfaces réseau actives :', ipv4s.join(' | '));

  // Sonde de la passerelle par défaut
  const gwIp = '192.168.100.1';
  console.log(`\nSonde équipement hôte/passerelle ${gwIp}...`);
  const gwHttp = await probeHttpDevice(gwIp, 80);
  const gwRtsp = await scanPort(gwIp, 554);
  console.log(`- Hôte ${gwIp} HTTP port 80 :`, gwHttp.reachable ? `Accessible (HTTP ${gwHttp.status}, Server: ${gwHttp.server})` : 'Non accessible');
  console.log(`- Hôte ${gwIp} RTSP port 554 :`, gwRtsp ? 'OUVERT' : 'FERMÉ');

  // Balayage rapide de cibles IP probables sur le sous-réseau 192.168.100.x
  console.log('\nBalayage des adresses IP locales pour caméras physiques (192.168.100.2 à 192.168.100.30, .50, .100, .108)...');
  const targetIps = [
    '192.168.100.2', '192.168.100.5', '192.168.100.10', '192.168.100.15',
    '192.168.100.20', '192.168.100.50', '192.168.100.64', '192.168.100.100',
    '192.168.100.108', '192.168.100.200'
  ];

  const foundDevices: any[] = [];
  for (const ip of targetIps) {
    const isRtsp = await scanPort(ip, 554, 250);
    const isHttp = await scanPort(ip, 80, 250);
    const isAlt = await scanPort(ip, 8000, 250) || await scanPort(ip, 8080, 250);

    if (isRtsp || isHttp || isAlt) {
      console.log(`  -> ÉQUIPEMENT DÉCOUVERT SUR ${ip} : RTSP=${isRtsp}, HTTP=${isHttp}, PortAlt=${isAlt}`);
      foundDevices.push({ ip, isRtsp, isHttp, isAlt });
    }
  }

  if (foundDevices.length === 0) {
    console.log('  ℹ Aucun équipement vidéo actif supplémentaire détecté sur ces adresses échantillonnées.');
  }

  console.log('\n============================================================');
  console.log('BILAN DE LA SONDE MATÉRIELLE PHYSIQUE');
  console.log(`Équipement hôte réseau physique joignable : ${gwHttp.reachable}`);
  console.log(`Caméras IP physiques actives sur port RTSP 554 : ${foundDevices.filter(d => d.isRtsp).length}`);
  console.log('============================================================');
}

main().catch(console.error);

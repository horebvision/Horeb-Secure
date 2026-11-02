#!/usr/bin/env node
/**
 * SECURIA EDGE VIDEO GATEWAY — INTERFACE EN LIGNE DE COMMANDE (CLI)
 * Commandes :
 *   pair       - Appairage de la passerelle avec Securia Cloud
 *   scan       - Découverte locale ONVIF des caméras du réseau
 *   probe      - Test et diagnostic d'une caméra IP physique spécifique
 *   test-hw    - Audit matériel complet du banc de test physique
 *   run        - Démarrage du daemon de supervision en arrière-plan
 */

import { loadGatewayConfig, saveGatewayConfig } from './config';
import { OnvifScanner } from './discovery/onvif-scanner';
import { CloudClient } from './client/cloud-client';
import { EdgeGatewayDaemon } from './daemon';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'pair': {
      let code = '';
      let cloudUrl = '';

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--code' && args[i + 1]) code = args[i + 1];
        if (args[i] === '--cloud' && args[i + 1]) cloudUrl = args[i + 1];
      }

      if (!code) {
        console.error('❌ Erreur: L’argument --code <CODE_APPAIRAGE> est obligatoire.');
        process.exit(1);
      }

      const config = loadGatewayConfig();
      if (cloudUrl) config.cloudUrl = cloudUrl.replace(/\/$/, '');

      console.log(`[Pairing] Connexion à ${config.cloudUrl}...`);
      console.log(`[Pairing] Code présenté : ${code} | Hardware ID : ${config.hardwareId}`);

      const client = new CloudClient(config);
      try {
        const res = await client.pair(code);
        console.log('\n================================================================');
        console.log('🎉 APPAIRAGE RÉUSSI AVEC LE CLOUD SECURIA !');
        console.log('================================================================');
        console.log(`Gateway ID       : ${res.gateway_id}`);
        console.log(`Gateway Code     : ${res.gateway_code}`);
        console.log(`Organisation ID  : ${res.organization_id}`);
        console.log(`Site Protégé ID  : ${res.protected_site_id}`);
        console.log(`Statut Cloud     : ONLINE`);
        console.log('================================================================\n');

        saveGatewayConfig({
          cloudUrl: config.cloudUrl,
          gatewayId: res.gateway_id,
          gatewayCode: res.gateway_code,
          secretToken: res.secret_token,
          organizationId: res.organization_id,
          protectedSiteId: res.protected_site_id,
        });

        console.log('✔ Configuration sauvegardée dans config/gateway.config.json');
      } catch (err: any) {
        console.error(`❌ Échec de l’appairage : ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'scan': {
      console.log('--- RECHERCHE MULTICAST ONVIF (WS-Discovery) ---');
      const found = await OnvifScanner.discoverMulticast(4000);
      console.log(`\nNombre de caméras détectées sur le LAN : ${found.length}`);
      if (found.length === 0) {
        console.log('Aucun équipement ONVIF n’a répondu sur 239.255.255.250:3702.');
        console.log('Astuce : Utilisez la commande "probe --ip <IP>" pour tester directement une adresse IP.');
      } else {
        console.table(
          found.map((c) => ({
            IP: c.ip,
            Port: c.port,
            Fabricant: c.manufacturer || 'Inconnu',
            Modèle: c.model || 'ONVIF Device',
            Série: c.serialNumber || 'N/A',
            RTSP: c.rtspUrl ? 'Disponible' : 'Non détecté',
          }))
        );
      }
      break;
    }

    case 'probe': {
      let ip = '';
      let port = 80;
      let user = '';
      let pass = '';

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--ip' && args[i + 1]) ip = args[i + 1];
        if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1], 10);
        if (args[i] === '--user' && args[i + 1]) user = args[i + 1];
        if (args[i] === '--pass' && args[i + 1]) pass = args[i + 1];
      }

      if (!ip) {
        console.error('❌ Erreur: --ip <ADRESSE_IP> est obligatoire.');
        process.exit(1);
      }

      console.log(`--- SONDE MATÉRIELLE SUR ${ip}:${port} ---`);
      const result = await OnvifScanner.probePhysicalCamera(ip, port, {
        username: user || undefined,
        password: pass || undefined,
      });

      console.log('Résultats du test physique :');
      console.log(`- Joignabilité Réseau : ${result.isReachable ? '✔ OUI' : '❌ NON'}`);
      console.log(`- ONVIF Détecté      : ${result.onvifDetected ? '✔ OUI' : '❌ NON'}`);
      console.log(`- Port RTSP (554)    : ${result.rtspDetected ? '✔ OUVERT' : '❌ FERMÉ'}`);
      console.log(`- Fabricant          : ${result.manufacturer || 'Non identifié'}`);
      console.log(`- Modèle             : ${result.model || 'Non identifié'}`);
      console.log(`- Firmware Version   : ${result.firmwareVersion || 'N/A'}`);
      console.log(`- Numéro de Série    : ${result.serialNumber || 'N/A'}`);
      console.log('\nJournal de diagnostic :');
      result.diagnosticNotes.forEach((n) => console.log(`  * ${n}`));
      break;
    }

    case 'test-hw': {
      console.log('================================================================');
      console.log('TEST MATÉRIEL PHYSIQUE DU RÉSEAU LOCAL (Sections 26 & 27)');
      console.log('================================================================');
      console.log('1. Recherche multicast automatique...');
      const multicastFound = await OnvifScanner.discoverMulticast(3000);

      // Si aucune caméra multicast n'a répondu, tester la passerelle locale ou des IPs fréquentes
      const candidates = multicastFound.map((c) => c.ip);
      if (candidates.length === 0) {
        candidates.push('192.168.100.1'); // Routeur/Passerelle locale
      }

      console.log(`2. Audit des cibles détectées (${candidates.length})...`);
      for (const ip of candidates) {
        const probe = await OnvifScanner.probePhysicalCamera(ip, 80);
        console.log(`\nCible : ${ip}`);
        console.log(`- Statut Réseau : ${probe.isReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
        console.log(`- ONVIF Support : ${probe.onvifDetected ? 'OUI' : 'NON'}`);
        console.log(`- RTSP Support  : ${probe.rtspDetected ? 'OUI' : 'NON'}`);
        console.log(`- Détails       : ${probe.manufacturer || 'Matériel non ONVIF'} ${probe.model || ''}`);
      }

      console.log('\n================================================================');
      console.log('BILAN MATÉRIEL PHYSIQUE LOCAL :');
      if (multicastFound.length > 0) {
        console.log(`✔ ${multicastFound.length} caméra(s) physique(s) ONVIF validée(s) sur le réseau.`);
      } else {
        console.log('ℹ Aucune caméra physique ONVIF détectée sur le sous-réseau local actuel (192.168.100.x).');
        console.log('  Pour tester une caméra physique spécifique branchée au réseau :');
        console.log('  cmd: npx tsx edge-gateway/src/cli.ts probe --ip <IP_DE_VOTRE_CAMERA>');
      }
      console.log('================================================================\n');
      break;
    }

    case 'run':
    case 'start': {
      const daemon = new EdgeGatewayDaemon();
      await daemon.start();
      break;
    }

    case 'help':
    default: {
      console.log(`
SECURIA EDGE VIDEO GATEWAY CLI v0.1.0

Usage:
  securia-gateway pair --code <CODE> [--cloud <URL>]   Appairer avec Securia Cloud
  securia-gateway scan                                 Recherche multicast ONVIF sur le LAN
  securia-gateway probe --ip <IP> [--port <P>]         Diagnostiquer une caméra IP spécifique
  securia-gateway test-hw                              Auditer le banc matériel physique
  securia-gateway run                                  Démarrer le daemon de supervision
      `);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});

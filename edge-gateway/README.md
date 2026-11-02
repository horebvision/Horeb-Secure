# SECURIA EDGE VIDEO GATEWAY (v0.1.0)
## Composant Réseau Local pour l'Intégration Vidéo Hybride SECURIA SOC

Le **SECURIA Edge Video Gateway** est un daemon léger conçu pour être déployé sur le réseau local (LAN) des sites protégés (résidences, entrepôts, banques, usines).

Il résout l'interopérabilité entre les caméras IP physiques locales et la plateforme Cloud SECURIA :
1. **Découverte ONVIF locale (WS-Discovery)** sur le sous-réseau sans traversée NAT.
2. **Relais média sécurisé (RTSP $\to$ WebRTC/HLS/Snapshot)** pour la visualisation SOC sans exposer d'identifiants caméra.
3. **Connexion 100% sortante (Outbound HTTPS/WSS)** : ZÉRO port entrant ouvert sur le routeur client.
4. **Tampon hors-ligne (Offline Buffer)** : En cas de coupure Internet sur le site, les détections d'intrusion sont stockées localement et synchronisées dès le rétablissement de la liaison.

---

## 1. Prérequis Matériels

- **Matériel :** Raspberry Pi 4/5 (4 Go+ recommandé), Intel NUC, Mini-PC x86 ou machine virtuelle Linux (Ubuntu/Debian).
- **Réseau :** Connecté au même réseau local (VLAN caméra ou réseau principal) que les caméras IP / NVR.
- **Sortie Internet :** Accès HTTPS (port 443) sortant vers `https://securia-pilot.netlify.app`.

---

## 2. Démarrage Rapide

### Option A : Exécution via Docker Compose (Recommandé)

```bash
cd edge-gateway
cp config/gateway.config.json.example config/gateway.config.json
docker compose up -d
```

### Option B : Exécution directe Node.js / CLI

```bash
cd edge-gateway
npm install
# Scanner les caméras du réseau local
npm run scan

# Tester une caméra physique spécifique
npx tsx src/cli.ts probe --ip 192.168.1.50 --port 80

# Appairer la passerelle avec le Cloud SECURIA
npx tsx src/cli.ts pair --code SEC-GW-849201 --cloud https://securia-pilot.netlify.app

# Lancer la passerelle en arrière-plan
npm start
```

---

## 3. Protocole d'Appairage (Pairing)

1. Depuis le SOC SECURIA ([`/dispatch/video-gateways`](https://securia-pilot.netlify.app/dispatch/video-gateways)), cliquez sur **"Nouvelle Passerelle"**.
2. Sélectionnez le site protégé (ex: *Résidence Cocody*).
3. Le Cloud génère un code d'appairage temporaire (ex: `SEC-GW-938210`, valide 20 minutes).
4. Sur le terminal du Gateway sur site, exécutez :
   ```bash
   securia-gateway pair --code SEC-GW-938210
   ```
5. Le Gateway s'authentifie, reçoit un jeton cryptographique permanent et bascule en statut **ONLINE**.

---

## 4. Sécurité

- Aucun mot de passe caméra n'est envoyé au Cloud ou au navigateur.
- Flux vidéo négocié uniquement par jetons éphémères signés HMAC (5 min TTL).
- Chiffrement TLS de toutes les communications avec SECURIA Cloud.

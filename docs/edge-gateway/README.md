# SECURIA EDGE VIDEO GATEWAY — GUIDE TECHNIQUE COMPLET
## DOCUMENTATION D'ARCHITECTURE & DÉPLOIEMENT SUR SITE (v0.1.0)

---

### SOMMAIRE
1. [Architecture Globale](#1-architecture-globale)
2. [Installation Matérielle & Logicielle](#2-installation-matérielle--logicielle)
3. [Configuration du Système](#3-configuration-du-système)
4. [Protocole d'Appairage (Pairing)](#4-protocole-dappairage-pairing)
5. [Intégration & Découverte Caméras ONVIF](#5-intégration--découverte-caméras-onvif)
6. [Gestion des Flux RTSP](#6-gestion-des-flux-rtsp)
7. [Relais WebRTC & HLS Faible Latence](#7-relais-webrtc--hls-faible-latence)
8. [Guide de Dépannage (Troubleshooting)](#8-guide-de-dépannage-troubleshooting)
9. [Politique de Sécurité & Confidentialité](#9-politique-de-sécurité--confidentialité)
10. [Procédure de Mise à Jour](#10-procédure-de-mise-à-jour)
11. [Procédure de Désinstallation](#11-procédure-de-désinstallation)

---

### 1. Architecture Globale

Le **SECURIA Edge Video Gateway** fait le pont entre le réseau local client (LAN) et le SOC SECURIA :

```
RÉSEAU LOCAL SÉCURISÉ (LAN CLIENT)                 INTERNET              SECURIA CLOUD
┌─────────────────────────┐                                            ┌────────────────┐
│ Caméras IP ONVIF / RTSP │                                            │ SECURIA SOC    │
│ (Hikvision, Dahua, Axis)│                                            │ Command Center │
└───────────┬─────────────┘                                            └───────▲────────┘
            │ RTSP/ONVIF (Local)                                               │
            ▼                                                                  │
┌─────────────────────────┐               Connexion Sortante                   │
│ SECURIA EDGE GATEWAY    │ ───────────────────────────────────────────────────┤
│ - Découverte Multicast  │        (HTTPS / WSS Sortant uniquement)            │
│ - go2rtc WebRTC Relay   │                                                    │
│ - Buffer Hors-Ligne     │                                                    │
└─────────────────────────┘                                                    │
            ▲                                                                  │
            │ (Événement d'intrusion local)                                    │
            └──────────────────────────────────────────────────────────────────┘
```

---

### 2. Installation Matérielle & Logicielle

#### Matériel Recommandé :
- **Appareil :** Raspberry Pi 4 ou 5 (4 Go RAM+), Intel NUC, Mini-PC x86 fanless.
- **Stockage :** 32 Go MicroSD haute endurance ou SSD NVMe.
- **Alimentation :** Ondulée (UPS / PoE Splitter recommandé).

#### Installation sous Linux / Debian / Ubuntu :
```bash
# Cloner le module ou extraire l'archive binaire
cd /opt
sudo git clone https://github.com/securia/edge-gateway.git securia-edge-gateway
cd securia-edge-gateway

# Installation des dépendances
npm install --omit=dev
```

#### Déploiement via Docker :
```bash
docker compose up -d
```

---

### 3. Configuration du Système

Fichier `/opt/securia-edge-gateway/config/gateway.config.json` :
```json
{
  "cloudUrl": "https://securia-pilot.netlify.app",
  "gatewayCode": "GW-COCODY-01",
  "heartbeatIntervalSec": 30,
  "discoveryIntervalMin": 15,
  "localSubnets": ["192.168.1.0/24"],
  "onvifPorts": [80, 8080, 8000],
  "go2rtcApiUrl": "http://127.0.0.1:1984"
}
```

---

### 4. Protocole d'Appairage (Pairing)

1. L'administrateur SOC crée la passerelle sur le portail : `/dispatch/video-gateways`.
2. Le code à usage unique (ex: `SEC-GW-849201`) est généré avec une validité de 20 minutes.
3. Sur la passerelle locale :
   ```bash
   npx tsx src/cli.ts pair --code SEC-GW-849201
   ```
4. La passerelle reçoit son jeton permanent d'authentification (`sec_gw_live_...`). Le statut passe immédiatement à **ONLINE** au SOC.

---

### 5. Intégration & Découverte Caméras ONVIF

La passerelle envoie des requêtes WS-Discovery Probe sur `239.255.255.250:3702`.
Pour lancer une recherche manuelle :
```bash
npx tsx src/cli.ts scan
```

Pour tester une caméra spécifique (Profile S/T) :
```bash
npx tsx src/cli.ts probe --ip 192.168.1.50 --port 80 --user admin --pass MotDePasse
```

---

### 6. Gestion des Flux RTSP

- La passerelle récupère le flux RTSP haute ou basse définition (ex: `rtsp://192.168.1.50:554/ch0`).
- **RÈGLE CRITIQUE :** Ce flux RTSP reste strictement sur le réseau local. Il n'est JAMAIS diffusé publiquement sur Internet.

---

### 7. Relais WebRTC & HLS Faible Latence

- Pour le visionnage au SOC, le flux est transcodé en direct vers WebRTC via le moteur `go2rtc` local.
- Latence typique observée : **150ms à 350ms**.
- Sécurité : l'accès est conditionné par un jeton éphémère SECURIA (TTL 5 minutes).

---

### 8. Guide de Dépannage (Troubleshooting)

| Symptôme | Cause Probable | Action Corrective |
| :--- | :--- | :--- |
| **Passerelle OFFLINE au SOC** | Accès Internet sortant bloqué | Vérifier que le port 443 HTTPS sortant vers `securia-pilot.netlify.app` est ouvert. |
| **Aucune caméra détectée** | IGMP Snooping bloque le multicast | Lancer `probe --ip <IP>` pour forcer l'analyse directe d'une IP. |
| **Code d'appairage expiré** | Délai de 20 minutes dépassé | Regénérer un code d'appairage depuis l'interface SOC `/dispatch/video-gateways`. |
| **Flux vidéo inaccessible** | Caméra hors-ligne ou port RTSP fermé | Vérifier les branchements réseau et les identifiants de la caméra. |

---

### 9. Politique de Sécurité & Confidentialité

1. **Aucun port entrant (No Port Forwarding) :** Toutes les connexions sont initiées par la passerelle de l'intérieur du réseau client vers le Cloud.
2. **Aucun mot de passe caméra stocké dans le Cloud :** Les mots de passe caméras restent exclusivement dans la mémoire chiffrée de la passerelle locale.
3. **Protection Anti-SSRF :** Les URLs externes sont assainies et vérifiées.
4. **Authentification HMAC-SHA256 :** Les événements et battements de cœur sont signés cryptographiquement.

---

### 10. Procédure de Mise à Jour

```bash
cd /opt/securia-edge-gateway
git pull
npm install --omit=dev
npm run build
sudo systemctl restart securia-edge-gateway
```

Ou en Docker :
```bash
docker compose pull
docker compose up -d --force-recreate
```

---

### 11. Procédure de Désinstallation

1. Révoquer la passerelle depuis le SOC SECURIA (`/dispatch/video-gateways`).
2. Sur la machine hôte :
   ```bash
   sudo systemctl stop securia-edge-gateway
   sudo systemctl disable securia-edge-gateway
   sudo rm -rf /opt/securia-edge-gateway /etc/securia
   ```

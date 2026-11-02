# ==============================================================================
# SECURIA EDGE VIDEO GATEWAY — DOCKERFILE
# Conçu pour : Raspberry Pi (ARM64), Intel NUC, Mini-PC, Serveurs Linux
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit

COPY . .

# Image de production finale ultra-légère
FROM node:20-alpine

LABEL maintainer="SECURIA SOC Team <support@securia.ci>"
LABEL description="SECURIA Edge Video Gateway — Daemon local ONVIF & Relay"
LABEL version="0.1.0"

WORKDIR /opt/securia-edge-gateway

# Installation d'outils réseau de diagnostic
RUN apk add --no-cache curl iputils net-tools tzdata

COPY --from=builder /app /opt/securia-edge-gateway

# Volumes pour la persistance de l'outbox hors-ligne et la configuration
VOLUME ["/opt/securia-edge-gateway/config", "/opt/securia-edge-gateway/data"]

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV SECURIA_CLOUD_URL="https://securia-pilot.netlify.app"
ENV SECURIA_HEARTBEAT_SEC=30
ENV SECURIA_DISCOVERY_MIN=15

# Exposition du port WebRTC/RTSP local si relais actif
EXPOSE 1984 8554 8555/udp

ENTRYPOINT ["node", "dist/daemon.js"]
CMD ["run"]

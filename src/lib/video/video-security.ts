/**
 * SECURIA V2 — PHASE 8 : SÉCURITÉ VIDÉO, ANTI-SSRF & TOKENS ÉPHÉMÈRES (Section 7, 25)
 * Garanties :
 * - Aucun mot de passe ni flux RTSP privé renvoyé au navigateur
 * - Validation stricte des URLs contre le SSRF (bloquage loopback, RFC 1918, metadata cloud 169.254)
 * - Signatures HMAC pour les flux avec durée de validité courte (5 min)
 * - Masquage des secrets dans les logs
 */

import crypto from 'crypto';
import { EphemeralStreamToken, VideoCamera, VideoProtocol } from './types';

const STREAM_TOKEN_SECRET = process.env.VIDEO_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'securia_stream_secret_key_2026';
const TOKEN_TTL_SECONDS = 300; // 5 minutes max

/**
 * Validation anti-SSRF pour les URLs d'accès aux systèmes vidéo (NVR, VMS, caméras Cloud)
 */
export function validateVideoEndpointUrl(
  urlStr: string,
  options: { allowLocalGateway?: boolean } = {}
): { valid: boolean; error?: string; sanitizedUrl?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'L’adresse de l’équipement vidéo est requise.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, error: 'Format d’URL ou d’adresse IP invalide.' };
  }

  // 1. Protocoles acceptés
  const allowedProtocols = ['https:', 'http:', 'rtsp:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocole ${parsed.protocol} non autorisé. Utilisez HTTPS, HTTP (passerelle) ou RTSP.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Protection contre les métadonnées Cloud (AWS, GCP, Azure, DigitalOcean)
  if (/^169\.254\./.test(hostname)) {
    return {
      valid: false,
      error: 'Accès interdit aux endpoints de métadonnées d’infrastructure cloud (169.254.x.x - SSRF).',
    };
  }

  // 3. Bouclage local (localhost, 127.0.0.1, ::1, 0.0.0.0)
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
  if (isLoopback && !options.allowLocalGateway) {
    return {
      valid: false,
      error: 'Les adresses de bouclage local (localhost/127.0.0.1) sont interdites depuis le réseau public.',
    };
  }

  // 4. Plages IP privées RFC 1918 (10.x, 192.168.x, 172.16-31.x)
  // Tolérées UNIQUEMENT si le système est explicitement étiqueté comme passerelle locale / edge connector
  const isPrivateIp =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

  if (isPrivateIp && !options.allowLocalGateway) {
    return {
      valid: false,
      error: 'Adresse IP privée RFC 1918 non autorisée sans configuration de passerelle locale (Edge Gateway).',
    };
  }

  // 5. Domaines internes réservés
  if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.lan') || hostname.endsWith('.corp')) {
    if (!options.allowLocalGateway) {
      return {
        valid: false,
        error: 'Noms de domaine internes (.internal, .local) interdits en accès direct externe.',
      };
    }
  }

  return { valid: true, sanitizedUrl: parsed.toString() };
}

/**
 * Génère un jeton éphémère signé pour consultation sécurisée d'un flux
 * Le jeton expire sous 5 minutes et empêche l'accès direct aux identifiants caméra
 */
export function generateEphemeralStreamToken(
  camera: VideoCamera,
  userId: string,
  userOrgId: string
): EphemeralStreamToken {
  // Sécurité multi-tenant : vérification de cohérence d'organisation
  if (camera.organization_id !== userOrgId) {
    throw new Error('Violation de ségrégation d’organisation (Anti-IDOR).');
  }

  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const payloadToSign = `${camera.id}:${camera.organization_id}:${userId}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', STREAM_TOKEN_SECRET).update(payloadToSign).digest('hex');
  const token = `vtok_${Buffer.from(payloadToSign).toString('base64url')}.${hmac}`;

  return {
    token,
    expires_at: expiresAt,
    camera_id: camera.id,
    site_id: camera.protected_site_id,
    organization_id: camera.organization_id,
    user_id: userId,
    protocol: camera.protocol,
    stream_relay_url: `/api/video/relay?token=${token}`,
  };
}

/**
 * Vérifie et décode un jeton éphémère de flux vidéo
 */
export function verifyEphemeralStreamToken(tokenStr: string): {
  valid: boolean;
  cameraId?: string;
  organizationId?: string;
  userId?: string;
  error?: string;
} {
  if (!tokenStr || !tokenStr.startsWith('vtok_')) {
    return { valid: false, error: 'Format de jeton vidéo invalide.' };
  }

  const parts = tokenStr.slice(5).split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Structure de jeton corrompue.' };
  }

  const [encodedPayload, receivedHmac] = parts;
  let decodedPayload = '';
  try {
    decodedPayload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return { valid: false, error: 'Décodage payload échoué.' };
  }

  const expectedHmac = crypto.createHmac('sha256', STREAM_TOKEN_SECRET).update(decodedPayload).digest('hex');
  if (expectedHmac !== receivedHmac) {
    return { valid: false, error: 'Signature du jeton vidéo invalide.' };
  }

  const [cameraId, orgId, userId, ...rest] = decodedPayload.split(':');
  const expiresAtStr = rest.join(':');
  let expiresAtMs = Number(expiresAtStr);
  if (isNaN(expiresAtMs) || expiresAtStr.includes('T')) {
    expiresAtMs = new Date(expiresAtStr).getTime();
  }
  if (isNaN(expiresAtMs) || Date.now() > expiresAtMs) {
    return { valid: false, error: 'Jeton de consultation vidéo expiré.' };
  }

  return {
    valid: true,
    cameraId,
    organizationId: orgId,
    userId,
  };
}

/**
 * Nettoie les objets de caméra avant envoi au frontend pour garantir zéro fuite de secret
 */
export function sanitizeCameraForClient(camera: VideoCamera): Partial<VideoCamera> {
  const { stream_internal_url, ...safeCamera } = camera;
  return safeCamera;
}

/**
 * Nettoie les objets système vidéo avant envoi au frontend
 */
export function sanitizeSystemForClient(system: any): any {
  const { credentials_encrypted, ...safeSystem } = system;
  return safeSystem;
}

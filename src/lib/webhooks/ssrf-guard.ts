/**
 * SECURIA V2 — SSRF PROTECTION & URL VALIDATOR
 * Protection stricte contre les requêtes forgées côté serveur (SSRF - Section 40).
 * Empêche l'accès aux réseaux internes, métadonnées cloud et protocoles non sécurisés.
 */

export function validateWebhookUrl(
  urlStr: string,
  options: { allowLocalhostInDev?: boolean; allowHttp?: boolean } = {}
): { valid: boolean; error?: string; sanitizedUrl?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'L’URL du webhook est obligatoire.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return { valid: false, error: 'Format d’URL invalide.' };
  }

  // 1. Validation du protocole (HTTPS obligatoire)
  if (parsed.protocol === 'https:') {
    // OK
  } else if (parsed.protocol === 'http:' && options.allowHttp) {
    // Toléré uniquement si explicitement permis
  } else {
    return {
      valid: false,
      error: 'Le protocole HTTPS est strictement obligatoire pour les endpoints partenaires.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Protection contre les adresses IP internes / privées & métadonnées cloud
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (isLocalhost && !options.allowLocalhostInDev) {
    return {
      valid: false,
      error: 'Les adresses de bouclage local (localhost) sont interdites.',
    };
  }

  // Plages IP privées RFC 1918 et adresses de liaison locale
  const isPrivateIp =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname) || // AWS / GCP / Azure metadata endpoint
    /^0\.0\.0\.0$/.test(hostname);

  if (isPrivateIp) {
    return {
      valid: false,
      error: 'L’URL cible pointe vers un réseau ou une plage IP interne interdite (Protection SSRF).',
    };
  }

  // 3. Domaines internes réservés
  if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.lan') || hostname.endsWith('.corp')) {
    return {
      valid: false,
      error: 'Les noms de domaine internes (.internal, .local) sont interdits.',
    };
  }

  return { valid: true, sanitizedUrl: parsed.toString() };
}

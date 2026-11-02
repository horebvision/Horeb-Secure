/**
 * =============================================================================
 * SECURIA SaaS — MODULE PARTAGÉ DE GARDE-FOU CIBLE & ANTI-PRODUCTION (PHASE 2.11)
 * Fichier : scripts/target-guard.js
 * =============================================================================
 * 
 * RÔLE :
 * Fournir une barrière de validation uniforme, fail-closed et stricte avant toute
 * initialisation de client Supabase, requête fetch ou mutation de données.
 * 
 * RÈGLES DEVSECOPS :
 * 1. REFUS ABSOLU ET SYSTÉMATIQUE DE LA PRODUCTION (gwxchazcuosajziampvk).
 * 2. L'allowlist APPROVED_STAGING_PROJECT_REFS DOIT RESTER STRICTEMENT VIDE ([])
 *    en l'absence d'un environnement de staging isolé officiellement audité.
 * 3. Toute tentative d'appel distant échoue immédiatement (process.exit(1))
 *    tant que l'allowlist est vide, même avec --execute ou une clé service_role.
 * 4. Aucune valeur de secret n'est affichée dans la console.
 * =============================================================================
 */

const { URL } = require('url');

/**
 * LISTE BLANCHE DES RÉFÉRENCES DE PROJET DE STAGING APPROUVÉES INDÉPENDAMMENT
 * STRICTEMENT VIDE : Toute exécution distante est bloquée par défaut (Fail-Closed).
 */
const APPROVED_STAGING_PROJECT_REFS = Object.freeze([
  'mqwqetkudsjxjmajccxe'
]);

/**
 * LISTE NOIRE FORMELLE DES IDENTIFIANTS DE PRODUCTION CONNUS (DÉFENSE EN PROFONDEUR)
 */
const KNOWN_PRODUCTION_REFS = Object.freeze([
  'gwxchazcuosajziampvk' // Référence de production officielle de SECURIA
]);

/**
 * Valide et verrouille la cible avant toute initialisation de client ou appel réseau.
 * @param {string} [rawUrl] - URL Supabase cible (ex: process.env.NEXT_PUBLIC_SUPABASE_URL)
 * @param {string} [rawProjectRef] - Référence optionnelle du projet Supabase
 * @returns {{ baseUrl: string, projectRef: string, isLocal: boolean }}
 */
function assertAuthorizedTarget(rawUrl, rawProjectRef) {
  const urlStr = (rawUrl || '').trim();
  const refStr = (rawProjectRef || '').trim().toLowerCase();

  if (!urlStr && !refStr) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Cible non spécifiée (URL ou référence de projet manquante).');
    process.exit(1);
  }

  // 1. Contrôle préalable de la référence de projet si fournie
  if (refStr) {
    if (KNOWN_PRODUCTION_REFS.includes(refStr) || refStr.includes('prod') || refStr.includes('live')) {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Référence de projet "${refStr}" INTERDITE (environnement de production identifié ou suspecté).`);
      process.exit(1);
    }

    if (!/^[a-z0-9_-]{3,64}$/.test(refStr)) {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format de référence de projet non valide ("${refStr}").`);
      process.exit(1);
    }
  }

  // 2. Si aucune URL n'est passée, mais seulement un refStr
  if (!urlStr && refStr) {
    if (APPROVED_STAGING_PROJECT_REFS.length === 0) {
      console.error('❌ ERREUR DEVSECOPS CRITIQUE : Aucune référence de projet de staging n\'est enregistrée dans APPROVED_STAGING_PROJECT_REFS.');
      console.error('   L\'accès distant est BLOQUÉ par défaut pour protéger les environnements de production.');
      process.exit(1);
    }
    if (!APPROVED_STAGING_PROJECT_REFS.includes(refStr)) {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : La référence "${refStr}" n'est pas approuvée dans APPROVED_STAGING_PROJECT_REFS.`);
      process.exit(1);
    }
    return { baseUrl: `https://${refStr}.supabase.co`, projectRef: refStr, isLocal: false };
  }

  // 3. Validation de l'URL
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch (err) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format d'URL invalide ("${urlStr}") : ${err.message}`);
    process.exit(1);
  }

  // Rejet de tout vecteur d'ambiguïté dans l'URL
  if (parsedUrl.username || parsedUrl.password) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Présence d\'identifiants utilisateur (userinfo) interdite dans l\'URL.');
    process.exit(1);
  }
  if (parsedUrl.search || parsedUrl.hash) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Paramètres de requête (?) et fragments (#) interdits dans l\'URL cible.');
    process.exit(1);
  }
  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Chemin d'URL non racine interdit ("${parsedUrl.pathname}").`);
    process.exit(1);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Refus absolu de tout hôte de production ou domaine applicatif
  if (hostname.includes('production') || hostname.includes('app.securia.com') || hostname === 'securia.com') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte de production interdit ("${hostname}"). Arrêt immédiat.`);
    process.exit(1);
  }

  const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';

  if (isLocal) {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole invalide pour hôte local ("${parsedUrl.protocol}").`);
      process.exit(1);
    }
    if (process.env.ALLOW_LOCAL_MOCK_EXECUTION !== 'true') {
      console.error('❌ ERREUR DEVSECOPS CRITIQUE : L\'exécution sur hôte local nécessite l\'autorisation explicite (ALLOW_LOCAL_MOCK_EXECUTION=true).');
      process.exit(1);
    }
    return { baseUrl: parsedUrl.origin, projectRef: 'local', isLocal: true };
  }

  // Projet distant Cloud
  if (parsedUrl.protocol !== 'https:') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole non sécurisé ("${parsedUrl.protocol}"). HTTPS obligatoire pour les projets distants.`);
    process.exit(1);
  }
  if (parsedUrl.port && parsedUrl.port !== '443') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Port non standard ("${parsedUrl.port}") interdit pour un projet cloud.`);
    process.exit(1);
  }

  // Extraction du project ref depuis l'hôte Cloud
  const hostMatch = hostname.match(/^([a-z0-9_-]+)\.supabase\.co$/);
  if (!hostMatch) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte Cloud non reconnu ("${hostname}"). Seul le format <ref>.supabase.co est supporté.`);
    process.exit(1);
  }

  const extractedRef = hostMatch[1].toLowerCase();

  // Contrôle anti-production sur le ref extrait
  if (KNOWN_PRODUCTION_REFS.includes(extractedRef) || extractedRef.includes('prod') || extractedRef.includes('live')) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Référence de projet "${extractedRef}" INTERDITE (environnement de production identifié ou suspecté).`);
    process.exit(1);
  }

  // Vérification de cohérence si refStr était aussi fourni
  if (refStr && refStr !== extractedRef) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Discordance entre la référence fournie ("${refStr}") et l'hôte ("${extractedRef}").`);
    process.exit(1);
  }

  // Contrôle de l'allowlist
  if (APPROVED_STAGING_PROJECT_REFS.length === 0) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Aucune référence de projet de staging n\'est enregistrée dans APPROVED_STAGING_PROJECT_REFS.');
    console.error('   L\'accès distant est BLOQUÉ par défaut pour protéger les environnements de production.');
    process.exit(1);
  }

  if (!APPROVED_STAGING_PROJECT_REFS.includes(extractedRef)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : La référence "${extractedRef}" n'est pas approuvée dans APPROVED_STAGING_PROJECT_REFS.`);
    process.exit(1);
  }

  return { baseUrl: parsedUrl.origin, projectRef: extractedRef, isLocal: false };
}

/**
 * HÔTES DE BOUCLE LOCALE STRICTEMENT AUTORISÉS POUR TEST_BASE_URL
 */
const ALLOWED_LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1']);

/**
 * PORTS LOCAUX AUTORISÉS POUR L'APPLICATION NEXT.JS (DEV / TEST)
 */
const ALLOWED_LOCAL_APP_PORTS = Object.freeze(['3000', '3001']);

/**
 * Valide et verrouille strictement l'URL locale de test de l'application Next.js (TEST_BASE_URL).
 * Interdit formellement toute cible externe, tout hôte distant, tout port non autorisé et tout paramètre.
 * @param {string} rawBaseUrl - URL de base à tester (ex: process.env.TEST_BASE_URL)
 * @param {readonly string[]|number[]} [allowedPorts] - Ports autorisés (défaut: ['3000', '3001'])
 * @returns {string} Origine validée et normalisée (ex: 'http://localhost:3000')
 */
function assertAuthorizedLocalBaseUrl(rawBaseUrl, allowedPorts = ALLOWED_LOCAL_APP_PORTS) {
  const urlStr = (rawBaseUrl || '').trim();

  if (!urlStr) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : TEST_BASE_URL non spécifiée ou vide.');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr);
  } catch (err) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format de TEST_BASE_URL invalide ("${urlStr}") : ${err.message}`);
    process.exit(1);
  }

  // 1. Protocoles autorisés : http: ou https:
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole non autorisé pour TEST_BASE_URL ("${parsedUrl.protocol}"). Seuls http: et https: sont acceptés.`);
    process.exit(1);
  }

  // 2. Interdiction des identifiants utilisateur (userinfo)
  if (parsedUrl.username || parsedUrl.password) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Identifiants utilisateur (userinfo) interdits dans TEST_BASE_URL.');
    process.exit(1);
  }

  // 3. Interdiction des paramètres de requête et fragments
  if (parsedUrl.search || parsedUrl.hash) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Paramètres (?) et fragments (#) interdits dans TEST_BASE_URL.');
    process.exit(1);
  }

  // 4. Interdiction des chemins non racine
  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Chemin non racine interdit dans TEST_BASE_URL ("${parsedUrl.pathname}").`);
    process.exit(1);
  }

  // 5. Hôte strictement loopback (localhost ou 127.0.0.1)
  const hostname = parsedUrl.hostname.toLowerCase();
  if (!ALLOWED_LOCAL_HOSTS.includes(hostname)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte non autorisé pour TEST_BASE_URL ("${hostname}"). Seuls localhost et 127.0.0.1 sont acceptés.`);
    process.exit(1);
  }

  // 6. Exclusion formelle des URLs Supabase (même locales ou distantes)
  if (hostname.includes('supabase')) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Une URL Supabase ne peut pas servir de TEST_BASE_URL applicative.');
    process.exit(1);
  }

  // 7. Validation des ports autorisés pour l'application locale
  const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const validPorts = allowedPorts.map(String);
  if (!validPorts.includes(port)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Port non autorisé pour TEST_BASE_URL ("${port}"). Ports admis : ${validPorts.join(', ')}.`);
    process.exit(1);
  }

  return parsedUrl.origin;
}

module.exports = {
  APPROVED_STAGING_PROJECT_REFS,
  KNOWN_PRODUCTION_REFS,
  ALLOWED_LOCAL_HOSTS,
  ALLOWED_LOCAL_APP_PORTS,
  assertAuthorizedTarget,
  assertAuthorizedLocalBaseUrl,
};


/**
 * =============================================================================
 * SECURIA SaaS — SCRIPT DE DÉPLOIEMENT NETLIFY SÉCURISÉ (PHASE 2.11)
 * Fichier : scripts/deploy-to-netlify.js
 * =============================================================================
 * 
 * RÈGLES DEVSECOPS & FAIL-CLOSED :
 * 1. Le déploiement est STRICTEMENT BLOQUÉ par défaut (ALLOW_NETLIFY_DEPLOYMENT=true requis).
 * 2. Aucun identifiant de site de production n'est injecté par défaut.
 *    NETLIFY_SITE_ID est strictement obligatoire.
 * 3. En cas de ciblage de production, une confirmation d'environnement explicite
 *    CONFIRM_PRODUCTION_NETLIFY_DEPLOYMENT=true est exigée.
 * 4. Jamais de jeton d'authentification transmis en argument CLI (argv) pour
 *    éviter l'exposition dans la table des processus du système.
 * 5. Aucun secret (NETLIFY_AUTH_TOKEN) n'est affiché dans les logs ou sorties.
 * =============================================================================
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 1. GARDE-FOU FAIL-CLOSED : Déploiement bloqué par défaut
if (process.env.ALLOW_NETLIFY_DEPLOYMENT !== 'true') {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : Le déploiement Netlify est STRICTEMENT BLOQUÉ par défaut.');
  console.error('   Pour autoriser un déploiement, vous devez positionner explicitement :');
  console.error('   ALLOW_NETLIFY_DEPLOYMENT=true');
  process.exit(1);
}

// 2. Initialisation et validation stricte de l'identifiant du site
const rawSiteId = process.env.NETLIFY_SITE_ID;
const siteId = (rawSiteId || '').trim();

if (!siteId) {
  console.error('❌ ERREUR DE CONFIGURATION : NETLIFY_SITE_ID est requis et ne peut être vide.');
  process.exit(1);
}

// Format UUID strict (Netlify API ID)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(siteId)) {
  console.error(`❌ ERREUR DE CONFIGURATION : NETLIFY_SITE_ID doit être un UUID valide (reçu: "${siteId}").`);
  process.exit(1);
}

// 3. Listes d'autorisations et d'exclusions (DevSecOps)
const KNOWN_PRODUCTION_NETLIFY_SITE_IDS = Object.freeze([
  '9f73d443-9f21-4685-ab45-bd040d0b9a16'
]);

/**
 * LISTE BLANCHE DES SITES NETLIFY DE STAGING APPROUVÉS INDÉPENDAMMENT
 * STRICTEMENT VIDE par défaut : Tout déploiement staging distant est bloqué par défaut (Fail-Closed).
 */
const APPROVED_STAGING_NETLIFY_SITE_IDS = Object.freeze([
  '8c5cc38b-91f0-4b17-90a5-1b90af796237'
]);

// 4. Détection et analyse des modes d'exécution
const isProdFlag = process.argv.includes('--prod');
const isStagingFlag = process.argv.includes('--staging') || process.env.DEPLOY_ENV === 'staging';
const deployEnv = (process.env.DEPLOY_ENV || '').trim().toLowerCase();
const isKnownProdSite = KNOWN_PRODUCTION_NETLIFY_SITE_IDS.includes(siteId);

// 4.1 Contrôles de non-contradiction des paramètres
if (isProdFlag && isStagingFlag) {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : Combinaison contradictoire de paramètres.');
  console.error('   Les drapeaux --staging et --prod sont mutuellement exclusifs et ne peuvent être utilisés conjointement.');
  process.exit(1);
}

if (deployEnv && !['staging', 'production'].includes(deployEnv)) {
  console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Valeur de DEPLOY_ENV non reconnue ("${deployEnv}").`);
  console.error('   Seules les valeurs "staging" et "production" sont admises.');
  process.exit(1);
}

if (process.argv.includes('--staging') && deployEnv === 'production') {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : Contradiction entre argument CLI (--staging) et DEPLOY_ENV=production.');
  process.exit(1);
}

if (isProdFlag && deployEnv === 'staging') {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : Contradiction entre argument CLI (--prod) et DEPLOY_ENV=staging.');
  process.exit(1);
}

// 4.2 Obligation de qualification de l'environnement cible
if (!isStagingFlag && !isKnownProdSite && !isProdFlag && deployEnv !== 'production') {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : Environnement cible non qualifié.');
  console.error('   Pour un site staging, spécifiez explicitement --staging (ou DEPLOY_ENV=staging).');
  console.error('   Pour un site de production, spécifiez explicitement --prod.');
  process.exit(1);
}

// 4.3 Garde-fous STAGING (Fail-Closed strict)
if (isStagingFlag) {
  if (isKnownProdSite) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Conflit d\'environnement absolu.');
    console.error(`   Tentative de déploiement STAGING sur le site Netlify de PRODUCTION ("${siteId}"). Arrêt immédiat.`);
    process.exit(1);
  }

  if (APPROVED_STAGING_NETLIFY_SITE_IDS.length === 0) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Aucune référence de site de staging n\'est enregistrée dans APPROVED_STAGING_NETLIFY_SITE_IDS.');
    console.error('   Le déploiement staging est BLOQUÉ par défaut tant qu\'aucun site staging dédié n\'est homologué.');
    process.exit(1);
  }

  if (!APPROVED_STAGING_NETLIFY_SITE_IDS.includes(siteId)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Le site Netlify cible ("${siteId}") n'est pas homologué dans APPROVED_STAGING_NETLIFY_SITE_IDS.`);
    process.exit(1);
  }
}

// 4.4 Garde-fous PRODUCTION (Double confirmation obligatoire)
if (isProdFlag || isKnownProdSite || deployEnv === 'production') {
  if (process.env.CONFIRM_PRODUCTION_NETLIFY_DEPLOYMENT !== 'true') {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Déploiement PRODUCTION refusé.');
    console.error('   Pour confirmer un déploiement en production, vous devez positionner explicitement :');
    console.error('   CONFIRM_PRODUCTION_NETLIFY_DEPLOYMENT=true');
    process.exit(1);
  }
}

// 4. Vérification de l'authentification (sans afficher la valeur)
const authToken = process.env.NETLIFY_AUTH_TOKEN;
if (!authToken) {
  console.error('❌ ERREUR DE CONFIGURATION : La variable d\'environnement NETLIFY_AUTH_TOKEN est requise.');
  process.exit(1);
}

const runJsPath = path.join(__dirname, '..', 'node_modules', 'netlify-cli', 'bin', 'run.js');
if (!fs.existsSync(runJsPath)) {
  console.error('❌ ERREUR DE CONFIGURATION : Netlify CLI non trouvé à l\'emplacement attendu.');
  process.exit(1);
}

console.log('================================================================');
console.log(`🚀 DÉPLOIEMENT NETLIFY — CIBLE : ${siteId}`);
console.log('================================================================');
console.log('Site ID   :', siteId);
console.log('Mode      :', (isProdFlag || isKnownProdSite) ? 'PRODUCTION' : 'PREVIEW');
console.log('CLI Path  :', runJsPath);

// Arguments : Ne JAMAIS inclure --auth dans les arguments CLI (process list leakage)
const args = [
  runJsPath,
  'deploy',
  ...(isProdFlag ? ['--prod'] : []),
  '--skip-functions-cache',
  `--site=${siteId}`,
  '--message=SECURIA: Déploiement contrôlé'
];

// Nettoyer les caches edge-functions résiduels pouvant causer des conflits webpack-runtime
const edgeDir = path.join(__dirname, '..', '.netlify', 'edge-functions');
const edgeDistDir = path.join(__dirname, '..', '.netlify', 'edge-functions-dist');
if (fs.existsSync(edgeDir)) fs.rmSync(edgeDir, { recursive: true, force: true });
if (fs.existsSync(edgeDistDir)) fs.rmSync(edgeDistDir, { recursive: true, force: true });

const child = spawn(process.execPath, args, {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    NETLIFY_AUTH_TOKEN: authToken,
    NETLIFY_SITE_ID: siteId,
    NETLIFY_TELEMETRY_DISABLE: '1',
    NEXT_DISABLE_NETLIFY_EDGE: 'true',
    CI: '1',
  },
  stdio: ['inherit', 'pipe', 'pipe']
});

child.stdout.on('data', (d) => {
  process.stdout.write(d.toString());
});

child.stderr.on('data', (d) => {
  process.stderr.write(d.toString());
});

child.on('error', (err) => {
  console.error('❌ Erreur lancement Netlify CLI :', err);
});

child.on('close', (code) => {
  console.log(`\n================================================================`);
  console.log(`🏁 Processus terminé avec le code : ${code}`);
  console.log(`================================================================`);
  process.exit(code || 0);
});

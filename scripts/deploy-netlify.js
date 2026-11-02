/**
 * Déploiement production Horeb Secure sur Netlify (runtime serveur Next.js).
 * Usage : npm run deploy
 *
 * - Construit et publie l'application COMPLÈTE (pages + routes /api + proxy d'authentification)
 *   via le runtime Next.js de Netlify. Le dossier statique `dist` ne doit plus être utilisé :
 *   il ne contient aucune route API.
 * - Aucun secret n'est stocké dans ce fichier. Variables requises dans l'environnement du shell :
 *     NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID
 *   Les variables applicatives (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, TWILIO_*, PAYMENT_*) doivent être définies dans l'interface Netlify
 *   (Site configuration > Environment variables), jamais ici.
 * - .env.local est temporairement mis de côté pendant le build pour qu'il ne soit pas
 *   embarqué dans le bundle de la fonction serveur.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envLocal = path.join(rootDir, '.env.local');
const envLocalBackup = path.join(rootDir, '.env.local.deploy-backup');

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;

if (!token || !siteId) {
  console.error('❌ NETLIFY_AUTH_TOKEN et NETLIFY_SITE_ID doivent être définis dans l’environnement du shell.');
  console.error('   Exemple (PowerShell) : $env:NETLIFY_AUTH_TOKEN="..."; $env:NETLIFY_SITE_ID="..."; npm run deploy');
  process.exit(1);
}

const runJsPath = path.join(rootDir, 'node_modules', 'netlify-cli', 'bin', 'run.js');
if (!fs.existsSync(runJsPath)) {
  console.error('❌ netlify-cli introuvable. Lancez d’abord : npm install');
  process.exit(1);
}

let movedEnv = false;
if (fs.existsSync(envLocal)) {
  fs.renameSync(envLocal, envLocalBackup);
  movedEnv = true;
}

let status = 1;
try {
  console.log('🚀 Build + déploiement production (runtime serveur Next.js) sur Netlify...');
  const res = spawnSync(
    process.execPath,
    [runJsPath, 'deploy', '--build', '--prod', `--site=${siteId}`, '--message=Horeb Secure: production deploy'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, NETLIFY_AUTH_TOKEN: token, NETLIFY_TELEMETRY_DISABLE: '1' },
    }
  );
  status = res.status ?? 1;
} finally {
  if (movedEnv && fs.existsSync(envLocalBackup)) {
    fs.renameSync(envLocalBackup, envLocal);
  }
}

if (status === 0) {
  console.log('✅ Déploiement terminé.');
} else {
  console.error(`❌ Échec du déploiement (code ${status}).`);
}
process.exit(status);

// ⚠️ ARCHIVE STATIQUE NON FONCTIONNELLE EN PRODUCTION
// Ce dossier ne contient ni routes /api ni proxy d'authentification : la plateforme ne peut pas
// y fonctionner (toutes les API renvoient 404). Utiliser `npm run deploy` (runtime serveur).
// Conservé uniquement pour une maquette visuelle : STATIC_PREVIEW_ONLY=true npm run package:dist
if (process.env.STATIC_PREVIEW_ONLY !== 'true') {
  console.error('❌ dist statique désactivé : il ne contient aucune route API. Utilisez `npm run deploy`.');
  console.error('   (Maquette visuelle uniquement : STATIC_PREVIEW_ONLY=true npm run package:dist)');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const zipFile = path.join(rootDir, 'dist.zip');

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('📦 CRÉATION DU DOSSIER DIST ET DE L\'ARCHIVE DIST.ZIP');
  console.log('================================================================');

  // 1. Nettoyer l'ancien dist
  if (fs.existsSync(distDir)) {
    console.log('Nettoyage de l\'ancien dossier dist...');
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  if (fs.existsSync(zipFile)) {
    console.log('Suppression de l\'ancien dist.zip...');
    fs.rmSync(zipFile, { force: true });
  }

  fs.mkdirSync(distDir, { recursive: true });

  // 2. Copier les fichiers publics
  const publicDir = path.join(rootDir, 'public');
  if (fs.existsSync(publicDir)) {
    console.log('Copie des fichiers publics (logos, icons, sons, manifests)...');
    copyFolderRecursiveSync(publicDir, distDir);
  }

  // 3. Copier .next/static vers dist/_next/static
  const nextStaticDir = path.join(rootDir, '.next', 'static');
  const distNextStaticDir = path.join(distDir, '_next', 'static');
  if (fs.existsSync(nextStaticDir)) {
    console.log('Copie des bundles optimisés (_next/static)...');
    copyFolderRecursiveSync(nextStaticDir, distNextStaticDir);
  }

  // 4. Copier les pages HTML générées (.next/server/app)
  const serverAppDir = path.join(rootDir, '.next', 'server', 'app');
  let indexHtmlPath = null;

  if (fs.existsSync(serverAppDir)) {
    console.log('Extraction des pages HTML pré-rendues...');
    const htmlFiles = [
      { src: 'index.html', dest: 'index.html' },
      { src: 'login.html', dest: 'login.html' },
      { src: 'register.html', dest: 'register.html' },
      { src: 'pilot.html', dest: 'pilot.html' },
      { src: 'pricing.html', dest: 'pricing.html' },
      { src: 'demo.html', dest: 'demo.html' },
      { src: 'forgot-password.html', dest: 'forgot-password.html' },
      { src: 'reset-password.html', dest: 'reset-password.html' },
      { src: 'request-demo.html', dest: 'request-demo.html' },
      { src: 'unauthorized.html', dest: 'unauthorized.html' },
      { src: '_not-found.html', dest: '404.html' },
      // Pages d'administration et de configuration pré-rendues
      { src: 'settings/organization.html', dest: 'settings/organization/index.html' },
      { src: 'settings/users.html', dest: 'settings/users/index.html' },
      { src: 'settings/usage.html', dest: 'settings/usage/index.html' },
      { src: 'settings/integrations.html', dest: 'settings/integrations/index.html' },
    ];

    for (const h of htmlFiles) {
      const srcPath = path.join(serverAppDir, h.src);
      if (fs.existsSync(srcPath)) {
        const targetPath = path.join(distDir, h.dest);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(srcPath, targetPath);
        if (h.dest === 'index.html') {
          indexHtmlPath = targetPath;
        }
        // Créer aussi la version sous-dossier (ex: dist/login/index.html) pour support serveur pur
        const nameWithoutExt = h.dest.replace('.html', '');
        if (nameWithoutExt !== 'index' && nameWithoutExt !== '404' && !h.dest.endsWith('index.html')) {
          const subDir = path.join(distDir, nameWithoutExt);
          if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
          fs.copyFileSync(srcPath, path.join(subDir, 'index.html'));
        }
      }
    }
  }

  // 4b. Provisionner les points d'entrée HTML pour toutes les routes opérationnelles (SPA Client Router)
  // Utilisation d'un App Shell sombre avec spinner éliminant tout flash de la page d'accueil marketing !
  if (indexHtmlPath && fs.existsSync(indexHtmlPath)) {
    console.log('Génération de l\'App Shell sans flash et des points d\'entrée HTML opérationnels...');
    
    let appShellHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const loadingScreenHtml = `
      <div style="min-height:100vh;background:#070d1f;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;font-family:ui-sans-serif,system-ui,sans-serif;">
        <div style="width:38px;height:38px;border:3px solid rgba(6,182,212,0.15);border-top-color:#06b6d4;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        <p style="margin-top:16px;font-size:12px;font-family:monospace;color:#64748b;letter-spacing:0.5px;">HOREB SECURE &bull; Chargement de la console...</p>
      </div>
    `.trim();

    // Remplacer le contenu visuel pré-rendu de la page d'accueil par le shell de chargement sombre
    if (appShellHtml.includes('<main')) {
      appShellHtml = appShellHtml.replace(/<main[\s\S]*?<\/main>/, `<main class="flex-1">${loadingScreenHtml}</main>`);
    }

    const operationalRoutes = [
      'admin',
      'admin/organizations',
      'admin/business',
      'admin/billing',
      'dispatch',
      'dispatch/agents',
      'dispatch/clients',
      'dispatch/cameras',
      'dispatch/exports',
      'dispatch/video-events',
      'dispatch/video-gateways',
      'dispatch/map',
      'agent',
      'agent/history',
      'dashboard',
      'client-portal',
      'client-portal/alerts',
      'client-portal/interventions',
      'client-portal/sites',
      'secretariat',
      'secretariat/visitors',
      'secretariat/visitors/new',
      'secretariat/reports',
      'business',
      'business/agents',
      'business/finance',
      'business/operations',
      'business/reports',
      'business/risk',
      'business/sites',
      'business/sla',
      'business/api-keys',
      'business/api-docs',
      'sites',
      'contacts',
      'history',
      'alerts',
      'billing',
      'billing/upgrade',
      'profile',
      'settings',
    ];

    for (const route of operationalRoutes) {
      const targetDir = path.join(distDir, ...route.split('/'));
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(path.join(targetDir, 'index.html'), appShellHtml, 'utf8');
    }
  }

  // 5. Configuration Netlify directe : _redirects & _headers
  console.log('Génération de _redirects et _headers optimisés pour Netlify Drop...');

  // Fallback JSON garanti pour éviter que Netlify Drop ne renvoie l'HTML d'accueil sur les requêtes /api/*
  const apiFallbackJson = JSON.stringify({
    success: false,
    error: 'Point de terminaison API serverless non exécuté en mode statique Netlify Drop. Utilisation du fallback client Supabase.',
  }, null, 2);
  fs.writeFileSync(path.join(distDir, 'api-fallback.json'), apiFallbackJson, 'utf8');

  const redirectsContent = `# HOREB SECURE — Redirections et Routing Netlify / SPA
# 1. Règles prioritaires : Assets statiques Next.js, Manifest PWA, Service Worker et médias
/manifest.webmanifest   /manifest.webmanifest        200
/manifest.json          /manifest.json               200
/sw.js                  /sw.js                       200
/_next/static/*         /_next/static/:splat         200
/icons/*                /icons/:splat                200
/sounds/*               /sounds/:splat               200
/favicon.ico            /favicon.ico                 200
/favicon.png            /favicon.png                 200
/logo*.png              /logo*.png                   200
/icon*.png              /icon*.png                   200
/apple-touch-icon.png   /apple-touch-icon.png        200

# 2. Endpoints d'API sur hébergement statique (Netlify Drop) :
# Renvoyer 404 JSON pour empêcher Netlify de renvoyer index.html (qui causerait "Unexpected token '<'")
/api/*                  /api-fallback.json           404

# 3. Fallback SPA universel pour la navigation client
/*                      /index.html                  200
`;
  fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent, 'utf8');


  const headersContent = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: public, max-age=0, must-revalidate
  Access-Control-Allow-Origin: *

/manifest.json
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: public, max-age=0, must-revalidate
  Access-Control-Allow-Origin: *

/sw.js
  Content-Type: application/javascript; charset=utf-8
  Service-Worker-Allowed: /
  Cache-Control: no-cache, no-store, must-revalidate

/api-fallback.json
  Content-Type: application/json; charset=utf-8

/_next/static/css/*
  Content-Type: text/css; charset=utf-8
  Cache-Control: public, max-age=31536000, immutable

/_next/static/chunks/*
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: public, max-age=31536000, immutable

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/logo*.png
  Cache-Control: public, max-age=86400

/icon*.png
  Cache-Control: public, max-age=86400
`;
  fs.writeFileSync(path.join(distDir, '_headers'), headersContent, 'utf8');

  // 7. Instructions de déploiement
  const readmeContent = `================================================================
HOREB SECURE — PACK DE DÉPLOIEMENT MANUEL (DIST)
================================================================

Ce dossier et l'archive 'dist.zip' contiennent l'application Horeb Secure
prête pour un déploiement manuel sans nécessiter de build distant.

GUIDE DE DÉPLOIEMENT :

1. DÉPLOIEMENT GLISSER-DÉPOSER NETLIFY (Netlify Drop) :
   - Rendez-vous sur votre dashboard Netlify :
     https://app.netlify.com/projects/securia-pilot/deploys
   - Faites glisser soit le dossier 'dist', soit le fichier 'dist.zip'
     dans la zone "Need to update your site? Drag and drop your site output folder here".
   - IMPORTANT : Si vous créez un NOUVEAU site, assurez-vous de désactiver
     la protection "Private" dans Site Settings > Site Protection > Public
     afin que les fichiers CSS et images ne soient pas bloqués (HTTP 401).

2. DÉPLOIEMENT RAPIDE VIA CLI (depuis le terminal du projet) :
   npx netlify deploy --dir=dist --prod --no-build --site=9f73d443-9f21-4685-ab45-bd040d0b9a16

================================================================
`;
  fs.writeFileSync(path.join(distDir, 'README.txt'), readmeContent, 'utf8');

  // 8. Compression ZIP standard avec chemins POSIX (forward slashes '/')
  console.log('Compression en dist.zip avec chemins POSIX compatibles Linux/Netlify...');
  const zip = new JSZip();

  function addDirToZip(dirPath, relativePrefix = '') {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const zipPath = relativePrefix ? `${relativePrefix}/${entry}` : entry;
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        addDirToZip(fullPath, zipPath);
      } else {
        zip.file(zipPath, fs.readFileSync(fullPath));
      }
    }
  }

  addDirToZip(distDir);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  fs.writeFileSync(zipFile, buffer);

  const stats = fs.statSync(zipFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n================================================================');
  console.log('✅ SUCCÈS : DIST ET DIST.ZIP CRÉÉS AVEC SUCCÈS');
  console.log('================================================================');
  console.log(`📁 Dossier : ${distDir}`);
  console.log(`📦 Archive : ${zipFile} (${sizeMb} Mo)`);
  console.log('Chemins internes : Standard POSIX (/) 100% compatibles Netlify');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});

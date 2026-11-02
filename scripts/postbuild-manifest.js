const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', '.next', 'server', 'functions-config-manifest.json');
// Contournement propre au runtime Netlify uniquement : sur Vercel (ou ailleurs), le proxy
// d'authentification doit rester déclaré dans le manifeste.
const isNetlifyBuild = process.env.NETLIFY === 'true';
if (isNetlifyBuild && fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.functions) {
      for (const key of Object.keys(manifest.functions)) {
        if (key.includes('middleware') || key.includes('proxy')) {
          delete manifest.functions[key];
        }
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log('✔ functions-config-manifest.json optimisé pour le runtime serveur Netlify (Edge Middleware bypass)');
    }
  } catch (err) {
    console.warn('Postbuild manifest warning:', err);
  }
}

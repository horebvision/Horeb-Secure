const https = require('https');

async function testUrl(path) {
  return new Promise((resolve) => {
    https.get(`https://horeb-secure.netlify.app${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[${res.statusCode}] ${path} (taille: ${data.length} octets)`);
        if (path === '/') {
          console.log(`  -> Présence de id="features":`, data.includes('id="features"'));
          console.log(`  -> Présence de id="pipeline":`, data.includes('id="pipeline"'));
          console.log(`  -> Présence de id="modules":`, data.includes('id="modules"'));
        }
        if (path === '/pricing') {
          console.log(`  -> Présence grille FCFA:`, data.includes('FCFA'));
          console.log(`  -> Pas de double header:`, (data.match(/<header/g) || []).length <= 1);
        }
        resolve();
      });
    }).on('error', (err) => {
      console.error(`Erreur sur ${path}:`, err.message);
      resolve();
    });
  });
}

async function run() {
  console.log('=== TEST DE VALIDATION EN DIRECT SUR NETLIFY ===');
  await testUrl('/');
  await testUrl('/pricing');
  await testUrl('/demo');
  console.log('=== TEST TERMINÉ ===');
}

run();

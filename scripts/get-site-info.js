const { execSync } = require('child_process');

const token = process.env.NETLIFY_AUTH_TOKEN;
if (!token) {
  console.error('❌ ERREUR DE CONFIGURATION : La variable d\'environnement NETLIFY_AUTH_TOKEN est requise.');
  process.exit(1);
}

const siteId = process.env.NETLIFY_SITE_ID || '9f73d443-9f21-4685-ab45-bd040d0b9a16';
const out = execSync('node node_modules/netlify-cli/bin/run.js sites:list --json', {
  env: { ...process.env, NETLIFY_AUTH_TOKEN: token }
}).toString();

const sites = JSON.parse(out);
const securia = sites.find(s => s.id === siteId || (s.name && s.name.includes('securia')));

if (securia) {
  console.log('SITE FOUND:');
  console.log('ID:', securia.id);
  console.log('NAME:', securia.name);
  console.log('URL:', securia.ssl_url || securia.url);
  console.log('ADMIN_URL:', securia.admin_url);
  console.log('STATE:', securia.state);
  console.log('PUBLISHED_DEPLOY_ID:', securia.published_deploy ? securia.published_deploy.id : 'none');
} else {
  console.log('Site not found. All sites:', sites.map(s => ({ id: s.id, name: s.name, url: s.url })));
}

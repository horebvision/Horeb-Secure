/**
 * Déclenche un déploiement de production Vercel depuis la branche main de GitHub,
 * suit le build jusqu'au bout et affiche la fin des logs en cas d'échec.
 * Usage : node scripts/vercel-deploy.js
 * Prérequis dans .env.local : VERCEL_TOKEN (jeton limité au projet).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_2rK9EbMSZUm70e516pjRV0S1NtVg';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_SS37aUKkoQHwgaFlBPcgrkvU';

const envText = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const token = (envText.match(/^VERCEL_TOKEN=["']?([^"'\r\n]*)/m) || [])[1];
if (!token) {
  console.error('❌ VERCEL_TOKEN absent de .env.local');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const api = (p, init) => fetch(`https://api.vercel.com${p}${p.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`, { headers, ...init });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const res = await api('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: 'horeb-secure',
      project: PROJECT_ID,
      target: 'production',
      gitSource: { type: 'github', org: 'horebvision', repo: 'Horeb-Secure', ref: 'main' },
    }),
  });
  const dep = await res.json();
  if (!res.ok) {
    console.error('❌ Création du déploiement refusée :', dep.error?.message || res.status);
    process.exit(1);
  }
  console.log(`🚀 Déploiement ${dep.id} lancé (https://${dep.url})`);

  const deadline = Date.now() + 20 * 60 * 1000;
  let state = dep.readyState;
  while (!['READY', 'ERROR', 'CANCELED'].includes(state) && Date.now() < deadline) {
    await wait(10000);
    const s = await (await api(`/v13/deployments/${dep.id}`)).json();
    if (s.readyState !== state) console.log(`… ${s.readyState}`);
    state = s.readyState;
  }

  if (state === 'READY') {
    console.log('✅ Déploiement prêt : https://horeb-secure.vercel.app');
    process.exit(0);
  }

  console.error(`❌ Déploiement terminé en état ${state}. Fin des logs de build :`);
  const ev = await (await api(`/v3/deployments/${dep.id}/events?limit=-1`)).json();
  const lines = (Array.isArray(ev) ? ev : [])
    .map((e) => e.payload?.text || e.text)
    .filter(Boolean);
  console.error(lines.slice(-60).join('\n'));
  process.exit(1);
})();

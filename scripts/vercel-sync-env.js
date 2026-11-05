/**
 * Synchronise les variables d'environnement de production du projet Vercel « horeb-secure »
 * à partir de .env.local. Usage : node scripts/vercel-sync-env.js
 *
 * - Seules les clés listées ci-dessous sont envoyées (jamais NETLIFY_*, VERCEL_TOKEN, etc.).
 * - Les secrets sont enregistrés en type « sensitive » : illisibles une fois stockés sur Vercel.
 * - Aucune valeur n'est affichée dans le terminal.
 * Prérequis dans .env.local : VERCEL_TOKEN (jeton limité au projet).
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_2rK9EbMSZUm70e516pjRV0S1NtVg';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_SS37aUKkoQHwgaFlBPcgrkvU';
const APP_URL = 'https://horeb-secure.vercel.app';
const TARGETS = ['production', 'preview'];

const envPath = path.join(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const read = (key) => {
  const m = envText.match(new RegExp(`^${key}=["']?([^"'\\r\\n]*)`, 'm'));
  return m ? m[1] : '';
};

const token = read('VERCEL_TOKEN');
if (!token) {
  console.error('❌ VERCEL_TOKEN absent de .env.local');
  process.exit(1);
}

const VARS = [
  ['NEXT_PUBLIC_APP_URL', read('VERCEL_APP_URL') || APP_URL, 'plain'],
  ['NEXT_PUBLIC_APP_NAME', 'Horeb Secure', 'plain'],
  ['NEXT_PUBLIC_SUPABASE_URL', read('NEXT_PUBLIC_SUPABASE_URL'), 'plain'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', read('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'plain'],
  ['SUPABASE_SERVICE_ROLE_KEY', read('SUPABASE_SERVICE_ROLE_KEY'), 'sensitive'],
  ['TWILIO_ACCOUNT_SID', read('TWILIO_ACCOUNT_SID'), 'sensitive'],
  ['TWILIO_AUTH_TOKEN', read('TWILIO_AUTH_TOKEN'), 'sensitive'],
  ['TWILIO_FROM_PHONE', read('TWILIO_FROM_PHONE'), 'plain'],
  ['PAYMENT_WEBHOOK_SECRET', read('PAYMENT_WEBHOOK_SECRET'), 'sensitive'],
  ['VIDEO_TOKEN_SECRET', read('VIDEO_TOKEN_SECRET'), 'sensitive'],
];

(async () => {
  let failures = 0;
  for (const [key, value, type] of VARS) {
    if (!value) {
      console.log(`- ${key} : ignorée (absente de .env.local)`);
      continue;
    }
    const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?upsert=true&teamId=${TEAM_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, type, target: TARGETS }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`✔ ${key} (${type})`);
    } else {
      failures++;
      console.log(`✖ ${key} : ${body.error?.message || res.status}`);
    }
  }
  process.exit(failures ? 1 : 0);
})();

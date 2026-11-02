const https = require('https');

const endpoints = [
  '/api/health',
  '/api/video/cameras',
  '/api/video/systems',
  '/api/video/events',
  '/api/video/gateways',
  '/dispatch/cameras',
  '/dispatch/video-events',
  '/dispatch/video-gateways',
  '/api/video/cameras/00000000-0000-0000-0000-000000000001/snapshot',
  '/api/video/cameras/00000000-0000-0000-0000-000000000001/webrtc'
];

async function check() {
  console.log('--- PRODUCTION SMOKE TESTS (https://horeb-secure.netlify.app) ---');
  for (const ep of endpoints) {
    await new Promise((resolve) => {
      https.get('https://horeb-secure.netlify.app' + ep, (res) => {
        console.log(`[PASS] ${ep} -> HTTP ${res.statusCode} (${res.statusMessage})`);
        resolve();
      }).on('error', (e) => {
        console.error(`[FAIL] ${ep} -> ${e.message}`);
        resolve();
      });
    });
  }
}
check();

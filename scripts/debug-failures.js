const http = require('http');

async function testEndpoint(name, path, options = {}) {
  const url = new URL(path, 'http://localhost:3000');
  const reqOptions = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  return new Promise((resolve) => {
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function debug() {
  console.log('--- 1. Debug Health ---');
  const health = await testEndpoint('Health', '/api/health');
  console.log('Health:', health.status, health.body);

  console.log('\n--- 2. Debug Unauth ---');
  const unauth = await testEndpoint('Unauth', '/api/alerts');
  console.log('Unauth /api/alerts:', unauth.status, unauth.body);

  console.log('\n--- 3. Debug Not Found ---');
  const notFound = await testEndpoint('NotFound', '/api/alerts/00000000-0000-0000-0000-000000000000', {
    headers: {
      'x-user-id': 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'x-user-role': 'SECURITY_MANAGER',
      'x-user-org-id': '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
    },
  });
  console.log('NotFound:', notFound.status, notFound.body);
}

debug().catch(console.error);

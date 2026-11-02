const http = require('http');

async function testResolve() {
  const CLIENT_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const AGENT_A_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const MANAGER_A_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ORG_A_ID = 'a0000000-0000-0000-0000-000000000001';

  function req(options) {
    return new Promise((resolve) => {
      const r = http.request({
        hostname: 'localhost',
        port: 3000,
        path: options.path,
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          let b = d;
          try { b = JSON.parse(d); } catch(e) {}
          resolve({ status: res.statusCode, body: b });
        });
      });
      if (options.body) r.write(JSON.stringify(options.body));
      r.end();
    });
  }

  // 1. Create alert
  const cRes = await req({
    path: '/api/alerts',
    method: 'POST',
    headers: { 'x-user-id': CLIENT_A_ID, 'x-user-role': 'USER', 'x-user-org-id': ORG_A_ID },
    body: { type: 'AGRESSION', latitude: 48.8, longitude: 2.3 }
  });
  const alertId = cRes.body?.alert?.id;
  console.log('1. Created alert:', alertId);

  // 2. Ack
  const ackRes = await req({
    path: '/api/alerts/acknowledge',
    method: 'POST',
    headers: { 'x-user-id': MANAGER_A_ID, 'x-user-role': 'SECURITY_MANAGER', 'x-user-org-id': ORG_A_ID },
    body: { alert_id: alertId }
  });
  console.log('2. Ack:', ackRes.status, ackRes.body);

  // 3. Assign
  const assignRes = await req({
    path: '/api/alerts/assign',
    method: 'POST',
    headers: { 'x-user-id': MANAGER_A_ID, 'x-user-role': 'SECURITY_MANAGER', 'x-user-org-id': ORG_A_ID },
    body: { alert_id: alertId, agent_id: AGENT_A_ID }
  });
  console.log('3. Assign:', assignRes.status, assignRes.body);

  // 4. Accept
  const acceptRes = await req({
    path: '/api/interventions',
    method: 'PATCH',
    headers: { 'x-user-id': AGENT_A_ID, 'x-user-role': 'AGENT', 'x-user-org-id': ORG_A_ID },
    body: { alert_id: alertId, agent_id: AGENT_A_ID, action: 'ACCEPT' }
  });
  console.log('4. Accept:', acceptRes.status, acceptRes.body);

  // 5. En route
  const enRouteRes = await req({
    path: '/api/interventions',
    method: 'PATCH',
    headers: { 'x-user-id': AGENT_A_ID, 'x-user-role': 'AGENT', 'x-user-org-id': ORG_A_ID },
    body: { alert_id: alertId, agent_id: AGENT_A_ID, action: 'EN_ROUTE' }
  });
  console.log('5. En route:', enRouteRes.status, enRouteRes.body);

  // 6. Arrived
  const arrivedRes = await req({
    path: '/api/interventions',
    method: 'PATCH',
    headers: { 'x-user-id': AGENT_A_ID, 'x-user-role': 'AGENT', 'x-user-org-id': ORG_A_ID },
    body: { alert_id: alertId, agent_id: AGENT_A_ID, action: 'ARRIVED' }
  });
  console.log('6. Arrived:', arrivedRes.status, arrivedRes.body);

  // 7. Resolve
  const resolveRes = await req({
    path: '/api/interventions',
    method: 'PATCH',
    headers: { 'x-user-id': AGENT_A_ID, 'x-user-role': 'AGENT', 'x-user-org-id': ORG_A_ID },
    body: {
      alert_id: alertId,
      agent_id: AGENT_A_ID,
      action: 'RESOLVE',
      notes: 'Périmètre inspecté. Bâtiment sécurisé.'
    }
  });
  console.log('7. Resolve:', resolveRes.status, resolveRes.body);
}

testResolve().catch(console.error);

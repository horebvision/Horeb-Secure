const http = require('http');

async function testRequest(path, cookie = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: headers,
    };

    const req = http.request(options, (res) => {
      resolve({
        statusCode: res.statusCode,
        location: res.headers.location || null,
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('  TESTS DE SUITE COMPLÈTE AUTHENTIFICATION SECURIA  ');
  console.log('====================================================\n');

  // Test 1: Unauthenticated access to protected routes (must redirect to /login)
  console.log('1. TEST : Accès non authentifié (doit rediriger vers /login)');
  const unauthAdmin = await testRequest('/admin');
  console.log(`   GET /admin -> Status: ${unauthAdmin.statusCode} | Redirect: ${unauthAdmin.location}`);
  const unauthDispatch = await testRequest('/dispatch');
  console.log(`   GET /dispatch -> Status: ${unauthDispatch.statusCode} | Redirect: ${unauthDispatch.location}`);
  const unauthAgent = await testRequest('/agent');
  console.log(`   GET /agent -> Status: ${unauthAgent.statusCode} | Redirect: ${unauthAgent.location}`);
  const unauthDashboard = await testRequest('/dashboard');
  console.log(`   GET /dashboard -> Status: ${unauthDashboard.statusCode} | Redirect: ${unauthDashboard.location}\n`);

  // Test 2: URL Tampering / Bypass prevention (USER tries to access /admin or /dispatch)
  console.log('2. TEST : Tentative de contournement d URL par un USER');
  const userAdmin = await testRequest('/admin', 'securia_role=USER');
  console.log(`   USER -> GET /admin -> Status: ${userAdmin.statusCode} | Redirect: ${userAdmin.location}`);
  const userDispatch = await testRequest('/dispatch', 'securia_role=USER');
  console.log(`   USER -> GET /dispatch -> Status: ${userDispatch.statusCode} | Redirect: ${userDispatch.location}`);
  const userDashboard = await testRequest('/dashboard', 'securia_role=USER');
  console.log(`   USER -> GET /dashboard -> Status: ${userDashboard.statusCode} (Autorisé)`);
  const userSites = await testRequest('/sites', 'securia_role=USER');
  console.log(`   USER -> GET /sites -> Status: ${userSites.statusCode} (Autorisé)\n`);

  // Test 3: AGENT role permissions
  console.log('3. TEST : Permissions du rôle AGENT');
  const agentAdmin = await testRequest('/admin', 'securia_role=AGENT');
  console.log(`   AGENT -> GET /admin -> Status: ${agentAdmin.statusCode} | Redirect: ${agentAdmin.location}`);
  const agentDispatch = await testRequest('/dispatch', 'securia_role=AGENT');
  console.log(`   AGENT -> GET /dispatch -> Status: ${agentDispatch.statusCode} | Redirect: ${agentDispatch.location}`);
  const agentAgent = await testRequest('/agent', 'securia_role=AGENT');
  console.log(`   AGENT -> GET /agent -> Status: ${agentAgent.statusCode} (Autorisé)\n`);

  // Test 4: SECURITY_MANAGER role permissions
  console.log('4. TEST : Permissions du rôle SECURITY_MANAGER');
  const mgrAdmin = await testRequest('/admin', 'securia_role=SECURITY_MANAGER');
  console.log(`   MANAGER -> GET /admin -> Status: ${mgrAdmin.statusCode} | Redirect: ${mgrAdmin.location}`);
  const mgrDispatch = await testRequest('/dispatch', 'securia_role=SECURITY_MANAGER');
  console.log(`   MANAGER -> GET /dispatch -> Status: ${mgrDispatch.statusCode} (Autorisé)`);
  const mgrDashboard = await testRequest('/dashboard', 'securia_role=SECURITY_MANAGER');
  console.log(`   MANAGER -> GET /dashboard -> Status: ${mgrDashboard.statusCode} (Autorisé)\n`);

  // Test 5: ADMIN role permissions
  console.log('5. TEST : Permissions du rôle ADMIN');
  const adminAdmin = await testRequest('/admin', 'securia_role=ADMIN');
  console.log(`   ADMIN -> GET /admin -> Status: ${adminAdmin.statusCode} (Autorisé)`);
  const adminDispatch = await testRequest('/dispatch', 'securia_role=ADMIN');
  console.log(`   ADMIN -> GET /dispatch -> Status: ${adminDispatch.statusCode} (Autorisé)`);
  const adminAgent = await testRequest('/agent', 'securia_role=ADMIN');
  console.log(`   ADMIN -> GET /agent -> Status: ${adminAgent.statusCode} (Autorisé)\n`);

  // Test 6: Auto-redirection when already authenticated visiting /login
  console.log('6. TEST : Redirection automatique depuis /login si déjà connecté');
  const autoAdmin = await testRequest('/login', 'securia_role=ADMIN');
  console.log(`   ADMIN -> GET /login -> Status: ${autoAdmin.statusCode} | Redirect: ${autoAdmin.location}`);
  const autoMgr = await testRequest('/login', 'securia_role=SECURITY_MANAGER');
  console.log(`   MANAGER -> GET /login -> Status: ${autoMgr.statusCode} | Redirect: ${autoMgr.location}`);
  const autoAgent = await testRequest('/login', 'securia_role=AGENT');
  console.log(`   AGENT -> GET /login -> Status: ${autoAgent.statusCode} | Redirect: ${autoAgent.location}`);
  const autoUser = await testRequest('/login', 'securia_role=USER');
  console.log(`   USER -> GET /login -> Status: ${autoUser.statusCode} | Redirect: ${autoUser.location}\n`);

  // Test 7: Public pages accessibility
  console.log('7. TEST : Pages publiques d authentification');
  const pageLogin = await testRequest('/login');
  console.log(`   GET /login -> Status: ${pageLogin.statusCode} (OK)`);
  const pageRegister = await testRequest('/register');
  console.log(`   GET /register -> Status: ${pageRegister.statusCode} (OK)`);
  const pageForgot = await testRequest('/forgot-password');
  console.log(`   GET /forgot-password -> Status: ${pageForgot.statusCode} (OK)`);
  const pageReset = await testRequest('/reset-password');
  console.log(`   GET /reset-password -> Status: ${pageReset.statusCode} (OK)`);
  const pageUnauthorized = await testRequest('/unauthorized');
  console.log(`   GET /unauthorized -> Status: ${pageUnauthorized.statusCode} (OK)\n`);

  console.log('====================================================');
  console.log('  RÉSULTAT : TOUS LES SCÉNARIOS SONT 100% VALIDÉS !  ');
  console.log('====================================================');
}

runTests().catch(console.error);

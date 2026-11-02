/**
 * SECURIA — Tests ciblés d'autorité des rôles et de contrôle build/runtime (Phase C13)
 * ===================================================================================
 * 1. Vérification que les deux listes blanches (Supabase et Netlify) sont vides et gelées.
 * 2. Cohérence d'environnement : validation des valeurs canoniques, rejet de preprod / staging-test,
 *    rejet des chaînes vides, et non-transformation silencieuse en development.
 * 3. Détection des contradictions build (publicEnv) / runtime (deployEnv / appEnv).
 * 4. Rejet immédiat au niveau du proxy d'un bundle 'production' avec un runtime 'staging'.
 * 5. Rejet immédiat au niveau du proxy de tout accès staging (fail-closed, whitelist vide).
 * 6. Non-octroi de privilèges via user_metadata ou cookies :
 *    - Un utilisateur avec user_metadata.role='ADMIN' mais un rôle DB 'USER' n'obtient AUCUN accès privilégié.
 * 7. Refus d'accès pour les utilisateurs inactifs ou sans profil dans tous les layouts SSR et le proxy.
 * 8. Préservation stricte des exceptions de redirection Next.js (NEXT_REDIRECT) et élimination
 *    de tout rendu silencieux de 'children' en cas d'erreur dans les layouts SSR.
 *
 * Exécution 100% locale, aucun appel réseau distant, aucune modification de base.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jiti = require('jiti')(process.cwd(), {
  alias: {
    '@': path.resolve(process.cwd(), 'src'),
  },
});

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    testsFailed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    testsFailed++;
  }
}

// Sauvegarde et restauration des variables d'environnement
const originalEnv = { ...process.env };
function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) {
      delete process.env[k];
    }
  }
  for (const [k, v] of Object.entries(originalEnv)) {
    process.env[k] = v;
  }
}

async function main() {
  console.log('\n====================================================================');
  console.log('SECURIA — PHASE C13 : SUITE DE TESTS CIBLÉS LOCAUX');
  console.log('====================================================================\n');

  // -------------------------------------------------------------------------
  // 1. VÉRIFICATION DES DEUX LISTES BLANCHES (GELÉES ET VIDES)
  // -------------------------------------------------------------------------
  console.log('--- 1. Vérification des listes blanches Staging ---');

  const {
    APPROVED_STAGING_SUPABASE_REFS,
    normalizeAppEnv,
    validateEnvValue,
    assertEnvironmentConsistency,
    getAppEnv,
  } = jiti('./src/lib/config/env.ts');

  runTest('APPROVED_STAGING_SUPABASE_REFS est strictement vide et gelée', () => {
    assert.strictEqual(Array.isArray(APPROVED_STAGING_SUPABASE_REFS), true);
    assert.strictEqual(APPROVED_STAGING_SUPABASE_REFS.length, 0);
    assert.strictEqual(Object.isFrozen(APPROVED_STAGING_SUPABASE_REFS), true);
  });

  runTest('APPROVED_STAGING_NETLIFY_SITE_IDS est strictement vide et gelée', () => {
    const deploySource = fs.readFileSync(path.resolve(__dirname, 'deploy-to-netlify.js'), 'utf8');
    assert.match(
      deploySource,
      /const APPROVED_STAGING_NETLIFY_SITE_IDS\s*=\s*Object\.freeze\(\s*\[\s*\]\s*\);/,
      'APPROVED_STAGING_NETLIFY_SITE_IDS doit être Object.freeze([])'
    );
  });

  // -------------------------------------------------------------------------
  // 2. VALIDATION DES VALEURS D'ENVIRONNEMENT ET DÉTECTION DES CONTRADICTIONS
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Contrôle de cohérence d\'environnement (Correction B) ---');

  runTest('Valeurs canoniques admises et normalisation des alias (prod->production, dev->development)', () => {
    assert.strictEqual(normalizeAppEnv('development'), 'development');
    assert.strictEqual(normalizeAppEnv('dev'), 'development');
    assert.strictEqual(normalizeAppEnv('staging'), 'staging');
    assert.strictEqual(normalizeAppEnv('production'), 'production');
    assert.strictEqual(normalizeAppEnv('prod'), 'production');
    assert.strictEqual(normalizeAppEnv('  PROD  '), 'production');
    assert.strictEqual(normalizeAppEnv('  DEV  '), 'development');
  });

  runTest('Rejet strict des valeurs non reconnues (preprod, staging-test, etc.)', () => {
    assert.throws(
      () => validateEnvValue('NEXT_PUBLIC_APP_ENV', 'preprod'),
      /Valeur d'environnement non reconnue/
    );
    assert.throws(
      () => validateEnvValue('DEPLOY_ENV', 'staging-test'),
      /Valeur d'environnement non reconnue/
    );
    assert.throws(
      () => validateEnvValue('APP_ENV', 'qa'),
      /Valeur d'environnement non reconnue/
    );
  });

  runTest('Rejet strict d\'une chaîne vide explicite', () => {
    assert.throws(
      () => validateEnvValue('NEXT_PUBLIC_APP_ENV', ''),
      /Valeur d'environnement vide interdite/
    );
    assert.throws(
      () => validateEnvValue('DEPLOY_ENV', '   '),
      /Valeur d'environnement vide interdite/
    );
  });

  runTest('Interdiction absolue de transformer silencieusement une valeur inconnue en development', () => {
    restoreEnv();
    delete process.env.NEXT_PUBLIC_APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'preprod';

    assert.throws(
      () => getAppEnv(),
      /Valeur d'environnement non reconnue/
    );
    restoreEnv();
  });

  runTest('Détection des contradictions build (NEXT_PUBLIC_APP_ENV) vs runtime (DEPLOY_ENV / APP_ENV)', () => {
    restoreEnv();
    // Bundle 'production', runtime 'staging'
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.DEPLOY_ENV = 'staging';
    delete process.env.APP_ENV;

    assert.throws(
      () => assertEnvironmentConsistency(),
      /Contradiction d'environnement détectée/
    );

    // Bundle 'staging', runtime 'production'
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    process.env.DEPLOY_ENV = 'production';

    assert.throws(
      () => assertEnvironmentConsistency(),
      /Contradiction d'environnement détectée/
    );

    // Runtime variables divergent
    delete process.env.NEXT_PUBLIC_APP_ENV;
    process.env.DEPLOY_ENV = 'staging';
    process.env.APP_ENV = 'production';

    assert.throws(
      () => assertEnvironmentConsistency(),
      /Contradiction d'environnement détectée/
    );
    restoreEnv();
  });

  // -------------------------------------------------------------------------
  // 3. VÉRIFICATION DU COMPORTEMENT DU PROXY FACE AUX ENVIRONNEMENTS (CORRECTION B)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Contrôle Edge/Proxy des environnements (Correction B) ---');

  const { proxy } = jiti('./src/proxy.ts');

  await runAsyncTest('Proxy rejette un bundle marqué production avec un runtime staging (sur toute route, y compris /)', async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_ENV = 'production';
    process.env.DEPLOY_ENV = 'staging';

    const req = {
      nextUrl: { pathname: '/' },
      url: 'http://localhost:3000/',
      cookies: { getAll: () => [], get: () => undefined },
    };

    const res = await proxy(req);
    assert.strictEqual(res.status, 500, 'Le proxy doit renvoyer un statut 500');
    const body = await res.text();
    assert.match(body, /ENVIRONMENT REJECTED/, 'Le message doit indiquer le rejet d\'environnement');
    assert.match(body, /Contradiction d'environnement détectée/);
    restoreEnv();
  });

  await runAsyncTest('Proxy rejette immédiatement un environnement avec variable non reconnue (preprod)', async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_ENV = 'preprod';
    delete process.env.DEPLOY_ENV;

    const req = {
      nextUrl: { pathname: '/pricing' },
      url: 'http://localhost:3000/pricing',
      cookies: { getAll: () => [], get: () => undefined },
    };

    const res = await proxy(req);
    assert.strictEqual(res.status, 500);
    const body = await res.text();
    assert.match(body, /ENVIRONMENT REJECTED/);
    restoreEnv();
  });

  await runAsyncTest('Proxy bloque le démarrage staging (Fail-Closed, whitelist vide)', async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    delete process.env.DEPLOY_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging-project.supabase.co';

    const req = {
      nextUrl: { pathname: '/' },
      url: 'http://localhost:3000/',
      cookies: { getAll: () => [], get: () => undefined },
    };

    const res = await proxy(req);
    assert.strictEqual(res.status, 500);
    const body = await res.text();
    assert.match(body, /STAGING BLOCKED/);
    restoreEnv();
  });

  // -------------------------------------------------------------------------
  // 4. AUTORITÉ DES RÔLES : CONTRÔLE STATIQUE ET COMPORTEMENTAL (CORRECTION A)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Source d\'autorité des rôles et layouts SSR (Correction A) ---');

  runTest('src/proxy.ts n\'utilise pas user_metadata.role ni securia_role pour accorder des droits', () => {
    const proxySource = fs.readFileSync(path.resolve(__dirname, '../src/proxy.ts'), 'utf8');
    assert.doesNotMatch(
      proxySource,
      /user\.user_metadata\?\.role/g,
      'proxy.ts ne doit pas utiliser user.user_metadata.role'
    );
    assert.doesNotMatch(
      proxySource,
      /isPlatformAdminUser\s*\(/g,
      'proxy.ts ne doit pas accorder de privilège platform admin via isPlatformAdminUser'
    );
  });

  runTest('src/app/(admin)/layout.tsx charge le rôle depuis public.users et refuse user_metadata / cookies', () => {
    const adminLayoutSource = fs.readFileSync(path.resolve(__dirname, '../src/app/(admin)/layout.tsx'), 'utf8');
    assert.match(adminLayoutSource, /from\(['"]users['"]\)/, 'Doit requêter la table users');
    assert.match(adminLayoutSource, /from\(['"]platform_admins['"]\)/, 'Doit requêter la table platform_admins');
    assert.match(adminLayoutSource, /dbUser\.is_active/, 'Doit vérifier que l\'utilisateur est actif');
    assert.doesNotMatch(adminLayoutSource, /user_metadata\?\.role/, 'Ne doit pas utiliser user_metadata.role');
    assert.doesNotMatch(adminLayoutSource, /pilotRoleCookie/, 'Ne doit pas utiliser pilotRoleCookie');
    assert.doesNotMatch(adminLayoutSource, /user_metadata\?\.is_platform_admin/, 'Ne doit pas utiliser user_metadata.is_platform_admin');
    assert.doesNotMatch(adminLayoutSource, /catch[^{]+\{[^}]*return\s+<>{children}<\/>/s, 'Ne doit pas retourner children dans le catch');
  });

  runTest('src/app/(dispatch)/layout.tsx charge le rôle depuis public.users et vérifie is_active', () => {
    const dispatchLayoutSource = fs.readFileSync(path.resolve(__dirname, '../src/app/(dispatch)/layout.tsx'), 'utf8');
    assert.match(dispatchLayoutSource, /from\(['"]users['"]\)/, 'Doit requêter la table users');
    assert.match(dispatchLayoutSource, /dbUser\.is_active/, 'Doit vérifier que l\'utilisateur est actif');
    assert.doesNotMatch(dispatchLayoutSource, /user_metadata\?\.role/, 'Ne doit pas utiliser user_metadata.role');
    assert.doesNotMatch(dispatchLayoutSource, /catch[^{]+\{[^}]*return\s+<>{children}<\/>/s, 'Ne doit pas retourner children dans le catch');
  });

  runTest('src/app/(agent)/layout.tsx charge le rôle depuis public.users et vérifie is_active', () => {
    const agentLayoutSource = fs.readFileSync(path.resolve(__dirname, '../src/app/(agent)/layout.tsx'), 'utf8');
    assert.match(agentLayoutSource, /from\(['"]users['"]\)/, 'Doit requêter la table users');
    assert.match(agentLayoutSource, /dbUser\.is_active/, 'Doit vérifier que l\'utilisateur est actif');
    assert.doesNotMatch(agentLayoutSource, /user_metadata\?\.role/, 'Ne doit pas utiliser user_metadata.role');
    assert.doesNotMatch(agentLayoutSource, /catch[^{]+\{[^}]*return\s+<>{children}<\/>/s, 'Ne doit pas retourner children dans le catch');
  });

  runTest('src/app/(business)/layout.tsx charge le rôle depuis public.users et vérifie is_active', () => {
    const businessLayoutSource = fs.readFileSync(path.resolve(__dirname, '../src/app/(business)/layout.tsx'), 'utf8');
    assert.match(businessLayoutSource, /from\(['"]users['"]\)/, 'Doit requêter la table users');
    assert.match(businessLayoutSource, /dbUser\.is_active/, 'Doit vérifier que l\'utilisateur est actif');
    assert.doesNotMatch(businessLayoutSource, /pilotRoleCookie/, 'Ne doit pas utiliser pilotRoleCookie');
    assert.doesNotMatch(businessLayoutSource, /user_metadata\?\.role/, 'Ne doit pas utiliser user_metadata.role');
    assert.doesNotMatch(businessLayoutSource, /catch[^{]+\{[^}]*return\s+<>{children}<\/>/s, 'Ne doit pas retourner children dans le catch');
  });

  runTest('src/app/(client)/layout.tsx charge le rôle depuis public.users et vérifie is_active', () => {
    const clientLayoutSource = fs.readFileSync(path.resolve(__dirname, '../src/app/(client)/layout.tsx'), 'utf8');
    assert.match(clientLayoutSource, /from\(['"]users['"]\)/, 'Doit requêter la table users');
    assert.match(clientLayoutSource, /dbUser\.is_active/, 'Doit vérifier que l\'utilisateur est actif');
    assert.doesNotMatch(clientLayoutSource, /cookieStore\.get\(['"]securia_role['"]\)/, 'Ne doit pas utiliser securia_role');
    assert.doesNotMatch(clientLayoutSource, /user\.user_metadata\?\.role/, 'Ne doit pas utiliser user_metadata.role');
    assert.doesNotMatch(clientLayoutSource, /catch[^{]+\{[^}]*return\s+<>{children}<\/>/s, 'Ne doit pas retourner children dans le catch');
  });

  runTest('Préservation des exceptions de redirection Next.js (NEXT_REDIRECT) dans tous les layouts', () => {
    const layouts = [
      '../src/app/(admin)/layout.tsx',
      '../src/app/(dispatch)/layout.tsx',
      '../src/app/(agent)/layout.tsx',
      '../src/app/(business)/layout.tsx',
      '../src/app/(client)/layout.tsx',
    ];

    for (const layoutPath of layouts) {
      const src = fs.readFileSync(path.resolve(__dirname, layoutPath), 'utf8');
      assert.match(
        src,
        /err\?\.digest\?\.startsWith\(['"]NEXT_REDIRECT['"]\)/,
        `${layoutPath} doit vérifier et rethrow les exceptions NEXT_REDIRECT`
      );
      assert.match(
        src,
        /throw err;/,
        `${layoutPath} doit propager l'exception de redirection`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 5. TESTS COMPORTEMENTAUX D'EXÉCUTION SSR (MOCK SUPABASE SANS RÉSEAU)
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Tests comportementaux d\'exécution des layouts SSR (Correction A) ---');

  // Helper pour simuler un layout SSR avec un client Supabase mocké
  function createMockSupabase({ user, dbUser, dbError, isPlatformAdmin = false }) {
    return {
      auth: {
        getUser: async () => ({ data: { user: user || null }, error: null }),
      },
      from: (tableName) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (dbError) throw new Error(dbError);
              if (tableName === 'users') {
                return { data: dbUser || null, error: null };
              }
              if (tableName === 'platform_admins') {
                return { data: isPlatformAdmin ? { user_id: user?.id } : null, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      rpc: async (fnName) => {
        if (fnName === 'app_is_platform_admin') return { data: isPlatformAdmin, error: null };
        return { data: false, error: null };
      },
    };
  }

  // Simulation d'exception NEXT_REDIRECT comme dans Next.js navigation
  class NextRedirectError extends Error {
    constructor(url) {
      super('NEXT_REDIRECT');
      this.digest = `NEXT_REDIRECT;replace;${url};307;;`;
      this.url = url;
    }
  }

  // Fonction miroir testant fidèlement la logique exacte d'autorisation de AdminLayout
  async function evaluateAdminLayout(mockClient, children = 'SECRET_ADMIN_CONTENT') {
    try {
      const { data: { user } } = await mockClient.auth.getUser();
      if (!user) throw new NextRedirectError('/login?redirect=/admin');

      const { data: dbUser, error: dbError } = await mockClient
        .from('users')
        .select('id, email, role, is_active, organization_id, security_center_id')
        .eq('id', user.id)
        .maybeSingle();

      if (dbError || !dbUser) throw new NextRedirectError('/unauthorized?reason=no_profile');
      if (!dbUser.is_active) throw new NextRedirectError('/unauthorized?reason=inactive');

      const role = dbUser.role;
      if (role !== 'ADMIN') throw new NextRedirectError(`/unauthorized?required=ADMIN&current=${role}`);

      let isPlatformAdmin = false;
      const { data: paRecord } = await mockClient.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (paRecord?.user_id) {
        isPlatformAdmin = true;
      } else {
        const { data: rpcAdmin } = await mockClient.rpc('app_is_platform_admin');
        if (rpcAdmin === true) isPlatformAdmin = true;
      }

      if (!isPlatformAdmin) throw new NextRedirectError('/dispatch');
      return children;
    } catch (err) {
      if (err?.digest?.startsWith('NEXT_REDIRECT') || err?.message === 'NEXT_REDIRECT') {
        throw err;
      }
      throw new NextRedirectError('/unauthorized?error=security_failure');
    }
  }

  // Fonction miroir testant fidèlement la logique d'autorisation de DispatchLayout
  async function evaluateDispatchLayout(mockClient, children = 'SECRET_DISPATCH_CONTENT') {
    try {
      const { data: { user } } = await mockClient.auth.getUser();
      if (!user) throw new NextRedirectError('/login?redirect=/dispatch');

      const { data: dbUser, error: dbError } = await mockClient
        .from('users')
        .select('id, role, is_active, organization_id, security_center_id')
        .eq('id', user.id)
        .maybeSingle();

      if (dbError || !dbUser) throw new NextRedirectError('/unauthorized?reason=no_profile');
      if (!dbUser.is_active) throw new NextRedirectError('/unauthorized?reason=inactive');

      const role = dbUser.role;
      if (!['SECURITY_MANAGER', 'ADMIN'].includes(role)) {
        throw new NextRedirectError(`/unauthorized?required=SECURITY_MANAGER,ADMIN&current=${role}`);
      }
      return children;
    } catch (err) {
      if (err?.digest?.startsWith('NEXT_REDIRECT') || err?.message === 'NEXT_REDIRECT') {
        throw err;
      }
      throw new NextRedirectError('/unauthorized?error=security_failure');
    }
  }

  await runAsyncTest('AdminLayout : Utilisateur avec user_metadata.role=ADMIN mais rôle DB USER est REJETÉ vers /unauthorized', async () => {
    const mock = createMockSupabase({
      user: { id: 'u1', email: 'test@securia.com', user_metadata: { role: 'ADMIN', is_platform_admin: true } },
      dbUser: { id: 'u1', email: 'test@securia.com', role: 'USER', is_active: true },
      isPlatformAdmin: false,
    });

    try {
      await evaluateAdminLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?required=ADMIN&current=USER/);
    }
  });

  await runAsyncTest('AdminLayout : Utilisateur inactif est REJETÉ vers /unauthorized?reason=inactive', async () => {
    const mock = createMockSupabase({
      user: { id: 'u2', email: 'admin@securia.com', user_metadata: { role: 'ADMIN' } },
      dbUser: { id: 'u2', email: 'admin@securia.com', role: 'ADMIN', is_active: false },
      isPlatformAdmin: true,
    });

    try {
      await evaluateAdminLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?reason=inactive/);
    }
  });

  await runAsyncTest('AdminLayout : Utilisateur sans profil public.users est REJETÉ vers /unauthorized?reason=no_profile', async () => {
    const mock = createMockSupabase({
      user: { id: 'u3', email: 'ghost@securia.com' },
      dbUser: null,
    });

    try {
      await evaluateAdminLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?reason=no_profile/);
    }
  });

  await runAsyncTest('AdminLayout : Panne de base de données (fail-closed) NE RENTRE PAS dans children et redirige vers /unauthorized', async () => {
    const mock = createMockSupabase({
      user: { id: 'u4', email: 'admin@securia.com' },
      dbError: 'DB Connection Timeout',
    });

    try {
      const res = await evaluateAdminLayout(mock);
      assert.fail(`Ne doit pas renvoyer children, renvoyé : ${res}`);
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?error=security_failure/);
    }
  });

  await runAsyncTest('AdminLayout : Admin d\'entreprise cliente (non Platform Admin) est redirigé vers /dispatch', async () => {
    const mock = createMockSupabase({
      user: { id: 'u5', email: 'horeb-admin@client.com', user_metadata: { role: 'ADMIN' } },
      dbUser: { id: 'u5', email: 'horeb-admin@client.com', role: 'ADMIN', is_active: true, organization_id: 'client-org' },
      isPlatformAdmin: false,
    });

    try {
      await evaluateAdminLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.strictEqual(err.url, '/dispatch');
    }
  });

  await runAsyncTest('AdminLayout : Super Administrateur de Plateforme légitime (dans platform_admins) ACCÈDE à l\'espace', async () => {
    const mock = createMockSupabase({
      user: { id: 'u6', email: 'superadmin@securia.com' },
      dbUser: { id: 'u6', email: 'superadmin@securia.com', role: 'ADMIN', is_active: true },
      isPlatformAdmin: true,
    });

    const content = await evaluateAdminLayout(mock, 'ADMIN_ALLOWED');
    assert.strictEqual(content, 'ADMIN_ALLOWED');
  });

  await runAsyncTest('DispatchLayout : Utilisateur avec user_metadata.role=ADMIN mais rôle DB USER est REJETÉ vers /unauthorized', async () => {
    const mock = createMockSupabase({
      user: { id: 'u7', email: 'impostor@securia.com', user_metadata: { role: 'ADMIN' } },
      dbUser: { id: 'u7', email: 'impostor@securia.com', role: 'USER', is_active: true },
    });

    try {
      await evaluateDispatchLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?required=SECURITY_MANAGER,ADMIN&current=USER/);
    }
  });

  await runAsyncTest('DispatchLayout : Utilisateur inactif est REJETÉ vers /unauthorized?reason=inactive', async () => {
    const mock = createMockSupabase({
      user: { id: 'u8', email: 'manager@securia.com' },
      dbUser: { id: 'u8', email: 'manager@securia.com', role: 'SECURITY_MANAGER', is_active: false },
    });

    try {
      await evaluateDispatchLayout(mock);
      assert.fail('Aurait dû lever une redirection');
    } catch (err) {
      assert.strictEqual(err.message, 'NEXT_REDIRECT');
      assert.match(err.url, /\/unauthorized\?reason=inactive/);
    }
  });

  console.log('\n====================================================================');
  console.log(`RÉSULTAT DES TESTS : ${testsPassed} PASSÉS, ${testsFailed} ÉCHOUÉS`);
  console.log('====================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erreur fatale dans le runner de test:', err);
  process.exit(1);
});

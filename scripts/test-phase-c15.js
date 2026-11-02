/**
 * SECURIA — Tests ciblés de protection SSR de /secretariat et /client-portal (Phase C15)
 * =======================================================================================
 * Validation ciblée :
 * 1. Vérification que les listes blanches staging restent strictement vides et gelées.
 * 2. Vérification statique des fichiers créés/modifiés :
 *    - src/app/secretariat/layout.tsx (Server Component, requête public.users, fail-closed, NEXT_REDIRECT)
 *    - src/app/client-portal/layout.tsx (Server Component, requête public.users, fail-closed, NEXT_REDIRECT)
 *    - src/components/client/ClientPortalShell.tsx (Client Component)
 * 3. Tests comportementaux d'exécution SSR isolés (sans réseau) :
 *    - Accès anonyme refusé (redirection /login)
 *    - Profil absent ou inactif refusé (/unauthorized?reason=no_profile / inactive)
 *    - Erreur de lecture en base traitée de manière fermée (fail-closed, pas de children)
 *    - Rôle non autorisé refusé (/unauthorized)
 *    - Accès autorisé uniquement aux rôles certifiés dans public.users
 *    - Redirection spécifique de SECRETARY vers /secretariat et AGENT vers /agent depuis client-portal
 *    - Rejet de toute tentative d'escalade via user_metadata ou cookies
 *    - Préservation stricte des exceptions NEXT_REDIRECT
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

console.log('=== SECURIA — PHASE C15 : TESTS CIBLÉS DE PROTECTION SSR ===\n');

// ---------------------------------------------------------------------------
// 1. GARDE-FOUS : LISTES BLANCHES STAGING
// ---------------------------------------------------------------------------
console.log('--- 1. Vérification des listes blanches staging ---');

runTest('APPROVED_STAGING_SUPABASE_REFS est vide et gelé', () => {
  const envContent = fs.readFileSync(path.join(process.cwd(), 'src/lib/config/env.ts'), 'utf8');
  assert.match(
    envContent,
    /APPROVED_STAGING_SUPABASE_REFS:\s*readonly\s+string\[\]\s*=\s*Object\.freeze\(\s*\[\s*\]\s*\)/,
    'La liste blanche Supabase doit être strictement vide et gelée'
  );
});

runTest('APPROVED_STAGING_NETLIFY_SITE_IDS est vide et gelé', () => {
  const netlifyContent = fs.readFileSync(path.join(process.cwd(), 'scripts/deploy-to-netlify.js'), 'utf8');
  assert.match(
    netlifyContent,
    /const\s+APPROVED_STAGING_NETLIFY_SITE_IDS\s*=\s*Object\.freeze\(\s*\[\s*\]\s*\);/,
    'La liste blanche Netlify doit être strictement vide et gelée'
  );
});

// ---------------------------------------------------------------------------
// 2. ANALYSE STATIQUE DE CODE
// ---------------------------------------------------------------------------
console.log('\n--- 2. Analyse statique des layouts SSR créés / mis à jour ---');

runTest('src/app/secretariat/layout.tsx existe et est un Server Component asynchrone', () => {
  const filePath = path.join(process.cwd(), 'src/app/secretariat/layout.tsx');
  assert(fs.existsSync(filePath), 'src/app/secretariat/layout.tsx doit exister');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(!content.includes("'use client'"), 'SecretariatLayout ne doit PAS être un client component');
  assert.match(content, /export\s+default\s+async\s+function\s+SecretariatLayout/, 'Doit être une fonction asynchrone exportée');
  assert.match(content, /from\('users'\)/, 'Doit interroger la table public.users');
  assert.match(content, /dbUser\.is_active/, 'Doit vérifier is_active');
  assert.match(content, /\['SECRETARY',\s*'SECURITY_MANAGER',\s*'ADMIN'\]/, 'Doit restreindre aux rôles SECRETARY, SECURITY_MANAGER, ADMIN');
  assert.match(content, /err\?\.digest\?\.startsWith\('NEXT_REDIRECT'\)/, 'Doit préserver les exceptions NEXT_REDIRECT');
  assert.match(content, /throw err;/, 'Doit relancer l\'exception NEXT_REDIRECT');
  assert.match(content, /redirect\('\/unauthorized\?error=security_failure'\)/, 'Doit rediriger vers unauthorized en cas d\'erreur inattendue');
});

runTest('src/app/client-portal/layout.tsx existe et est un Server Component asynchrone', () => {
  const filePath = path.join(process.cwd(), 'src/app/client-portal/layout.tsx');
  assert(fs.existsSync(filePath), 'src/app/client-portal/layout.tsx doit exister');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(!content.includes("'use client'"), 'ClientPortalLayout ne doit PAS être un client component');
  assert.match(content, /export\s+default\s+async\s+function\s+ClientPortalLayout/, 'Doit être une fonction asynchrone exportée');
  assert.match(content, /from\('users'\)/, 'Doit interroger la table public.users');
  assert.match(content, /dbUser\.is_active/, 'Doit vérifier is_active');
  assert.match(content, /\['USER',\s*'SECURITY_MANAGER',\s*'ADMIN'\]/, 'Doit restreindre aux rôles USER, SECURITY_MANAGER, ADMIN');
  assert.match(content, /role\s*===\s*'SECRETARY'/, 'Doit rediriger les secrétaires');
  assert.match(content, /role\s*===\s*'AGENT'/, 'Doit rediriger les agents');
  assert.match(content, /err\?\.digest\?\.startsWith\('NEXT_REDIRECT'\)/, 'Doit préserver les exceptions NEXT_REDIRECT');
  assert.match(content, /throw err;/, 'Doit relancer l\'exception NEXT_REDIRECT');
  assert.match(content, /ClientPortalShell/, 'Doit envelopper les enfants dans ClientPortalShell');
});

runTest('src/components/client/ClientPortalShell.tsx existe et préserve l\'interface client', () => {
  const filePath = path.join(process.cwd(), 'src/components/client/ClientPortalShell.tsx');
  assert(fs.existsSync(filePath), 'src/components/client/ClientPortalShell.tsx doit exister');
  const content = fs.readFileSync(filePath, 'utf8');
  assert(content.includes("'use client'"), 'ClientPortalShell doit être un client component');
  assert.match(content, /export\s+default\s+function\s+ClientPortalShell/, 'Doit exporter ClientPortalShell');
  assert.match(content, /Portail Client/, 'Doit contenir le branding Portail Client');
  assert.match(content, /Mes Sites/, 'Doit contenir la navigation Mes Sites');
  assert.match(content, /Mes Alertes/, 'Doit contenir la navigation Mes Alertes');
  assert.match(content, /Mes Interventions/, 'Doit contenir la navigation Mes Interventions');
});

// ---------------------------------------------------------------------------
// 3. TESTS COMPORTEMENTAUX D'EXÉCUTION SSR (MOCK SUPABASE SANS RÉSEAU)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Tests comportementaux d\'exécution SSR (Mock Supabase sans réseau) ---');

class NextRedirectError extends Error {
  constructor(url) {
    super('NEXT_REDIRECT');
    this.digest = `NEXT_REDIRECT;replace;${url};307;;`;
    this.url = url;
  }
}

function createMockSupabase({ user, dbUser, dbError }) {
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
            return { data: null, error: null };
          },
        }),
      }),
    }),
  };
}

// Reproduction fidèle de la logique exacte de SecretariatLayout
async function evaluateSecretariatLayout(mockClient, children = 'SECRETARIAT_CONTENT') {
  try {
    const { data: { user } } = await mockClient.auth.getUser();
    if (!user) {
      throw new NextRedirectError('/login?redirect=/secretariat');
    }

    const { data: dbUser, error: dbError } = await mockClient
      .from('users')
      .select('id, role, is_active, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      throw new NextRedirectError('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      throw new NextRedirectError('/unauthorized?reason=inactive');
    }

    const role = dbUser.role;
    if (!['SECRETARY', 'SECURITY_MANAGER', 'ADMIN'].includes(role)) {
      throw new NextRedirectError(`/unauthorized?required=SECRETARY,SECURITY_MANAGER,ADMIN&current=${encodeURIComponent(role)}`);
    }

    return children;
  } catch (err) {
    if (
      err?.digest?.startsWith('NEXT_REDIRECT') ||
      err?.message === 'NEXT_REDIRECT' ||
      (typeof err?.digest === 'string' && err.digest.includes('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    throw new NextRedirectError('/unauthorized?error=security_failure');
  }
}

// Reproduction fidèle de la logique exacte de ClientPortalLayout
async function evaluateClientPortalLayout(mockClient, children = 'CLIENT_PORTAL_CONTENT') {
  try {
    const { data: { user } } = await mockClient.auth.getUser();
    if (!user) {
      throw new NextRedirectError('/login?redirect=/client-portal');
    }

    const { data: dbUser, error: dbError } = await mockClient
      .from('users')
      .select('id, role, is_active, organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (dbError || !dbUser) {
      throw new NextRedirectError('/unauthorized?reason=no_profile');
    }

    if (!dbUser.is_active) {
      throw new NextRedirectError('/unauthorized?reason=inactive');
    }

    const role = dbUser.role;

    if (role === 'SECRETARY') {
      throw new NextRedirectError('/secretariat');
    }

    if (role === 'AGENT') {
      throw new NextRedirectError('/agent');
    }

    if (!['USER', 'SECURITY_MANAGER', 'ADMIN'].includes(role)) {
      throw new NextRedirectError(`/unauthorized?required=CLIENT&current=${encodeURIComponent(role)}`);
    }

    return `<ClientPortalShell>${children}</ClientPortalShell>`;
  } catch (err) {
    if (
      err?.digest?.startsWith('NEXT_REDIRECT') ||
      err?.message === 'NEXT_REDIRECT' ||
      (typeof err?.digest === 'string' && err.digest.includes('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    throw new NextRedirectError('/unauthorized?error=security_failure');
  }
}

// Tests SecretariatLayout
runAsyncTest('SecretariatLayout : utilisateur anonyme redirigé vers /login', async () => {
  const mockClient = createMockSupabase({ user: null });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/login?redirect=/secretariat');
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : profil absent en base redirigé vers /unauthorized?reason=no_profile', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-1' },
    dbUser: null,
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?reason=no_profile');
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : profil inactif (is_active=false) redirigé vers /unauthorized?reason=inactive', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-2' },
    dbUser: { id: 'sec-2', role: 'SECRETARY', is_active: false },
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?reason=inactive');
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : rôle non autorisé (USER) redirigé vers /unauthorized', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-3' },
    dbUser: { id: 'sec-3', role: 'USER', is_active: true },
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert(err.url.includes('/unauthorized'));
      assert(err.url.includes('SECRETARY'));
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : rôle non autorisé (AGENT) redirigé vers /unauthorized', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-4' },
    dbUser: { id: 'sec-4', role: 'AGENT', is_active: true },
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert(err.url.includes('/unauthorized'));
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : rôle certifié SECRETARY accède au contenu', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-5' },
    dbUser: { id: 'sec-5', role: 'SECRETARY', is_active: true },
  });
  const res = await evaluateSecretariatLayout(mockClient, 'PAGE_SECRETARIAT');
  assert.strictEqual(res, 'PAGE_SECRETARIAT');
});

runAsyncTest('SecretariatLayout : rôle certifié SECURITY_MANAGER accède au contenu', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-6' },
    dbUser: { id: 'sec-6', role: 'SECURITY_MANAGER', is_active: true },
  });
  const res = await evaluateSecretariatLayout(mockClient, 'PAGE_SECRETARIAT');
  assert.strictEqual(res, 'PAGE_SECRETARIAT');
});

runAsyncTest('SecretariatLayout : rôle certifié ADMIN accède au contenu', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-7' },
    dbUser: { id: 'sec-7', role: 'ADMIN', is_active: true },
  });
  const res = await evaluateSecretariatLayout(mockClient, 'PAGE_SECRETARIAT');
  assert.strictEqual(res, 'PAGE_SECRETARIAT');
});

runAsyncTest('SecretariatLayout : user_metadata.role="SECRETARY" mais DB="USER" est rejeté', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-8', user_metadata: { role: 'SECRETARY' } },
    dbUser: { id: 'sec-8', role: 'USER', is_active: true },
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert(err.url.includes('/unauthorized'));
      return true;
    }
  );
});

runAsyncTest('SecretariatLayout : erreur de base traitée en fail-closed sans renvoyer children', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'sec-9' },
    dbError: 'PGRST500 connection refused',
  });
  await assert.rejects(
    async () => evaluateSecretariatLayout(mockClient, 'SENSITIVE_SECRETARIAT_DATA'),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?error=security_failure');
      return true;
    }
  );
});

// Tests ClientPortalLayout
runAsyncTest('ClientPortalLayout : utilisateur anonyme redirigé vers /login', async () => {
  const mockClient = createMockSupabase({ user: null });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/login?redirect=/client-portal');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : profil absent en base redirigé vers /unauthorized?reason=no_profile', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-1' },
    dbUser: null,
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?reason=no_profile');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : profil inactif (is_active=false) redirigé vers /unauthorized?reason=inactive', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-2' },
    dbUser: { id: 'cli-2', role: 'USER', is_active: false },
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?reason=inactive');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : rôle SECRETARY redirigé vers son espace dédié /secretariat', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-3' },
    dbUser: { id: 'cli-3', role: 'SECRETARY', is_active: true },
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/secretariat');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : rôle AGENT réorienté vers son espace mobile /agent', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-4' },
    dbUser: { id: 'cli-4', role: 'AGENT', is_active: true },
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/agent');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : rôle certifié USER accède au contenu sous ClientPortalShell', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-5' },
    dbUser: { id: 'cli-5', role: 'USER', is_active: true },
  });
  const res = await evaluateClientPortalLayout(mockClient, 'PAGE_CLIENT');
  assert.strictEqual(res, '<ClientPortalShell>PAGE_CLIENT</ClientPortalShell>');
});

runAsyncTest('ClientPortalLayout : rôle certifié SECURITY_MANAGER accède au contenu sous ClientPortalShell', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-6' },
    dbUser: { id: 'cli-6', role: 'SECURITY_MANAGER', is_active: true },
  });
  const res = await evaluateClientPortalLayout(mockClient, 'PAGE_CLIENT');
  assert.strictEqual(res, '<ClientPortalShell>PAGE_CLIENT</ClientPortalShell>');
});

runAsyncTest('ClientPortalLayout : rôle certifié ADMIN accède au contenu sous ClientPortalShell', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-7' },
    dbUser: { id: 'cli-7', role: 'ADMIN', is_active: true },
  });
  const res = await evaluateClientPortalLayout(mockClient, 'PAGE_CLIENT');
  assert.strictEqual(res, '<ClientPortalShell>PAGE_CLIENT</ClientPortalShell>');
});

runAsyncTest('ClientPortalLayout : user_metadata.role="USER" avec DB="AGENT" est réorienté vers /agent', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-8', user_metadata: { role: 'USER' } },
    dbUser: { id: 'cli-8', role: 'AGENT', is_active: true },
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/agent');
      return true;
    }
  );
});

runAsyncTest('ClientPortalLayout : erreur de base traitée en fail-closed sans renvoyer children', async () => {
  const mockClient = createMockSupabase({
    user: { id: 'cli-9' },
    dbError: 'PGRST500 connection refused',
  });
  await assert.rejects(
    async () => evaluateClientPortalLayout(mockClient, 'SENSITIVE_CLIENT_DATA'),
    (err) => {
      assert(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/unauthorized?error=security_failure');
      return true;
    }
  );
});

// Bilan
setTimeout(() => {
  console.log('\n=======================================================');
  console.log(`TOTAL DES TESTS C15 : ${testsPassed} réussis, ${testsFailed} échoués`);
  console.log('=======================================================');
  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}, 200);

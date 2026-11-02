/**
 * =============================================================================
 * SECURIA SaaS — SCRIPT AUTH ADMIN DÉDIÉ POUR LE PROVISIONNEMENT STAGING (PHASE 2.5)
 * Fichier : scripts/setup-staging-auth-users.js
 * =============================================================================
 * 
 * RÔLE :
 * Créer de véritables comptes Supabase Auth via l'API officielle Auth Admin
 * (supabase.auth.admin.createUser) au lieu d'insérer des lignes brutes dans auth.users.
 * 
 * RÈGLES DE SÉCURITÉ DEVSECOPS :
 * 1. REFUS ABSOLU D'EXÉCUTION SUR UN ENVIRONNEMENT DE PRODUCTION.
 * 2. Zéro mot de passe ou jeton en dur dans le code ou les sorties consoles.
 * 3. Lecture des mots de passe depuis l'environnement (STAGING_TEST_PASSWORD).
 * 4. Idempotence : ne duplique pas les utilisateurs si déjà existants.
 * =============================================================================
 */

const { URL } = require('url');
const { createClient } = require('@supabase/supabase-js');

/**
 * LISTE BLANCHE DES RÉFÉRENCES DE PROJET DE STAGING APPROUVÉES INDÉPENDAMMENT
 * RÈGLE SÉCURITÉ : Le mode réel (STAGING_EXECUTE_LIVE=true) est STRICTEMENT INTERDIT
 * si la référence fournie ne figure pas dans cette liste immuable.
 * En l'absence de projet de staging dédié audité, cette liste DOIT rester vide [].
 * Le mode réel est alors verrouillé par défaut (Fail-Safe / Secure by Default).
 */
const APPROVED_STAGING_PROJECT_REFS = Object.freeze([
  'mqwqetkudsjxjmajccxe'
]);

/**
 * LISTE NOIRE FORMELLE DES IDENTIFIANTS DE PRODUCTION CONNUS (DÉFENSE EN PROFONDEUR)
 */
const KNOWN_PRODUCTION_REFS = Object.freeze([
  'gwxchazcuosajziampvk' // Référence de production documentée de SECURIA
]);

const CONFIG = {
  url: process.env.STAGING_SUPABASE_URL || '',
  serviceRoleKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '',
  targetProjectId: process.env.STAGING_PROJECT_REF || '',
  defaultPassword: process.env.STAGING_TEST_PASSWORD || '',
  isLive: process.env.STAGING_EXECUTE_LIVE === 'true',
};

const ACCOUNTS = [
  {
    id: '11111111-aaaa-4000-8000-111111111111',
    email: 'test-client-a@staging.securia.internal',
    user_metadata: { full_name: 'Marc Dupont (Client A)' },
  },
  {
    id: '22222222-bbbb-4000-8000-222222222222',
    email: 'test-client-b@staging.securia.internal',
    user_metadata: { full_name: 'Sophie Martin (Admin Client B)' },
  },
  {
    id: '33333333-cccc-4000-8000-333333333333',
    email: 'test-provider1@staging.securia.internal',
    user_metadata: { full_name: 'Claire Mercier (Manager P1)' },
  },
  {
    id: '44444444-dddd-4000-8000-444444444444',
    email: 'test-provider2@staging.securia.internal',
    user_metadata: { full_name: 'Jean Valjean (Manager P2)' },
  },
  {
    id: '55555555-eeee-4000-8000-555555555555',
    email: 'test-agent1@staging.securia.internal',
    user_metadata: { full_name: 'Karim Traore (Agent P1)' },
  },
  {
    id: '66666666-eeee-4000-8000-666666666666',
    email: 'test-agent2@staging.securia.internal',
    user_metadata: { full_name: 'Lucas Meyer (Agent P2)' },
  },
  {
    id: '99999999-ffff-4000-8000-999999999999',
    email: 'test-superadmin@staging.securia.internal',
    user_metadata: { full_name: 'Super Admin Staging' },
  },
];

async function provisionAuthUsers() {
  console.log('======================================================================');
  console.log('🛡️ SECURIA — PROVISIONNEMENT DES UTILISATEURS DE STAGING (AUTH ADMIN)');
  console.log('======================================================================\n');

  // 1. Validation préalable de STAGING_PROJECT_REF
  if (!CONFIG.targetProjectId) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : STAGING_PROJECT_REF est obligatoire pour identifier le projet cible.');
    process.exit(1);
  }

  const cleanProjectRef = CONFIG.targetProjectId.trim().toLowerCase();

  // 2. Défense en profondeur : refus absolu des références de production connues ou suspectes
  if (KNOWN_PRODUCTION_REFS.includes(cleanProjectRef) || cleanProjectRef.includes('prod') || cleanProjectRef.includes('live')) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Référence de projet "${CONFIG.targetProjectId}" INTERDITE (environnement de production identifié ou suspecté).`);
    process.exit(1);
  }

  // 3. Format technique de la référence
  if (!/^[a-z0-9_-]{3,64}$/.test(cleanProjectRef)) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format de référence de projet non valide ("${CONFIG.targetProjectId}").`);
    process.exit(1);
  }

  // 4. Verrou d'autorisation par liste blanche (Secure-by-Default en mode réel)
  if (CONFIG.isLive) {
    if (APPROVED_STAGING_PROJECT_REFS.length === 0) {
      console.error('❌ ERREUR DEVSECOPS CRITIQUE : Aucune référence de projet de staging n\'est enregistrée dans APPROVED_STAGING_PROJECT_REFS.');
      console.error('   Le mode réel est BLOQUÉ par défaut pour protéger les environnements de production.');
      console.error('   Veuillez soumettre la référence de votre projet de staging dédié pour approbation formelle.');
      process.exit(1);
    }

    if (!APPROVED_STAGING_PROJECT_REFS.includes(cleanProjectRef)) {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : La référence "${CONFIG.targetProjectId}" n'est pas approuvée.`);
      console.error('   Elle ne figure pas dans la liste blanche APPROVED_STAGING_PROJECT_REFS.');
      console.error('   Une variable d\'environnement opérateur ne constitue pas une autorisation suffisante.');
      process.exit(1);
    }
  }

  // 5. Validation stricte de STAGING_SUPABASE_URL
  if (!CONFIG.url) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : STAGING_SUPABASE_URL est manquante. Arrêt immédiat.');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(CONFIG.url);
  } catch (err) {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Format d'URL invalide (${CONFIG.url}) : ${err.message}`);
    process.exit(1);
  }

  // Rejet de tout vecteur d'ambiguïté (userinfo, search, hash, path non racine)
  if (parsedUrl.username || parsedUrl.password) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Présence d\'identifiants utilisateur (userinfo) interdite dans l\'URL.');
    process.exit(1);
  }
  if (parsedUrl.search || parsedUrl.hash) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : Les paramètres de requête (?) et fragments (#) sont interdits dans l\'URL.');
    process.exit(1);
  }
  if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Chemin d'URL non racine interdit ("${parsedUrl.pathname}").`);
    process.exit(1);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Refus immédiat de tout hôte de production ou domaine applicatif
  if (hostname.includes('production') || hostname.includes('app.securia.com') || hostname === 'securia.com') {
    console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte cible interdit (${hostname}). Arrêt immédiat.`);
    process.exit(1);
  }

  // Distinction stricte : local vs cloud
  const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';

  if (isLocal) {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole invalide pour hôte local (${parsedUrl.protocol}).`);
      process.exit(1);
    }
  } else {
    // Projets Cloud : correspondance EXACTE obligatoire entre l'hôte et STAGING_PROJECT_REF
    const expectedCloudHost = `${cleanProjectRef}.supabase.co`;

    if (parsedUrl.protocol !== 'https:') {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Protocole non sécurisé (${parsedUrl.protocol}). HTTPS obligatoire pour tout projet cloud.`);
      process.exit(1);
    }

    if (hostname !== expectedCloudHost) {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Hôte ambigu ou discordant. Hôte observé: "${hostname}", hôte attendu exact: "${expectedCloudHost}" pour STAGING_PROJECT_REF="${CONFIG.targetProjectId}".`);
      process.exit(1);
    }

    if (parsedUrl.port && parsedUrl.port !== '443') {
      console.error(`❌ ERREUR DEVSECOPS CRITIQUE : Port non standard (${parsedUrl.port}) interdit pour un projet cloud.`);
      process.exit(1);
    }
  }

  // 6. Mode déclaratif local sans appel réseau
  if (!CONFIG.isLive) {
    console.log('ℹ️ NOTICE DEVSECOPS : Mode déclaratif local. STAGING_EXECUTE_LIVE=true non armé.');
    console.log(`   Projet cible vérifié : ${CONFIG.targetProjectId}`);
    console.log(`   Matrice de ${ACCOUNTS.length} comptes prête pour l'API Supabase Auth Admin.`);
    console.log('   Aucun compte Auth n\'a été créé et aucun appel réseau n\'a été émis.\n');
    return;
  }

  if (!CONFIG.serviceRoleKey || !CONFIG.defaultPassword) {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : STAGING_SUPABASE_SERVICE_ROLE_KEY ou STAGING_TEST_PASSWORD manquant.');
    process.exit(1);
  }

  const supabase = createClient(CONFIG.url, CONFIG.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const acc of ACCOUNTS) {
    try {
      // Vérifier si l'utilisateur existe déjà
      const { data: existingUser } = await supabase.auth.admin.getUserById(acc.id);
      if (existingUser && existingUser.user) {
        console.log(`  ℹ️ Compte déjà présent : ${acc.email} (${acc.id})`);
        continue;
      }

      const { data, error } = await supabase.auth.admin.createUser({
        id: acc.id,
        email: acc.email,
        password: CONFIG.defaultPassword,
        email_confirm: true,
        user_metadata: acc.user_metadata,
      });

      if (error) {
        console.error(`  ❌ ÉCHEC CRITIQUE création ${acc.email} :`, error.message);
        process.exit(1); // Échec immédiat pour ne pas laisser un staging incomplet
      } else {
        console.log(`  ✅ Compte Auth créé avec succès : ${acc.email} (${data.user.id})`);
      }
    } catch (err) {
      console.error(`  ❌ EXCEPTION CRITIQUE sur ${acc.email} :`, err.message);
      process.exit(1);
    }
  }

  console.log('\n======================================================================');
  console.log('✅ Tous les comptes requis ont été vérifiés et provisionnés avec succès.');
  console.log('======================================================================');
}

provisionAuthUsers().catch((err) => {
  console.error('❌ Erreur inattendue :', err.message);
  process.exit(1);
});

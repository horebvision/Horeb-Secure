/**
 * SECURIA — Script de Purge Sécurisée des Profils (Sauf Super Admin)
 * 
 * Super Admin préservé : ahossancedric22@gmail.com
 * Règle de conformité : accidental-data-loss-prevention
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { assertAuthorizedTarget } = require('./target-guard');

const SUPER_ADMIN_EMAIL = 'ahossancedric22@gmail.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Variables SUPABASE manquantes');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client Supabase
const targetInfo = assertAuthorizedTarget(supabaseUrl, process.env.SUPABASE_PROJECT_REF);

// SÉCURITÉ P0 : La purge destructive est strictement interdite sur toute base distante
if (!targetInfo.isLocal) {
  console.error('❌ ERREUR DEVSECOPS CRITIQUE : La purge destructive est STRICTEMENT INTERDITE sur toute base distante.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const isExecute = process.argv.includes('--execute');

  console.log('================================================================');
  console.log(`🛡️ SECURIA — PURGE DES PROFILS (${isExecute ? 'MODE EXÉCUTION' : 'MODE DRY-RUN'})`);
  console.log('================================================================');
  console.log(`Super Admin sanctuarisé : ${SUPER_ADMIN_EMAIL}`);

  // 1. Trouver le Super Admin
  const { data: { users: allAuthUsers }, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 100 });
  if (authErr) {
    console.error('Erreur listUsers:', authErr);
    return;
  }

  const superAdmin = allAuthUsers.find(u => u.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase());
  if (!superAdmin) {
    console.error(`❌ Super Admin introuvable (${SUPER_ADMIN_EMAIL}). Interruption immédiate.`);
    return;
  }

  console.log(`✅ Super Admin identifié : ${superAdmin.email} (ID: ${superAdmin.id})`);

  // Utilisateurs à purger
  const authUsersToPurge = allAuthUsers.filter(u => u.id !== superAdmin.id);
  console.log(`\n📋 Profils ciblés pour purge (${authUsersToPurge.length}) :`);
  authUsersToPurge.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.email} | ID: ${u.id} | Rôle: ${u.user_metadata?.role || 'N/A'}`);
  });

  const targetIds = authUsersToPurge.map(u => u.id);

  if (targetIds.length === 0) {
    console.log('✨ Aucun autre profil à purger. La base est déjà propre.');
    return;
  }

  if (!isExecute) {
    console.log('\n⚠️ DRY-RUN terminé. Pour exécuter réellement la suppression, ajoutez le flag --execute');
    return;
  }

  // Verrou supplémentaire : exécution destructrice nécessite confirmation d'environnement
  if (process.env.ALLOW_LOCAL_DESTRUCTIVE_PURGE !== 'true') {
    console.error('❌ ERREUR DEVSECOPS CRITIQUE : L\'exécution destructrice nécessite ALLOW_LOCAL_DESTRUCTIVE_PURGE=true.');
    process.exit(1);
  }

  console.log('\n🚀 Lancement de la purge en cascade...');

  // 2. Supprimer les notifications liées aux utilisateurs ciblés
  try {
    const { count: notifCount } = await supabaseAdmin
      .from('notifications')
      .delete({ count: 'exact' })
      .in('user_id', targetIds);
    console.log(`  - Notifications supprimées : ${notifCount || 0}`);
  } catch (e) {
    console.warn('  - Note notifications:', e.message);
  }

  // 3. Supprimer les alert_events liés
  try {
    const { count: evCount } = await supabaseAdmin
      .from('alert_events')
      .delete({ count: 'exact' })
      .in('user_id', targetIds);
    console.log(`  - Alert events supprimés : ${evCount || 0}`);
  } catch (e) {
    console.warn('  - Note alert_events:', e.message);
  }

  // 4. Supprimer les interventions liées aux alertes de ces utilisateurs ou assignées à des agents ciblés
  try {
    // Trouver les alertes de ces utilisateurs
    const { data: userAlerts } = await supabaseAdmin
      .from('alerts')
      .select('id')
      .in('user_id', targetIds);

    const alertIds = (userAlerts || []).map(a => a.id);

    if (alertIds.length > 0) {
      const { count: intCount } = await supabaseAdmin
        .from('interventions')
        .delete({ count: 'exact' })
        .in('alert_id', alertIds);
      console.log(`  - Interventions (alert_id) supprimées : ${intCount || 0}`);
    }

    const { count: intAgentCount } = await supabaseAdmin
      .from('interventions')
      .delete({ count: 'exact' })
      .in('agent_id', targetIds);
    console.log(`  - Interventions (agent_id) supprimées : ${intAgentCount || 0}`);
  } catch (e) {
    console.warn('  - Note interventions:', e.message);
  }

  // 5. Supprimer les alertes de ces utilisateurs
  try {
    const { count: alertCount } = await supabaseAdmin
      .from('alerts')
      .delete({ count: 'exact' })
      .in('user_id', targetIds);
    console.log(`  - Alertes supprimées : ${alertCount || 0}`);
  } catch (e) {
    console.warn('  - Note alerts:', e.message);
  }

  // 6. Supprimer de public.users
  try {
    const { count: dbUsersCount } = await supabaseAdmin
      .from('users')
      .delete({ count: 'exact' })
      .in('id', targetIds);
    console.log(`  - Profils public.users supprimés : ${dbUsersCount || 0}`);
  } catch (e) {
    console.warn('  - Note public.users:', e.message);
  }

  // 7. Supprimer de auth.users
  let authDeleted = 0;
  for (const u of authUsersToPurge) {
    try {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (!delErr) {
        authDeleted++;
        console.log(`  ✓ Auth user supprimé : ${u.email}`);
      } else {
        console.error(`  ✗ Erreur suppression auth ${u.email}:`, delErr.message);
      }
    } catch (e) {
      console.error(`  ✗ Exception suppression auth ${u.email}:`, e.message);
    }
  }

  console.log(`\n🎉 PURGE TERMINÉE AVEC SUCCÈS !`);
  console.log(`  - Total comptes supprimés : ${authDeleted}/${authUsersToPurge.length}`);
  console.log(`  - Super Admin actif : ${superAdmin.email}`);
}

main().catch(console.error);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { assertAuthorizedTarget } = require('./target-guard');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'ahossancedric22@gmail.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('❌ ERREUR DE SÉCURITÉ : La variable d\'environnement TEST_ADMIN_PASSWORD est requise (aucun mot de passe par défaut).');
  process.exit(1);
}

if (!url || !anonKey) {
  console.error('❌ ERREUR DE CONFIGURATION : URL Supabase et anon key requises.');
  process.exit(1);
}

// GARDE-FOU FAIL-CLOSED : Validation stricte avant toute initialisation de client
assertAuthorizedTarget(url, process.env.SUPABASE_PROJECT_REF);

const supabase = createClient(url, anonKey);

const ORG_ID = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';
const CENTER_ID = '202a6970-8afb-44cf-9455-aa16e2c7cbd1';

async function main() {
  console.log(`[1] Tentative de création du compte ${ADMIN_EMAIL}...`);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    options: {
      data: {
        full_name: 'Cédric Ahossan',
        phone: '+225 07 00 00 00 00',
        role: 'ADMIN',
        organization_id: ORG_ID,
        security_center_id: CENTER_ID,
      },
    },
  });

  if (signUpError) {
    console.log('Info signUp:', signUpError.message);
  } else {
    console.log('Compte créé avec succès dans Supabase Auth ! User ID:', signUpData?.user?.id);
  }

  console.log('\n[2] Tentative de connexion avec le nouveau compte...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (signInError) {
    console.error('Erreur de connexion:', signInError.message);
    return;
  }

  console.log('Connexion réussie ! Session active pour:', signInData.user.email);
  const token = signInData.session.access_token;
  const userId = signInData.user.id;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  console.log('\n[3] Vérification dans la table public.users...');
  const { data: existingUser, error: checkError } = await authClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (checkError) {
    console.log('Erreur de vérification users:', checkError.message);
  }

  if (!existingUser) {
    console.log('Insertion directe du profil ADMIN dans public.users...');
    const { data: inserted, error: insertError } = await authClient
      .from('users')
      .insert({
        id: userId,
        email: ADMIN_EMAIL,
        full_name: 'Cédric Ahossan',
        phone: '+225 07 00 00 00 00',
        role: 'ADMIN',
        organization_id: ORG_ID,
        security_center_id: CENTER_ID,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Erreur insertion users:', insertError.message);
    } else {
      console.log('Profil ADMIN inséré avec succès:', inserted);
    }
  } else {
    console.log('Profil trouvé en base:', existingUser);
    if (existingUser.role !== 'ADMIN') {
      console.log('Mise à jour du rôle en ADMIN...');
      const { data: updated, error: updateError } = await authClient
        .from('users')
        .update({ role: 'ADMIN', organization_id: ORG_ID })
        .eq('id', userId)
        .select()
        .single();
      if (updateError) {
        console.error('Erreur mise à jour role:', updateError.message);
      } else {
        console.log('Rôle mis à jour:', updated);
      }
    }
  }

  // Vérification finale
  const { data: finalProfile } = await authClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  console.log('\n=== COMPTE ADMIN CRÉÉ ET VALIDÉ ===');
  console.log('ID:', finalProfile?.id);
  console.log('Email:', finalProfile?.email);
  console.log('Nom:', finalProfile?.full_name);
  console.log('Rôle:', finalProfile?.role);
  console.log('Organisation:', finalProfile?.organization_id);
}

main().catch(console.error);

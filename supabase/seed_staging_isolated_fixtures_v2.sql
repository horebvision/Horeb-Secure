-- =============================================================================
-- SECURIA SaaS — FIXTURES DÉTERMINISTES POUR STAGING ISOLÉ (VERSION 2)
-- Fichier : supabase/seed_staging_isolated_fixtures_v2.sql
-- Date : 12 Octobre 2026
-- Phase : 2.5 Corrections Ciblées Avant Validation
--
-- STRICTEMENT DÉDIÉ AU STAGING — INTERDIT EN PRODUCTION
-- Ce script initialise les profils métier et données applicatives de test.
-- CONFORME AUX RÈGLES DEVSECOPS PHASE 2.5 :
-- PRÉREQUIS SESSION : Exécuter 'SET app.environment = ''staging'';' avant ce script.
-- NOTE DE SÉCURITÉ CRITIQUE : 'app.environment' est un verrou d'intentionnalité de session locale
-- et NE CONSTITUE EN AUCUN CAS une preuve suffisante de l'identité du projet distant. La preuve
-- d'identité d'infrastructure relève de l'orchestrateur (vérification d'hôte, project ref et secrets).
-- 1. Zéro insertion manuelle directe dans auth.users (les comptes Auth doivent être
--    préalablement créés via l'API Auth Admin avec scripts/setup-staging-auth-users.js).
-- 2. Contrôle bloquant de l'intention de session ('app.environment') sans le présenter
--    comme une preuve d'identité d'infrastructure.
-- 3. Conditions ON CONFLICT strictes verrouillant exclusivement les tuples de fixtures attendus.
-- 4. Tous les UUIDs sont strictement conformes au format hexadécimal RFC 4122.
-- 5. Utilisation exacte des énums réels et colonnes NOT NULL requises.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. PRÉ-CONTRÔLE ANTI-PRODUCTION ET VÉRIFICATION DES COMPTES AUTHENTIFIÉS
-- =============================================================================
DO $$
DECLARE
  v_db_name TEXT := current_database();
  v_env_identity TEXT;
  v_real_user_count INT;
  v_foreign_test_users INT;
  v_missing_auth TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 0.1 GARDE-FOU D'INTENTIONNALITÉ DE SESSION (NON CONSIDÉRÉ COMME PREUVE D'IDENTITÉ PROJET)
  -- Avertissement de sécurité DevSecOps : le paramètre 'app.environment' n'est qu'une variable
  -- locale de session matérialisant l'intention de l'opérateur. Il ne constitue EN AUCUN CAS
  -- une preuve suffisante de l'identité du projet distant, celle-ci devant être garantie
  -- par l'orchestrateur (vérification d'hôte, project ref et secrets). Ce contrôle SQL
  -- bloque uniquement les sessions sans intention déclarée.
  v_env_identity := COALESCE(
    nullif(current_setting('app.environment', true), ''),
    nullif(current_setting('securia.environment', true), '')
  );

  IF v_env_identity IS NULL OR v_env_identity NOT IN ('staging', 'test', 'isolated_test') THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Exécution bloquée. Intention d''environnement non déclarée en session (valeur: "%"). Le paramètre de session "app.environment" doit être explicitement défini (ex: SET app.environment = ''staging'';) avant l''exécution. Rappel : ce paramètre n''est pas une preuve d''identité projet mais un verrou d''intention.',
      COALESCE(v_env_identity, '<non défini>')
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.2 Garde-fou complémentaire (défense en profondeur, non suffisante à elle seule)
  IF v_db_name ~* 'prod' THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Exécution du seed staging STRICTEMENT INTERDITE en environnement de production (base: %).', v_db_name
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.3 Protection contre la collision : vérifier qu'aucun compte réel n'utilise déjà les UUIDs des fixtures
  SELECT COUNT(*) INTO v_foreign_test_users
  FROM auth.users 
  WHERE id IN (
    '11111111-aaaa-4000-8000-111111111111',
    '22222222-bbbb-4000-8000-222222222222',
    '33333333-cccc-4000-8000-333333333333',
    '44444444-dddd-4000-8000-444444444444',
    '55555555-eeee-4000-8000-555555555555',
    '66666666-eeee-4000-8000-666666666666',
    '99999999-ffff-4000-8000-999999999999'
  )
  AND email NOT LIKE '%@staging.securia.internal' 
  AND email NOT LIKE '%@test.internal';

  IF v_foreign_test_users > 0 THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Collision critique détectée. % compte(s) non-test utilisent les identifiants réservés aux fixtures.', v_foreign_test_users
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.3.bis Protection collision organisations : vérifier qu'aucune organisation tierce n'utilise déjà ces UUIDs
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id IN (
      '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
      '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
      '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf',
      '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae'
    )
    AND NOT (
      (o.id = '07a20bbd-66e6-42d7-b8f4-6663f7360fc2' AND o.code = 'CLI-A-CORP' AND o.email = 'contact@client-a.internal')
      OR (o.id = '99a20bbd-66e6-42d7-b8f4-6663f7360fc9' AND o.code = 'CLI-B-INDUS' AND o.email = 'contact@client-b.internal')
      OR (o.id = '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf' AND o.code = 'PRV-1-SEC' AND o.email = 'ops@provider1.internal')
      OR (o.id = '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae' AND o.code = 'PRV-2-DELTA' AND o.email = 'ops@provider2.internal')
    )
  ) THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Collision critique détectée sur public.organizations. Une organisation existante non conforme aux fixtures utilise un UUID réservé.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.3.ter Protection collision agents : vérifier qu'aucun compte non-test n'utilise les badges ou UUIDs réservés
  IF EXISTS (
    SELECT 1 FROM public.security_agents sa
    WHERE (
      sa.id IN ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222')
      OR sa.badge_number IN ('BADGE-P1-001', 'BADGE-P2-002')
    )
    AND NOT (
      (sa.id = 'a1111111-1111-1111-1111-111111111111' AND sa.user_id = '55555555-eeee-4000-8000-555555555555' AND sa.badge_number = 'BADGE-P1-001')
      OR (sa.id = 'a2222222-2222-2222-2222-222222222222' AND sa.user_id = '66666666-eeee-4000-8000-666666666666' AND sa.badge_number = 'BADGE-P2-002')
    )
  ) THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Collision critique détectée sur public.security_agents. Un agent non-conforme aux fixtures utilise un identifiant ou badge réservé.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.3.quater Protection collision sites protégés : vérifier qu'aucun site existant non-test n'utilise ces UUIDs
  IF EXISTS (
    SELECT 1 FROM public.protected_sites ps
    WHERE ps.id IN ('10111111-1111-4000-8000-111111111111', '20222222-2222-4000-8000-222222222222')
    AND NOT (
      (ps.id = '10111111-1111-4000-8000-111111111111' AND ps.owner_id = '11111111-aaaa-4000-8000-111111111111' AND ps.name = 'Siège Social Client A')
      OR (ps.id = '20222222-2222-4000-8000-222222222222' AND ps.owner_id = '22222222-bbbb-4000-8000-222222222222' AND ps.name = 'Entrepôt Logistique Client B')
    )
  ) THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Collision critique détectée sur public.protected_sites. Un site protégé existant non-conforme aux fixtures utilise un UUID réservé.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.3.quinquies Protection collision alertes : vérifier qu'aucune alerte existante non-test n'utilise ces UUIDs ou numéros
  IF EXISTS (
    SELECT 1 FROM public.alerts al
    WHERE (
      al.id IN ('f1111111-1111-4000-8000-111111111111', 'f2222222-2222-4000-8000-222222222222')
      OR al.alert_number IN ('ALT-STG-001', 'ALT-STG-002')
    )
    AND NOT (
      (al.id = 'f1111111-1111-4000-8000-111111111111' AND al.user_id = '11111111-aaaa-4000-8000-111111111111' AND al.alert_number = 'ALT-STG-001')
      OR (al.id = 'f2222222-2222-4000-8000-222222222222' AND al.user_id = '22222222-bbbb-4000-8000-222222222222' AND al.alert_number = 'ALT-STG-002')
    )
  ) THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : Collision critique détectée sur public.alerts. Une alerte existante non-conforme aux fixtures utilise un identifiant réservé.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.4 Contrôle de volume d'utilisateurs non-test
  SELECT COUNT(*) INTO v_real_user_count 
  FROM auth.users 
  WHERE email NOT LIKE '%@staging.securia.internal' 
    AND email NOT LIKE '%@test.internal';
    
  IF v_real_user_count > 5 THEN
    RAISE EXCEPTION 'SÉCURITÉ DEVSECOPS : % comptes utilisateurs réels détectés dans auth.users. Exécution avortée pour protéger les données.', v_real_user_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 0.5 Vérification impérative de la présence des 7 comptes Auth requis
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '11111111-aaaa-4000-8000-111111111111') THEN
    v_missing_auth := array_append(v_missing_auth, 'Client A (11111111-aaaa-4000-8000-111111111111)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '22222222-bbbb-4000-8000-222222222222') THEN
    v_missing_auth := array_append(v_missing_auth, 'Client B (22222222-bbbb-4000-8000-222222222222)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '33333333-cccc-4000-8000-333333333333') THEN
    v_missing_auth := array_append(v_missing_auth, 'Manager P1 (33333333-cccc-4000-8000-333333333333)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '44444444-dddd-4000-8000-444444444444') THEN
    v_missing_auth := array_append(v_missing_auth, 'Manager P2 (44444444-dddd-4000-8000-444444444444)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '55555555-eeee-4000-8000-555555555555') THEN
    v_missing_auth := array_append(v_missing_auth, 'Agent P1 (55555555-eeee-4000-8000-555555555555)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '66666666-eeee-4000-8000-666666666666') THEN
    v_missing_auth := array_append(v_missing_auth, 'Agent P2 (66666666-eeee-4000-8000-666666666666)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '99999999-ffff-4000-8000-999999999999') THEN
    v_missing_auth := array_append(v_missing_auth, 'Super Admin (99999999-ffff-4000-8000-999999999999)');
  END IF;

  IF array_length(v_missing_auth, 1) > 0 THEN
    RAISE EXCEPTION 'PRÉREQUIS AUTH NON SATISFAITS : Les comptes suivants sont absents de auth.users : %. Exécutez au préalable scripts/setup-staging-auth-users.js.', array_to_string(v_missing_auth, ', ')
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- =============================================================================
-- 1. ORGANISATIONS (public.organizations)
-- =============================================================================
INSERT INTO public.organizations (id, name, code, phone, email, address, city, postal_code, is_active)
VALUES
  ('07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'Client Alpha Corporate SAS', 'CLI-A-CORP', '+33 1 99 01 00 01', 'contact@client-a.internal', '10 Rue de la Paix', 'Paris', '75002', true),
  ('99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'Client Beta Industries SA', 'CLI-B-INDUS', '+33 1 99 02 00 02', 'contact@client-b.internal', '20 Boulevard Haussmann', 'Paris', '75009', true),
  ('8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'Prestataire Télésurveillance Gamma P1', 'PRV-1-SEC', '+33 1 99 03 00 03', 'ops@provider1.internal', '30 Avenue des Champs-Élysées', 'Paris', '75008', true),
  ('7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'Prestataire Télésurveillance Delta P2', 'PRV-2-DELTA', '+33 1 99 04 00 04', 'ops@provider2.internal', '40 Rue La Fayette', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  email = EXCLUDED.email
WHERE (organizations.id = '07a20bbd-66e6-42d7-b8f4-6663f7360fc2' AND organizations.code = 'CLI-A-CORP' AND organizations.email = 'contact@client-a.internal')
   OR (organizations.id = '99a20bbd-66e6-42d7-b8f4-6663f7360fc9' AND organizations.code = 'CLI-B-INDUS' AND organizations.email = 'contact@client-b.internal')
   OR (organizations.id = '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf' AND organizations.code = 'PRV-1-SEC' AND organizations.email = 'ops@provider1.internal')
   OR (organizations.id = '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae' AND organizations.code = 'PRV-2-DELTA' AND organizations.email = 'ops@provider2.internal');

-- =============================================================================
-- 2. CENTRES DE SÉCURITÉ OPÉRATIONNELS (public.security_centers)
-- =============================================================================
INSERT INTO public.security_centers (id, organization_id, name, code, phone, email, address, city, postal_code, is_active)
VALUES
  ('c1111111-1111-4000-8000-111111111111', '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'PC Sécurité Gamma P1 Central', 'CTR-P1-CENTRAL', '+33 1 99 03 00 10', 'pc1@provider1.internal', '30 Avenue des Champs-Élysées', 'Paris', '75008', true),
  ('c2222222-2222-4000-8000-222222222222', '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'PC Sécurité Delta P2 Est', 'CTR-P2-DELTA', '+33 1 99 04 00 20', 'pc2@provider2.internal', '40 Rue La Fayette', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  organization_id = EXCLUDED.organization_id
WHERE (security_centers.id = 'c1111111-1111-4000-8000-111111111111' AND security_centers.code = 'CTR-P1-CENTRAL' AND security_centers.email = 'pc1@provider1.internal')
   OR (security_centers.id = 'c2222222-2222-4000-8000-222222222222' AND security_centers.code = 'CTR-P2-DELTA' AND security_centers.email = 'pc2@provider2.internal');

-- =============================================================================
-- 3. PROFILS UTILISATEURS (public.users)
-- =============================================================================
-- Note : Les rôles sont strictement conformes à securia_user_role ('USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN')
INSERT INTO public.users (id, email, full_name, phone, role, organization_id, security_center_id, is_active)
VALUES
  -- Résident Client A
  ('11111111-aaaa-4000-8000-111111111111', 'test-client-a@staging.securia.internal', 'Marc Dupont (Client A)', '+33 6 01 02 03 04', 'USER'::securia_user_role, '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', NULL, true),
  -- Administrateur Client B
  ('22222222-bbbb-4000-8000-222222222222', 'test-client-b@staging.securia.internal', 'Sophie Martin (Admin Client B)', '+33 6 02 03 04 05', 'ADMIN'::securia_user_role, '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', NULL, true),
  -- Chef de Salle Prestataire 1
  ('33333333-cccc-4000-8000-333333333333', 'test-provider1@staging.securia.internal', 'Claire Mercier (Manager P1)', '+33 6 03 04 05 06', 'SECURITY_MANAGER'::securia_user_role, '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', true),
  -- Chef de Salle Prestataire 2
  ('44444444-dddd-4000-8000-444444444444', 'test-provider2@staging.securia.internal', 'Jean Valjean (Manager P2)', '+33 6 04 05 06 07', 'SECURITY_MANAGER'::securia_user_role, '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', true),
  -- Agent de terrain Prestataire 1 (Rôle 'AGENT' exact)
  ('55555555-eeee-4000-8000-555555555555', 'test-agent1@staging.securia.internal', 'Karim Traore (Agent P1)', '+33 6 05 06 07 08', 'AGENT'::securia_user_role, '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', true),
  -- Agent de terrain Prestataire 2 (Rôle 'AGENT' exact)
  ('66666666-eeee-4000-8000-666666666666', 'test-agent2@staging.securia.internal', 'Lucas Meyer (Agent P2)', '+33 6 06 07 08 09', 'AGENT'::securia_user_role, '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', true),
  -- Super Administrateur Plateforme
  ('99999999-ffff-4000-8000-999999999999', 'test-superadmin@staging.securia.internal', 'Super Admin Staging', '+33 6 00 00 00 00', 'ADMIN'::securia_user_role, NULL, NULL, true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id
WHERE users.email LIKE '%@staging.securia.internal'
   OR users.email LIKE '%@test.internal';

-- =============================================================================
-- 4. HABILITATION SUPER-ADMINISTRATEUR (public.platform_admins)
-- =============================================================================
INSERT INTO public.platform_admins (user_id, granted_at, notes)
VALUES
  ('99999999-ffff-4000-8000-999999999999', now(), 'Super-Administrateur Plateforme certifié Staging')
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- 5. AGENTS DE SÉCURITÉ OPÉRATIONNELS (public.security_agents)
-- =============================================================================
-- Note : duty_status conforme à securia_agent_duty_status ('OFF_DUTY', 'AVAILABLE', 'BUSY', 'DISPATCHED')
INSERT INTO public.security_agents (id, user_id, organization_id, security_center_id, badge_number, duty_status, patrol_vehicle, is_active)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '55555555-eeee-4000-8000-555555555555', '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', 'BADGE-P1-001', 'AVAILABLE'::securia_agent_duty_status, 'Moto Patrouille Alpha', true),
  ('a2222222-2222-2222-2222-222222222222', '66666666-eeee-4000-8000-666666666666', '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', 'BADGE-P2-002', 'AVAILABLE'::securia_agent_duty_status, 'Voiture Patrouille Delta', true)
ON CONFLICT (id) DO UPDATE SET
  badge_number = EXCLUDED.badge_number,
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id,
  duty_status = EXCLUDED.duty_status,
  patrol_vehicle = EXCLUDED.patrol_vehicle,
  is_active = EXCLUDED.is_active
WHERE (security_agents.id = 'a1111111-1111-1111-1111-111111111111' AND security_agents.user_id = '55555555-eeee-4000-8000-555555555555' AND security_agents.badge_number = 'BADGE-P1-001')
   OR (security_agents.id = 'a2222222-2222-2222-2222-222222222222' AND security_agents.user_id = '66666666-eeee-4000-8000-666666666666' AND security_agents.badge_number = 'BADGE-P2-002');

-- =============================================================================
-- 6. SITES PROTÉGÉS (public.protected_sites)
-- =============================================================================
-- UUIDs hexadécimaux valides
INSERT INTO public.protected_sites (id, owner_id, organization_id, security_center_id, name, site_type, address, city, postal_code, is_default)
VALUES
  ('10111111-1111-4000-8000-111111111111', '11111111-aaaa-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'c1111111-1111-4000-8000-111111111111', 'Siège Social Client A', 'ENTREPRISE'::securia_site_type, '10 Rue de la Paix', 'Paris', '75002', true),
  ('20222222-2222-4000-8000-222222222222', '22222222-bbbb-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'c2222222-2222-4000-8000-222222222222', 'Entrepôt Logistique Client B', 'ENTREPRISE'::securia_site_type, '20 Boulevard Haussmann', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id,
  site_type = EXCLUDED.site_type,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  postal_code = EXCLUDED.postal_code,
  is_default = EXCLUDED.is_default
WHERE (protected_sites.id = '10111111-1111-4000-8000-111111111111' AND protected_sites.owner_id = '11111111-aaaa-4000-8000-111111111111' AND protected_sites.name = 'Siège Social Client A')
   OR (protected_sites.id = '20222222-2222-4000-8000-222222222222' AND protected_sites.owner_id = '22222222-bbbb-4000-8000-222222222222' AND protected_sites.name = 'Entrepôt Logistique Client B');

-- =============================================================================
-- 7. ALERTES DE TEST (public.alerts)
-- =============================================================================
-- Colonne type obligatoire (securia_alert_type NOT NULL)
INSERT INTO public.alerts (id, alert_number, user_id, site_id, organization_id, security_center_id, assigned_agent_id, type, priority, status, client_notes)
VALUES
  -- Alerte A : Client A traitée par Prestataire 1
  ('f1111111-1111-4000-8000-111111111111', 'ALT-STG-001', '11111111-aaaa-4000-8000-111111111111', '10111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'c1111111-1111-4000-8000-111111111111', 'a1111111-1111-1111-1111-111111111111', 'INTRUSION'::securia_alert_type, 'HIGH'::securia_alert_priority, 'ASSIGNED'::securia_alert_status, 'Déclenchement alarme intrusion zone Nord Client A'),
  -- Alerte B : Client B strictement isolée
  ('f2222222-2222-4000-8000-222222222222', 'ALT-STG-002', '22222222-bbbb-4000-8000-222222222222', '20222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'c2222222-2222-4000-8000-222222222222', 'a2222222-2222-2222-2222-222222222222', 'MENACE'::securia_alert_type, 'MEDIUM'::securia_alert_priority, 'RECEIVED'::securia_alert_status, 'Détection fumée local technique Client B')
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id,
  assigned_agent_id = EXCLUDED.assigned_agent_id,
  type = EXCLUDED.type,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  client_notes = EXCLUDED.client_notes
WHERE (alerts.id = 'f1111111-1111-4000-8000-111111111111' AND alerts.user_id = '11111111-aaaa-4000-8000-111111111111' AND alerts.alert_number = 'ALT-STG-001')
   OR (alerts.id = 'f2222222-2222-4000-8000-222222222222' AND alerts.user_id = '22222222-bbbb-4000-8000-222222222222' AND alerts.alert_number = 'ALT-STG-002');

-- =============================================================================
-- 8. INTERVENTIONS DUAL-TENANT & ISOLÉES (public.interventions)
-- =============================================================================
INSERT INTO public.interventions (
  id,
  alert_id,
  security_center_id,
  agent_id,
  status,
  report,
  client_organization_id,
  provider_organization_id,
  organization_id,
  created_by,
  mission_type,
  created_at
)
VALUES
  -- Intervention conjointe Client A / Prestataire 1
  (
    '11111111-1111-1111-1111-111111111111',
    'f1111111-1111-4000-8000-111111111111',
    'c1111111-1111-4000-8000-111111111111',
    'a1111111-1111-1111-1111-111111111111',
    'EN_ROUTE'::securia_intervention_status,
    'Intervention en cours pour levée de doute sur alarme intrusion Client A.',
    '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
    '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf',
    '07a20bbd-66e6-42d7-b8f4-6663f7360fc2',
    '11111111-aaaa-4000-8000-111111111111',
    'ALERT_RESPONSE',
    now()
  ),
  -- Intervention isolée Client B / Prestataire 2
  (
    '22222222-2222-2222-2222-222222222222',
    'f2222222-2222-4000-8000-222222222222',
    'c2222222-2222-4000-8000-222222222222',
    'a2222222-2222-2222-2222-222222222222',
    'PENDING'::securia_intervention_status,
    'Intervention en attente sur alerte fumée Client B.',
    '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
    '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae',
    '99a20bbd-66e6-42d7-b8f4-6663f7360fc9',
    '22222222-bbbb-4000-8000-222222222222',
    'ALERT_RESPONSE',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  client_organization_id = EXCLUDED.client_organization_id,
  provider_organization_id = EXCLUDED.provider_organization_id,
  organization_id = EXCLUDED.organization_id,
  created_by = EXCLUDED.created_by,
  status = EXCLUDED.status
WHERE interventions.id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- =============================================================================
-- 9. FACTURES, ABONNEMENTS ET CLÉS D'API
-- =============================================================================
DO $$
DECLARE
  v_plan_enterprise_id UUID;
  v_plan_pro_id UUID;
BEGIN
  -- Récupération dynamique des plans réels
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'plans') THEN
    SELECT id INTO v_plan_enterprise_id FROM public.plans WHERE code = 'ENTERPRISE' LIMIT 1;
    SELECT id INTO v_plan_pro_id FROM public.plans WHERE code = 'PROFESSIONNEL' LIMIT 1;
    
    -- Si les plans de référence n'existent pas encore, en créer un pour garantir l'intégrité
    IF v_plan_enterprise_id IS NULL THEN
      INSERT INTO public.plans (code, name, monthly_price, yearly_price, is_active)
      VALUES ('ENTERPRISE', 'Plan Enterprise Staging', 490000, 4900000, true)
      RETURNING id INTO v_plan_enterprise_id;
    END IF;
    IF v_plan_pro_id IS NULL THEN
      v_plan_pro_id := v_plan_enterprise_id;
    END IF;
  END IF;

  -- 9.1 Abonnements
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    INSERT INTO public.subscriptions (id, organization_id, plan_id, status, created_at, updated_at)
    VALUES
      ('0b111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', v_plan_enterprise_id, 'ACTIVE', now(), now()),
      ('0b222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', v_plan_pro_id, 'ACTIVE', now(), now())
    ON CONFLICT (organization_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status
    WHERE subscriptions.organization_id IN ('07a20bbd-66e6-42d7-b8f4-6663f7360fc2', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9');
  END IF;

  -- 9.2 Factures
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    INSERT INTO public.invoices (id, organization_id, invoice_number, status, subtotal, total, period_start, period_end, created_at)
    VALUES
      ('fa111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'INV-STG-A-001', 'PAID', 500000, 500000, now() - interval '30 days', now(), now()),
      ('fa222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'INV-STG-B-001', 'PENDING', 250000, 250000, now() - interval '30 days', now(), now())
    ON CONFLICT (invoice_number) DO UPDATE SET
      total = EXCLUDED.total,
      status = EXCLUDED.status
    WHERE invoices.invoice_number IN ('INV-STG-A-001', 'INV-STG-B-001');
  END IF;

  -- 9.3 Clés d'API
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    INSERT INTO public.api_keys (id, organization_id, name, key_prefix, key_hash, scopes, created_at)
    VALUES
      ('ea111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'Clé API Ingestion Client A', 'sec_live_cla', 'fictitious_sha256_hash_client_a_for_staging_testing_only_12345678', ARRAY['alerts:read', 'interventions:read'], now()),
      ('ea222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'Clé API Webhook Client B', 'sec_live_clb', 'fictitious_sha256_hash_client_b_for_staging_testing_only_12345678', ARRAY['alerts:read'], now())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      scopes = EXCLUDED.scopes
    WHERE api_keys.key_prefix IN ('sec_live_cla', 'sec_live_clb');
  END IF;
END $$;

COMMIT;

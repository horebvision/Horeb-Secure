-- =============================================================================
-- SECURIA SaaS — SUITE DE TESTS TRANSACTIONNELS POSTGRESQL (PHASE 2.8)
-- Fichier : supabase/tests/01_security_hardening_phase2_8_transactional.sql
-- Date : 12 Octobre 2026
-- Rôle : DevSecOps Senior
--
-- CARACTÉRISTIQUES DEVSECOPS STRICTES :
-- 1. 100% Autonome : Ne nécessite aucune extension externe (ni pgTAP, ni pg_prove).
-- 2. Exécutable directement dans psql ou le SQL Editor Supabase.
-- 3. Isolation totale : Entouré par BEGIN ... ROLLBACK pour ne laisser AUCUN artefact persistant.
-- 4. Simulation fidèle des sessions authentifiées PostgREST (SET LOCAL request.jwt.claims / auth.uid).
-- 5. Validation formelle des 5 catégories d'audit :
--    A. Comptes inactifs & JWT orphelins (is_active = false)
--    B. Cloisonnement agents & validation p_facet ('CLIENT', 'PROVIDER', 'ANY')
--    C. Immuabilité directe et indirecte (created_by, orgs, centres, agents)
--    D. Résilience après Rollback & Trigger de repli
--    E. Idempotence et étanchéité anti-collision des Fixtures
-- =============================================================================

BEGIN;

-- Définition du contexte d'intention de test pour les triggers et contrôles
SET LOCAL "app.environment" = 'staging';

-- =============================================================================
-- FIXTURES MINIMALES DÉTERMINISTES ENCAPSULÉES DANS LA TRANSACTION (PHASE 2M)
-- Insérées sous les privilèges superutilisateur initiaux (postgres / rôle de connexion)
-- Garanties d'isolation : créées et annulées strictement dans ce bloc BEGIN ... ROLLBACK.
-- =============================================================================

-- 1. ENTRÉES D'AUTHENTIFICATION LOCALES DE TEST (auth.users)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES
  ('11111111-aaaa-4000-8000-111111111111', '00000000-0000-0000-0000-000000000000', 'test-client-a@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Marc Dupont (Client A)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('22222222-bbbb-4000-8000-222222222222', '00000000-0000-0000-0000-000000000000', 'test-client-b@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sophie Martin (Admin Client B)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('33333333-cccc-4000-8000-333333333333', '00000000-0000-0000-0000-000000000000', 'test-provider1@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Claire Mercier (Manager P1)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('44444444-dddd-4000-8000-444444444444', '00000000-0000-0000-0000-000000000000', 'test-provider2@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Jean Valjean (Manager P2)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('55555555-eeee-4000-8000-555555555555', '00000000-0000-0000-0000-000000000000', 'test-agent1@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Karim Traore (Agent P1)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('66666666-eeee-4000-8000-666666666666', '00000000-0000-0000-0000-000000000000', 'test-agent2@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Lucas Meyer (Agent P2)"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
  ('99999999-ffff-4000-8000-999999999999', '00000000-0000-0000-0000-000000000000', 'test-superadmin@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Super Admin Staging"}'::jsonb, now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

-- 2. ORGANISATIONS DE TEST (public.organizations)
INSERT INTO public.organizations (id, name, code, phone, email, address, city, postal_code, is_active)
VALUES
  ('07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'Client Alpha Corporate SAS', 'CLI-A-CORP', '+33 1 99 01 00 01', 'contact@client-a.internal', '10 Rue de la Paix', 'Paris', '75002', true),
  ('99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'Client Beta Industries SA', 'CLI-B-INDUS', '+33 1 99 02 00 02', 'contact@client-b.internal', '20 Boulevard Haussmann', 'Paris', '75009', true),
  ('8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'Prestataire Télésurveillance Gamma P1', 'PRV-1-SEC', '+33 1 99 03 00 03', 'ops@provider1.internal', '30 Avenue des Champs-Élysées', 'Paris', '75008', true),
  ('7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'Prestataire Télésurveillance Delta P2', 'PRV-2-DELTA', '+33 1 99 04 00 04', 'ops@provider2.internal', '40 Rue La Fayette', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  email = EXCLUDED.email,
  is_active = EXCLUDED.is_active;

-- 3. CENTRES DE SÉCURITÉ OPÉRATIONNELS (public.security_centers)
INSERT INTO public.security_centers (id, organization_id, name, code, phone, email, address, city, postal_code, is_active)
VALUES
  ('c1111111-1111-4000-8000-111111111111', '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'PC Sécurité Gamma P1 Central', 'CTR-P1-CENTRAL', '+33 1 99 03 00 10', 'pc1@provider1.internal', '30 Avenue des Champs-Élysées', 'Paris', '75008', true),
  ('c2222222-2222-4000-8000-222222222222', '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'PC Sécurité Delta P2 Est', 'CTR-P2-DELTA', '+33 1 99 04 00 20', 'pc2@provider2.internal', '40 Rue La Fayette', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  organization_id = EXCLUDED.organization_id,
  is_active = EXCLUDED.is_active;

-- 4. PROFILS UTILISATEURS (public.users)
INSERT INTO public.users (id, email, full_name, phone, role, organization_id, security_center_id, is_active)
VALUES
  ('11111111-aaaa-4000-8000-111111111111', 'test-client-a@staging.securia.internal', 'Marc Dupont (Client A)', '+33 6 01 02 03 04', 'USER'::securia_user_role, '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', NULL, true),
  ('22222222-bbbb-4000-8000-222222222222', 'test-client-b@staging.securia.internal', 'Sophie Martin (Admin Client B)', '+33 6 02 03 04 05', 'ADMIN'::securia_user_role, '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', NULL, true),
  ('33333333-cccc-4000-8000-333333333333', 'test-provider1@staging.securia.internal', 'Claire Mercier (Manager P1)', '+33 6 03 04 05 06', 'SECURITY_MANAGER'::securia_user_role, '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', true),
  ('44444444-dddd-4000-8000-444444444444', 'test-provider2@staging.securia.internal', 'Jean Valjean (Manager P2)', '+33 6 04 05 06 07', 'SECURITY_MANAGER'::securia_user_role, '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', true),
  ('55555555-eeee-4000-8000-555555555555', 'test-agent1@staging.securia.internal', 'Karim Traore (Agent P1)', '+33 6 05 06 07 08', 'AGENT'::securia_user_role, '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', true),
  ('66666666-eeee-4000-8000-666666666666', 'test-agent2@staging.securia.internal', 'Lucas Meyer (Agent P2)', '+33 6 06 07 08 09', 'AGENT'::securia_user_role, '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', true),
  ('99999999-ffff-4000-8000-999999999999', 'test-superadmin@staging.securia.internal', 'Super Admin Staging', '+33 6 00 00 00 00', 'ADMIN'::securia_user_role, NULL, NULL, true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id,
  is_active = EXCLUDED.is_active;

-- 5. HABILITATION SUPER-ADMINISTRATEUR (public.platform_admins)
INSERT INTO public.platform_admins (user_id, granted_at, notes)
VALUES
  ('99999999-ffff-4000-8000-999999999999', now(), 'Super-Administrateur Plateforme certifié Staging')
ON CONFLICT (user_id) DO NOTHING;

-- 6. AGENTS DE SÉCURITÉ OPÉRATIONNELS (public.security_agents)
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
  is_active = EXCLUDED.is_active;

-- 7. SITES PROTÉGÉS (public.protected_sites)
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
  is_default = EXCLUDED.is_default;

-- 8. ALERTES DE TEST (public.alerts)
INSERT INTO public.alerts (id, alert_number, user_id, site_id, organization_id, security_center_id, assigned_agent_id, type, priority, status, client_notes)
VALUES
  ('f1111111-1111-4000-8000-111111111111', 'ALT-STG-001', '11111111-aaaa-4000-8000-111111111111', '10111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'c1111111-1111-4000-8000-111111111111', 'a1111111-1111-1111-1111-111111111111', 'INTRUSION'::securia_alert_type, 'HIGH'::securia_alert_priority, 'ASSIGNED'::securia_alert_status, 'Déclenchement alarme intrusion zone Nord Client A'),
  ('f2222222-2222-4000-8000-222222222222', 'ALT-STG-002', '22222222-bbbb-4000-8000-222222222222', '20222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'c2222222-2222-4000-8000-222222222222', 'a2222222-2222-2222-2222-222222222222', 'MENACE'::securia_alert_type, 'MEDIUM'::securia_alert_priority, 'RECEIVED'::securia_alert_status, 'Détection fumée local technique Client B')
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id,
  assigned_agent_id = EXCLUDED.assigned_agent_id,
  type = EXCLUDED.type,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  client_notes = EXCLUDED.client_notes;

-- 9. INTERVENTIONS DUAL-TENANT & ISOLÉES (public.interventions)
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
  status = EXCLUDED.status;

-- =============================================================================
-- PROCÉDURES TEMPORAIRES DE TEST (ÉPHÉMÈRES ET ENCAPSULÉES DANS LA TRANSACTION)
-- =============================================================================

-- Helper pour simuler un contexte de session authentifié PostgREST
CREATE OR REPLACE PROCEDURE pg_temp.set_auth_context(p_uid UUID, p_role TEXT DEFAULT 'authenticated')
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', p_role, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', p_role)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Helper pour simuler le contexte administrateur applicatif légitime (service_role / platform_admin)
-- RÈGLE DEVSECOPS : N'utilise jamais le superuser système 'postgres' pour éviter les escalades indues de privilèges
CREATE OR REPLACE PROCEDURE pg_temp.set_admin_context()
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-ffff-4000-8000-999999999999', 'role', 'service_role')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '99999999-ffff-4000-8000-999999999999', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

-- Helper d'assertion avec comptabilisation et arrêt sur échec critique
CREATE OR REPLACE PROCEDURE pg_temp.assert_true(p_test_name TEXT, p_condition BOOLEAN, p_failure_details TEXT DEFAULT '')
LANGUAGE plpgsql AS $$
DECLARE
  v_tc INT := COALESCE(NULLIF(current_setting('test.count', true), '')::int, 0) + 1;
  v_pc INT := COALESCE(NULLIF(current_setting('test.pass', true), '')::int, 0);
BEGIN
  PERFORM set_config('test.count', v_tc::text, true);
  IF p_condition THEN
    PERFORM set_config('test.pass', (v_pc + 1)::text, true);
    RAISE NOTICE '  ✅ [PASS] %', p_test_name;
  ELSE
    RAISE WARNING '  ❌ [FAIL] % : %', p_test_name, p_failure_details;
    RAISE EXCEPTION 'Échec de test critique : % (%)', p_test_name, p_failure_details;
  END IF;
END;
$$;

-- =============================================================================
-- PRÉREQUIS D'INFRASTRUCTURE DE TEST (ENVIRONNEMENT LOCAL DOCKER / SUPERUSER) :
-- Basculer sur 'authenticator' empêche session_user de court-circuiter app_is_admin_context()
-- et garantit que les contextes PostgREST simulés par request.jwt.claims sont fidèlement testés.
-- =============================================================================
SET SESSION AUTHORIZATION authenticator;

DO $$
DECLARE
  v_err_msg TEXT;
  v_rec RECORD;
  v_count INT;
  v_caught_p0001 BOOLEAN;
  v_is_active BOOLEAN;
  v_notes TEXT;
  v_role securia_user_role;
  
  -- UUIDs déterministes des fixtures (identiques à seed_staging_isolated_fixtures_v2.sql)
  c_org_client_a CONSTANT UUID := '07a20bbd-66e6-42d7-b8f4-6663f7360fc2';
  c_org_client_b CONSTANT UUID := '99a20bbd-66e6-42d7-b8f4-6663f7360fc9';
  c_org_provider_1 CONSTANT UUID := '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf';
  c_org_provider_2 CONSTANT UUID := '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae';

  c_user_client_a CONSTANT UUID := '11111111-aaaa-4000-8000-111111111111';
  c_user_client_b CONSTANT UUID := '22222222-bbbb-4000-8000-222222222222';
  c_user_manager_p1 CONSTANT UUID := '33333333-cccc-4000-8000-333333333333';
  c_user_manager_p2 CONSTANT UUID := '44444444-dddd-4000-8000-444444444444';
  c_user_agent_1 CONSTANT UUID := '55555555-eeee-4000-8000-555555555555';
  c_user_agent_2 CONSTANT UUID := '66666666-eeee-4000-8000-666666666666';
  c_user_superadmin CONSTANT UUID := '99999999-ffff-4000-8000-999999999999';

  c_agent_1 CONSTANT UUID := 'a1111111-1111-1111-1111-111111111111';
  c_agent_2 CONSTANT UUID := 'a2222222-2222-2222-2222-222222222222';

  c_center_p1 CONSTANT UUID := 'c1111111-1111-4000-8000-111111111111';
  c_center_p2 CONSTANT UUID := 'c2222222-2222-4000-8000-222222222222';

  c_alert_a CONSTANT UUID := 'f1111111-1111-4000-8000-111111111111';
  c_alert_b CONSTANT UUID := 'f2222222-2222-4000-8000-222222222222';

  c_itv_dual CONSTANT UUID := '11111111-1111-1111-1111-111111111111';
  c_itv_b CONSTANT UUID := '22222222-2222-2222-2222-222222222222';

BEGIN
  PERFORM set_config('test.count', '0', true);
  PERFORM set_config('test.pass', '0', true);

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '🛡️ SUITE DE TESTS DYNAMIQUES DE SÉCURITÉ POSTGRESQL (PHASE 2.8)';
  RAISE NOTICE '======================================================================';

  -- ===========================================================================
  -- SECTION A : COMPTES INACTIFS & DÉSACTIVATION DES ACCÈS (is_active = false)
  -- ===========================================================================
  RAISE NOTICE '--- TEST CATEGORIE A : Neutralisation des comptes inactifs ---';

  -- A.1 Utilisateur actif : app_current_org() et app_current_role() fonctionnels
  CALL pg_temp.set_auth_context(c_user_client_a);
  CALL pg_temp.assert_true(
    'A.1 Utilisateur actif (Client A) récupère son organisation et son rôle',
    public.app_current_org() = c_org_client_a AND public.app_current_role() = 'USER'::securia_user_role,
    'Organisation ou rôle incorrect'
  );

  -- A.2 Désactivation temporaire de Client A : app_current_org() et app_current_role() doivent retourner NULL
  CALL pg_temp.set_admin_context();
  UPDATE public.users SET is_active = false WHERE id = c_user_client_a;

  CALL pg_temp.set_auth_context(c_user_client_a);
  CALL pg_temp.assert_true(
    'A.2 Utilisateur désactivé (Client A is_active=false) retourne app_current_org() = NULL',
    public.app_current_org() IS NULL,
    'app_current_org() a retourné une organisation pour un compte inactif !'
  );
  CALL pg_temp.assert_true(
    'A.2.bis Utilisateur désactivé retourne app_current_role() = NULL',
    public.app_current_role() IS NULL,
    'app_current_role() a retourné un rôle pour un compte inactif !'
  );

  -- A.3 Blocage RLS direct pour utilisateur inactif (0 ligne retournée sur public.alerts)
  SELECT COUNT(*) INTO v_count FROM public.alerts;
  CALL pg_temp.assert_true(
    'A.3 Utilisateur désactivé avec JWT valide voit 0 alerte via RLS',
    v_count = 0,
    format('%s alerte(s) vue(s) par un utilisateur inactif', v_count)
  );

  -- A.3.bis Blocage UPDATE d'alerte par compte inactif
  CALL pg_temp.set_auth_context(c_user_client_a);
  v_caught_p0001 := false;
  v_count := -1;
  BEGIN
    UPDATE public.alerts SET client_notes = 'PIRATAGE_INACTIF' WHERE id = c_alert_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' THEN
    v_caught_p0001 := true;
    v_count := 0;
  END;
  -- Relecture sous contexte autorisé (service_role / platform_admin) pour contrer le masquage RLS
  CALL pg_temp.set_admin_context();
  v_notes := NULL;
  SELECT client_notes INTO v_notes FROM public.alerts WHERE id = c_alert_a;
  CALL pg_temp.assert_true(
    'A.3.bis Utilisateur inactif ne peut pas modifier d''alerte (notes inchangées, 0 ligne affectée)',
    (v_count = 0 OR v_caught_p0001) 
    AND v_notes IS NOT NULL 
    AND v_notes = 'Déclenchement alarme intrusion zone Nord Client A',
    format('Alerte altérée ou introuvable : notes = %s, v_count = %s', v_notes, v_count)
  );

  -- A.3.ter Blocage INSERT d'alerte par compte inactif
  CALL pg_temp.set_auth_context(c_user_client_a);
  v_caught_p0001 := false;
  BEGIN
    INSERT INTO public.alerts (
      id, alert_number, user_id, organization_id, type, priority, status
    ) VALUES (
      'f9999999-9999-4000-8000-999999999999',
      'ALT-HACK-INACTIF',
      c_user_client_a,
      NULL,
      'INTRUSION'::securia_alert_type,
      'CRITICAL'::securia_alert_priority,
      'CREATED'::securia_alert_status
    );
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' THEN
    v_caught_p0001 := true;
  END;
  -- Relecture sous contexte autorisé pour vérifier l'absence d'insertion sans masquage RLS
  CALL pg_temp.set_admin_context();
  v_count := -1;
  SELECT COUNT(*) INTO v_count FROM public.alerts WHERE id = 'f9999999-9999-4000-8000-999999999999';
  CALL pg_temp.assert_true(
    'A.3.ter Utilisateur inactif ne peut pas créer d''alerte (rejet RLS / trigger P0001, 0 ligne insérée)',
    v_caught_p0001 AND v_count = 0,
    format('Une alerte a été insérée par un compte inactif ! v_count = %s, caught = %s', v_count, v_caught_p0001)
  );

  -- A.4 Blocage RPC get_scoped_interventions_feed() pour compte inactif
  CALL pg_temp.set_auth_context(c_user_client_a);
  v_caught_p0001 := false;
  BEGIN
    PERFORM * FROM public.get_scoped_interventions_feed(c_org_client_a);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    v_caught_p0001 := true;
  END;
  CALL pg_temp.assert_true(
    'A.4 RPC lève P0001 Accès refusé pour compte inactif avec JWT résiduel',
    v_caught_p0001,
    'La RPC aurait dû lever une exception P0001 pour un compte inactif'
  );

  -- A.4.bis Blocage auto-réactivation dans public.users par compte inactif
  CALL pg_temp.set_auth_context(c_user_client_a);
  v_caught_p0001 := false;
  v_count := -1;
  BEGIN
    UPDATE public.users SET is_active = true WHERE id = c_user_client_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' THEN
    v_caught_p0001 := true;
    v_count := 0;
  END;
  -- Relecture sous contexte autorisé pour confirmer que is_active est resté false
  CALL pg_temp.set_admin_context();
  v_is_active := NULL;
  SELECT is_active INTO v_is_active FROM public.users WHERE id = c_user_client_a;
  CALL pg_temp.assert_true(
    'A.4.bis Compte inactif ne peut pas s''auto-réactiver (is_active reste false sous admin, 0 ligne affectée)',
    v_is_active IS NOT NULL 
    AND v_is_active = false 
    AND (v_count = 0 OR v_caught_p0001),
    format('Un compte inactif a réussi à se réactiver ! is_active = %s, v_count = %s, caught = %s', v_is_active, v_count, v_caught_p0001)
  );

  -- Rétablir le compte Client A
  CALL pg_temp.set_admin_context();
  UPDATE public.users SET is_active = true WHERE id = c_user_client_a;

  -- Non-régression : opération légitime d'un utilisateur actif sur ses alertes
  CALL pg_temp.set_auth_context(c_user_client_a);
  UPDATE public.alerts SET client_notes = 'Mise a jour legitime Client A' WHERE id = c_alert_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_notes := NULL;
  SELECT client_notes INTO v_notes FROM public.alerts WHERE id = c_alert_a;
  CALL pg_temp.assert_true(
    'A.4.ter.nr Utilisateur actif conserve la modification de sa propre alerte',
    v_count = 1 AND v_notes IS NOT NULL AND v_notes = 'Mise a jour legitime Client A',
    'La mise à jour légitime d''alerte par un résident actif a échoué'
  );

  -- A.4.ter Gestion de statut par admin d'organisation au sein de son tenant
  CALL pg_temp.set_admin_context();
  UPDATE public.users SET role = 'ADMIN'::securia_user_role WHERE id = c_user_manager_p1;

  CALL pg_temp.set_auth_context(c_user_manager_p1);
  CALL pg_temp.assert_true(
    'A.4.ter.pre Contexte vérifié : appelant est un ADMIN actif du prestataire P1',
    public.app_current_role() = 'ADMIN'::securia_user_role 
    AND public.app_current_org() = c_org_provider_1,
    'Contexte incorrect pour le test de gestion intra-tenant'
  );

  -- A.4.ter.1 Désactivation d'un agent de son propre tenant par l'admin d'organisation
  UPDATE public.users SET is_active = false WHERE id = c_user_agent_1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_is_active := NULL;
  SELECT is_active INTO v_is_active FROM public.users WHERE id = c_user_agent_1;
  CALL pg_temp.assert_true(
    'A.4.ter.1 Admin d''organisation peut désactiver un agent de son propre tenant',
    v_count = 1 AND v_is_active IS NOT NULL AND v_is_active = false,
    format('Échec de désactivation d''un membre : v_count = %s, is_active = %s', v_count, v_is_active)
  );

  -- A.4.ter.2 Réactivation de l'agent de son propre tenant par le même admin d'organisation
  UPDATE public.users SET is_active = true WHERE id = c_user_agent_1;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_is_active := NULL;
  SELECT is_active INTO v_is_active FROM public.users WHERE id = c_user_agent_1;
  CALL pg_temp.assert_true(
    'A.4.ter.2 Admin d''organisation peut réactiver un agent de son propre tenant',
    v_count = 1 AND v_is_active IS NOT NULL AND v_is_active = true,
    format('Échec de réactivation d''un membre : v_count = %s, is_active = %s', v_count, v_is_active)
  );

  -- Rétablissement du rôle initial SECURITY_MANAGER du manager sous contexte admin
  CALL pg_temp.set_admin_context();
  UPDATE public.users SET role = 'SECURITY_MANAGER'::securia_user_role WHERE id = c_user_manager_p1;
  v_role := NULL;
  SELECT role INTO v_role FROM public.users WHERE id = c_user_manager_p1;
  CALL pg_temp.assert_true(
    'A.4.ter.3 Rétablissement garanti du rôle initial SECURITY_MANAGER du manager',
    v_role = 'SECURITY_MANAGER'::securia_user_role,
    format('Échec du rétablissement du rôle du manager : role = %s', v_role)
  );

  -- A.4.quater Admin d'organisation rejeté lors d'une modification cross-tenant
  CALL pg_temp.set_auth_context(c_user_client_b);
  CALL pg_temp.assert_true(
    'A.4.quater.pre Contexte vérifié : appelant est un ADMIN actif du Tenant B',
    public.app_current_role() = 'ADMIN'::securia_user_role 
    AND public.app_current_org() = c_org_client_b,
    'Contexte incorrect pour le test cross-tenant'
  );

  v_caught_p0001 := false;
  v_count := -1;
  BEGIN
    UPDATE public.users SET is_active = false WHERE id = c_user_client_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' THEN
    v_caught_p0001 := true;
    v_count := 0;
  END;

  -- Relecture sous contexte autorisé (service_role / platform_admin) pour contrer le masquage RLS
  CALL pg_temp.set_admin_context();
  v_is_active := NULL;
  SELECT is_active INTO v_is_active FROM public.users WHERE id = c_user_client_a;
  CALL pg_temp.assert_true(
    'A.4.quater Admin du tenant B ne peut pas modifier un utilisateur du tenant A (cross-tenant bloqué, is_active reste true)',
    v_is_active IS NOT NULL 
    AND v_is_active = true 
    AND (v_count = 0 OR v_caught_p0001),
    format('Altération cross-tenant réussie ou état non vérifiable ! is_active = %s, v_count = %s, caught = %s', v_is_active, v_count, v_caught_p0001)
  );

  -- A.5 Agent désactivé sur security_agents : app_current_agent_ids() doit retourner ensemble vide
  CALL pg_temp.set_admin_context();
  UPDATE public.security_agents SET is_active = false WHERE id = c_agent_1;
  CALL pg_temp.set_auth_context(c_user_agent_1);
  SELECT COUNT(*) INTO v_count FROM public.app_current_agent_ids();
  CALL pg_temp.assert_true(
    'A.5 Agent désactivé (is_active=false) retourne app_current_agent_ids() vide',
    v_count = 0,
    format('%s identifiant(s) agent retourné(s)', v_count)
  );

  -- Rétablir l'agent
  CALL pg_temp.set_admin_context();
  UPDATE public.security_agents SET is_active = true WHERE id = c_agent_1;

  -- ===========================================================================
  -- SECTION B : CLOISONNEMENT DES AGENTS & RPC SCOPING
  -- ===========================================================================
  RAISE NOTICE '--- TEST CATEGORIE B : Cloisonnement strict des agents ---';

  -- B.1 Agent 1 voit uniquement les interventions qui lui sont assignées
  CALL pg_temp.set_auth_context(c_user_agent_1);
  SELECT COUNT(*) INTO v_count FROM public.interventions WHERE agent_id != c_agent_1;
  CALL pg_temp.assert_true(
    'B.1 Agent 1 ne voit AUCUNE intervention assignée à autrui',
    v_count = 0,
    format('Fuite : %s intervention(s) étrangère(s) vue(s)', v_count)
  );

  -- B.2 Agent 1 rattaché temporairement à une organisation cliente ne doit pas voir tout le parc client
  CALL pg_temp.set_admin_context();
  -- Simulation d'un compte agent créé dans une organisation cliente
  UPDATE public.users SET organization_id = c_org_client_a WHERE id = c_user_agent_1;
  CALL pg_temp.set_auth_context(c_user_agent_1);
  
  -- L'intervention c_itv_dual a client_organization_id = c_org_client_a ET agent_id = c_agent_1 (assignée)
  -- L'intervention c_itv_b a client_organization_id = c_org_client_b ET agent_id = c_agent_2 (autre)
  SELECT COUNT(*) INTO v_count FROM public.interventions WHERE id = c_itv_b;
  CALL pg_temp.assert_true(
    'B.2 Agent dans org cliente ne voit pas les interventions des autres tenants',
    v_count = 0,
    'Fuite inter-tenant détectée'
  );

  -- Rétablir l'organisation de l'Agent 1 sur le prestataire P1
  CALL pg_temp.set_admin_context();
  UPDATE public.users SET organization_id = c_org_provider_1 WHERE id = c_user_agent_1;

  -- B.3 RPC get_scoped_interventions_feed() : Validation des facettes CLIENT, PROVIDER, ANY
  CALL pg_temp.set_auth_context(c_user_manager_p1);
  -- Facette PROVIDER valide
  SELECT COUNT(*) INTO v_count FROM public.get_scoped_interventions_feed(c_org_provider_1, 'PROVIDER');
  CALL pg_temp.assert_true('B.3 Facette PROVIDER valide retourne les interventions du prestataire', v_count >= 1);

  -- Facette invalide : doit lever P0001
  BEGIN
    PERFORM public.get_scoped_interventions_feed(c_org_provider_1, 'HACKER_FACET');
    CALL pg_temp.assert_true('B.4 Facette invalide rejetée', false, 'La facette invalide n''a pas été rejetée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('B.4 Facette invalide rejetée avec exception P0001', true);
  END;

  -- Facette NULL : doit lever P0001
  BEGIN
    PERFORM public.get_scoped_interventions_feed(c_org_provider_1, NULL);
    CALL pg_temp.assert_true('B.5 Facette NULL rejetée', false, 'La facette NULL n''a pas été rejetée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('B.5 Facette NULL rejetée avec exception P0001', true);
  END;

  -- B.6 Tentative d'accès cross-tenant via la RPC : Client A tente de requêter Provider 2
  CALL pg_temp.set_auth_context(c_user_client_a);
  BEGIN
    PERFORM public.get_scoped_interventions_feed(c_org_provider_2, 'ANY');
    CALL pg_temp.assert_true('B.6 Rejet cross-tenant RPC', false, 'Client A a pu requêter les interventions de Provider 2 !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('B.6 Rejet cross-tenant RPC avec exception P0001', true);
  END;

  -- ===========================================================================
  -- SECTION C : IMMUABILITÉ DIRECTE ET INDIRECTE (ANTI-TAMPERING)
  -- ===========================================================================
  RAISE NOTICE '--- TEST CATEGORIE C : Immuabilité absolue directe et indirecte ---';

  CALL pg_temp.set_auth_context(c_user_manager_p1);

  -- C.1 Tentative de modification de created_by par non-admin
  BEGIN
    UPDATE public.interventions SET created_by = c_user_client_b WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.1 created_by immuable', false, 'Modification de created_by autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.1 Modification directe de created_by bloquée avec P0001', true);
  END;

  -- C.2 Tentative de modification de organization_id par non-admin
  BEGIN
    UPDATE public.interventions SET organization_id = c_org_client_b WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.2 organization_id immuable', false, 'Modification de organization_id autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.2 Modification directe de organization_id bloquée avec P0001', true);
  END;

  -- C.3 Tentative de modification de client_organization_id par non-admin
  BEGIN
    UPDATE public.interventions SET client_organization_id = c_org_client_b WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.3 client_organization_id immuable', false, 'Modification de client_organization_id autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.3 Modification directe de client_organization_id bloquée avec P0001', true);
  END;

  -- C.4 Tentative de modification de provider_organization_id par non-admin
  BEGIN
    UPDATE public.interventions SET provider_organization_id = c_org_provider_2 WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.4 provider_organization_id immuable', false, 'Modification de provider_organization_id autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.4 Modification directe de provider_organization_id bloquée avec P0001', true);
  END;

  -- C.5 Tentative de détournement indirect du prestataire via security_center_id (assignation centre P2)
  BEGIN
    UPDATE public.interventions SET security_center_id = c_center_p2 WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.5 Détournement indirect via security_center_id bloqué', false, 'Changement indirect de prestataire autorisé !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.5 Détournement indirect via centre étranger bloqué avec P0001', true);
  END;

  -- C.6 Tentative de détournement indirect du prestataire via agent_id (assignation agent P2)
  BEGIN
    UPDATE public.interventions SET agent_id = c_agent_2 WHERE id = c_itv_dual;
    CALL pg_temp.assert_true('C.6 Détournement indirect via agent_id bloqué', false, 'Assignation agent étranger autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.6 Détournement indirect via agent étranger bloqué avec P0001', true);
  END;

  -- C.7 Tentative de modification de l'agent assigné sur une alerte par un utilisateur résident
  CALL pg_temp.set_auth_context(c_user_client_a);
  BEGIN
    UPDATE public.alerts SET assigned_agent_id = c_agent_2 WHERE id = c_alert_a;
    CALL pg_temp.assert_true('C.7 Modification agent sur alerte par résident bloquée', false, 'Résident a modifié l''agent de l''alerte !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.7 Falsification de l''agent d''alerte bloquée avec P0001', true);
  END;

  -- C.8 Tentative de modification de l'organisation d'une alerte par non-admin
  BEGIN
    UPDATE public.alerts SET organization_id = c_org_client_b WHERE id = c_alert_a;
    CALL pg_temp.assert_true('C.8 Organisation d''alerte immuable', false, 'Modification d''organisation d''alerte autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.8 Falsification de l''organisation d''alerte bloquée avec P0001', true);
  END;

  -- C.9 Insertion incohérente d'intervention (centre d'un autre prestataire sans alerte)
  CALL pg_temp.set_auth_context(c_user_manager_p1);
  BEGIN
    INSERT INTO public.interventions (
      id, client_organization_id, provider_organization_id, security_center_id, status
    ) VALUES (
      gen_random_uuid(), c_org_client_a, c_org_provider_1, c_center_p2, 'PENDING'
    );
    CALL pg_temp.assert_true('C.9 Insertion incohérente (centre P2 pour prestataire P1) bloquée', false, 'Insertion incohérente autorisée !');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    CALL pg_temp.assert_true('C.9 Insertion incohérente rejetée par le trigger de validation avec P0001', true);
  END;

  -- ===========================================================================
  -- SECTION D : INTÉGRITÉ DU TRIGGER ACTIF v4.2
  -- (Note DevSecOps : La résilience après rollback est testée dans une suite dédiée)
  -- ===========================================================================
  RAISE NOTICE '--- TEST CATEGORIE D : Intégrité du trigger dual-tenant actif v4.2 ---';
  CALL pg_temp.set_admin_context();

  -- D.1 Vérification de l'existence et attachement du trigger trg_sync_intervention_tenants_v4_2
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger 
  WHERE tgname = 'trg_sync_intervention_tenants_v4_2' 
    AND tgrelid = 'public.interventions'::regclass;
  CALL pg_temp.assert_true('D.1 Trigger dual-tenant v4.2 présent et attaché sur public.interventions', v_count = 1, 'Trigger v4.2 manquant sur interventions');

  -- D.2 Exécution réelle du trigger sur une mise à jour d'intervention autorisée (status)
  -- Injection d'une valeur sentinelle passée ancienne pour certifier son écrasement par now()
  UPDATE public.interventions 
  SET status = 'ON_SITE', 
      updated_at = '2000-01-01 00:00:00+00'::timestamptz 
  WHERE id = c_itv_dual;

  SELECT status, updated_at INTO v_rec FROM public.interventions WHERE id = c_itv_dual;
  CALL pg_temp.assert_true(
    'D.2 Trigger v4.2 s''exécute sans erreur, écrase la valeur sentinelle et actualise updated_at',
    v_rec.status = 'ON_SITE' 
    AND v_rec.updated_at = transaction_timestamp()
    AND v_rec.updated_at > '2000-01-01 00:00:00+00'::timestamptz,
    'Échec d''actualisation de updated_at par le trigger v4.2'
  );

  -- ===========================================================================
  -- SECTION E : FIXTURES, IDEMPOTENCE ET ANTI-COLLISION
  -- ===========================================================================
  RAISE NOTICE '--- TEST CATEGORIE E : Étanchéité et non-régression des fixtures ---';

  -- E.1 Vérification de l'intégrité persistant de l'intervention dual-tenant après toutes les tentatives de test
  SELECT client_organization_id, provider_organization_id, security_center_id, agent_id, created_by, organization_id
  INTO v_rec
  FROM public.interventions WHERE id = c_itv_dual;

  CALL pg_temp.assert_true(
    'E.1 État persistant de l''intervention de test strictement inchangé',
    v_rec.client_organization_id = c_org_client_a 
    AND v_rec.provider_organization_id = c_org_provider_1
    AND v_rec.security_center_id = c_center_p1
    AND v_rec.agent_id = c_agent_1
    AND v_rec.organization_id = c_org_client_a,
    'Altération détectée sur l''intervention !'
  );

  RAISE NOTICE '======================================================================';
  RAISE NOTICE '📊 BILAN DE LA SUITE DE TESTS TRANSACTIONNELS :';
  RAISE NOTICE '   - Tests exécutés : %', current_setting('test.count', true);
  RAISE NOTICE '   - Succès certifiés : %', current_setting('test.pass', true);
  RAISE NOTICE '======================================================================';

END $$;

-- ANNULATION TRANSACTIONNELLE SYSTÉMATIQUE (GARANTIE ZÉRO PERSISTANCE)
ROLLBACK;

-- RÉINITIALISATION DE L'AUTORISATION DE SESSION
-- Exécutée après ROLLBACK pour éviter d'être bloquée par un état de transaction avortée (25P02)
RESET SESSION AUTHORIZATION;

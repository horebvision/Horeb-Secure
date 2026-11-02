-- =============================================================================
-- SECURIA SaaS — FIXTURES DÉTERMINISTES POUR STAGING ISOLÉ
-- Fichier : supabase/seed_staging_isolated_fixtures.sql
-- Date : 11 Octobre 2026
-- Phase : 2.0 Préparation Sécurisée du Staging
--
-- STRICTEMENT DÉDIÉ AU STAGING — INTERDIT EN PRODUCTION
-- Ce script initialise un jeu de données 100% fictif et étanche pour éprouver
-- la matrice d'isolation multi-tenant (RLS, Triggers, Dual-Tenant & RPC).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. COMPTES AUTHENTIFIÉS FICTIFS (auth.users)
-- =============================================================================
-- Insertion sécurisée et idempotente dans auth.users pour satisfaire les FKs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES
      -- Client A (Résident)
      ('11111111-aaaa-4000-8000-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-client-a@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Résident Client A"}', now(), now()),
      -- Client B (Admin Client B)
      ('22222222-bbbb-4000-8000-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-client-b@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Admin Client B"}', now(), now()),
      -- Prestataire 1 (Security Manager P1)
      ('33333333-cccc-4000-8000-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-provider1@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Manager Prestataire 1"}', now(), now()),
      -- Prestataire 2 (Security Manager P2)
      ('44444444-dddd-4000-8000-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-provider2@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Manager Prestataire 2"}', now(), now()),
      -- Agent Prestataire 1 (Patrouilleur terrain P1)
      ('55555555-eeee-4000-8000-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-agent1@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Agent Patrouille P1"}', now(), now()),
      -- Agent Prestataire 2 (Patrouilleur terrain P2)
      ('66666666-eeee-4000-8000-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-agent2@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Agent Patrouille P2"}', now(), now()),
      -- Super Administrateur Plateforme
      ('99999999-ffff-4000-8000-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-superadmin@staging.securia.internal', '$2a$10$abcdefghijklmnopqrstuuNOPQRSTUVWXYZ0123456789abcdefghijk', now(), '{"provider":"email","providers":["email"],"is_platform_admin":true}', '{"full_name":"Super Administrateur Staging"}', now(), now())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      raw_app_meta_data = EXCLUDED.raw_app_meta_data,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data;
  END IF;
END $$;

-- =============================================================================
-- 2. ORGANISATIONS (public.organizations)
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
  email = EXCLUDED.email;

-- =============================================================================
-- 3. CENTRES DE SÉCURITÉ OPÉRATIONNELS (public.security_centers)
-- =============================================================================
INSERT INTO public.security_centers (id, organization_id, name, code, phone, email, address, city, postal_code, is_active)
VALUES
  ('c1111111-1111-4000-8000-111111111111', '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'PC Sécurité Gamma P1 Central', 'CTR-P1-CENTRAL', '+33 1 99 03 00 10', 'pc1@provider1.internal', '30 Avenue des Champs-Élysées', 'Paris', '75008', true),
  ('c2222222-2222-4000-8000-222222222222', '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'PC Sécurité Delta P2 Est', 'CTR-P2-DELTA', '+33 1 99 04 00 20', 'pc2@provider2.internal', '40 Rue La Fayette', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  organization_id = EXCLUDED.organization_id;

-- =============================================================================
-- 4. PROFILS UTILISATEURS (public.users)
-- =============================================================================
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
  -- Agent de terrain Prestataire 1
  ('55555555-eeee-4000-8000-555555555555', 'test-agent1@staging.securia.internal', 'Karim Traore (Agent P1)', '+33 6 05 06 07 08', 'SECURITY_AGENT'::securia_user_role, '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', true),
  -- Agent de terrain Prestataire 2
  ('66666666-eeee-4000-8000-666666666666', 'test-agent2@staging.securia.internal', 'Lucas Meyer (Agent P2)', '+33 6 06 07 08 09', 'SECURITY_AGENT'::securia_user_role, '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', true),
  -- Super Administrateur Plateforme (Non affilié à une org cliente pour neutralité)
  ('99999999-ffff-4000-8000-999999999999', 'test-superadmin@staging.securia.internal', 'Super Admin Staging', '+33 6 00 00 00 00', 'ADMIN'::securia_user_role, NULL, NULL, true)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  organization_id = EXCLUDED.organization_id,
  security_center_id = EXCLUDED.security_center_id;

-- =============================================================================
-- 5. HABILITATION SUPER-ADMINISTRATEUR (public.platform_admins)
-- =============================================================================
INSERT INTO public.platform_admins (user_id, granted_at, notes)
VALUES
  ('99999999-ffff-4000-8000-999999999999', now(), 'Compte Super-Administrateur certifié pour le banc de test Staging')
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- 6. AGENTS DE SÉCURITÉ OPÉRATIONNELS (public.security_agents)
-- =============================================================================
INSERT INTO public.security_agents (id, user_id, organization_id, security_center_id, badge_number, duty_status, patrol_vehicle, is_active)
VALUES
  ('a1111111-1111-1111-1111-111111111111', '55555555-eeee-4000-8000-555555555555', '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf', 'c1111111-1111-4000-8000-111111111111', 'BADGE-P1-001', 'ON_DUTY'::securia_agent_duty_status, 'Moto Patrouille Alpha', true),
  ('a2222222-2222-2222-2222-222222222222', '66666666-eeee-4000-8000-666666666666', '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae', 'c2222222-2222-4000-8000-222222222222', 'BADGE-P2-002', 'ON_DUTY'::securia_agent_duty_status, 'Voiture Patrouille Delta', true)
ON CONFLICT (id) DO UPDATE SET
  badge_number = EXCLUDED.badge_number,
  organization_id = EXCLUDED.organization_id,
  duty_status = EXCLUDED.duty_status;

-- =============================================================================
-- 7. SITES PROTÉGÉS (public.protected_sites)
-- =============================================================================
INSERT INTO public.protected_sites (id, owner_id, organization_id, security_center_id, name, site_type, address, city, postal_code, is_default)
VALUES
  ('s1111111-1111-4000-8000-111111111111', '11111111-aaaa-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'c1111111-1111-4000-8000-111111111111', 'Siège Social Client A', 'ENTREPRISE'::securia_site_type, '10 Rue de la Paix', 'Paris', '75002', true),
  ('s2222222-2222-4000-8000-222222222222', '22222222-bbbb-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'c2222222-2222-4000-8000-222222222222', 'Entrepôt Logistique Client B', 'ENTREPRISE'::securia_site_type, '20 Boulevard Haussmann', 'Paris', '75009', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  organization_id = EXCLUDED.organization_id;

-- =============================================================================
-- 8. ALERTES DE TEST (public.alerts)
-- =============================================================================
INSERT INTO public.alerts (id, alert_number, user_id, site_id, organization_id, security_center_id, assigned_agent_id, status, client_notes)
VALUES
  -- Alerte A : Client A traitée par Prestataire 1
  ('f1111111-1111-4000-8000-111111111111', 'ALT-STG-001', '11111111-aaaa-4000-8000-111111111111', 's1111111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'c1111111-1111-4000-8000-111111111111', 'a1111111-1111-1111-1111-111111111111', 'ASSIGNED'::securia_alert_status, 'Déclenchement alarme intrusion zone Nord'),
  -- Alerte B : Client B strictement isolée
  ('f2222222-2222-4000-8000-222222222222', 'ALT-STG-002', '22222222-bbbb-4000-8000-222222222222', 's2222222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'c2222222-2222-4000-8000-222222222222', 'a2222222-2222-2222-2222-222222222222', 'RECEIVED'::securia_alert_status, 'Détection fumée local technique B')
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  status = EXCLUDED.status;

-- =============================================================================
-- 9. INTERVENTIONS DUAL-TENANT & ISOLÉES (public.interventions)
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
    'ALERT_RESPONSE',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  client_organization_id = EXCLUDED.client_organization_id,
  provider_organization_id = EXCLUDED.provider_organization_id,
  organization_id = EXCLUDED.organization_id,
  status = EXCLUDED.status;

-- =============================================================================
-- 10. FACTURES, ABONNEMENTS ET CLÉS D'API (TABLES SENSIBLES CONNEXES)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    INSERT INTO public.subscriptions (id, organization_id, status, created_at, updated_at)
    VALUES
      ('sub11111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'ACTIVE', now(), now()),
      ('sub22222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'ACTIVE', now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    INSERT INTO public.invoices (id, organization_id, invoice_number, status, total, period_start, period_end, created_at)
    VALUES
      ('fac11111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'INV-STG-A-001', 'PAID', 500000, now() - interval '30 days', now(), now()),
      ('fac22222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'INV-STG-B-001', 'PENDING', 250000, now() - interval '30 days', now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    INSERT INTO public.api_keys (id, organization_id, name, key_prefix, key_hash, scopes, created_at)
    VALUES
      ('key11111-1111-4000-8000-111111111111', '07a20bbd-66e6-42d7-b8f4-6663f7360fc2', 'Clé API Ingestion Client A', 'sec_live_cla', 'hash_fictif_client_a_1234567890abcdef', ARRAY['alerts:read', 'interventions:read'], now()),
      ('key22222-2222-4000-8000-222222222222', '99a20bbd-66e6-42d7-b8f4-6663f7360fc9', 'Clé API Webhook Client B', 'sec_live_clb', 'hash_fictif_client_b_1234567890abcdef', ARRAY['alerts:read'], now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;

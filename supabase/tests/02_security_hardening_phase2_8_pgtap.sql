-- =============================================================================
-- SECURIA SaaS — SUITE DE TESTS FORMELS pgTAP (PHASE 2.8)
-- Fichier : supabase/tests/02_security_hardening_phase2_8_pgtap.sql
-- Date : 12 Octobre 2026
-- Rôle : DevSecOps Senior
--
-- PRÉREQUIS :
-- 1. Extension pgTAP installée sur la base (CREATE EXTENSION IF NOT EXISTS pgtap;).
-- 2. Exécutable via Supabase CLI : `supabase test db` ou `pg_prove -U postgres -d <db>`.
-- 3. Entouré par BEGIN ... ROLLBACK pour une exécution sans effet résiduel.
-- =============================================================================

-- 1. CHARGEMENT DE L'EXTENSION pgTAP (RÔLE D'ADMINISTRATION INITIAL) :
-- Doit être exécuté sous le rôle privilégié initial (postgres) AVANT tout abaissement de session.
CREATE EXTENSION IF NOT EXISTS pgtap;

BEGIN;

-- 2. PRÉREQUIS D'INFRASTRUCTURE DE TEST (ENVIRONNEMENT LOCAL DOCKER / SUPERUSER) :
-- Nécessite les privilèges superutilisateur (disponibles sous Supabase CLI Docker).
-- Sur Supabase Cloud managé où le rôle 'postgres' n'a pas rolsuper=true, cette instruction
-- échoue avec 42501. Basculer sur 'authenticator' empêche session_user de court-circuiter app_is_admin_context().
SET SESSION AUTHORIZATION authenticator;

SELECT plan(20);

-- Fixtures UUIDs
CREATE TEMP TABLE _test_constants ON COMMIT DROP AS
SELECT 
  '07a20bbd-66e6-42d7-b8f4-6663f7360fc2'::uuid AS org_client_a,
  '99a20bbd-66e6-42d7-b8f4-6663f7360fc9'::uuid AS org_client_b,
  '8e1f3246-880c-43f1-b1e6-fc3f1eecdbbf'::uuid AS org_provider_1,
  '7d0e2135-770b-32e0-a0d5-eb2e0ddbcaae'::uuid AS org_provider_2,
  '11111111-aaaa-4000-8000-111111111111'::uuid AS user_client_a,
  '22222222-bbbb-4000-8000-222222222222'::uuid AS user_client_b,
  '33333333-cccc-4000-8000-333333333333'::uuid AS user_manager_p1,
  '44444444-dddd-4000-8000-444444444444'::uuid AS user_manager_p2,
  '55555555-eeee-4000-8000-555555555555'::uuid AS user_agent_1,
  '66666666-eeee-4000-8000-666666666666'::uuid AS user_agent_2,
  '99999999-ffff-4000-8000-999999999999'::uuid AS user_superadmin,
  'a1111111-1111-1111-1111-111111111111'::uuid AS agent_1,
  'a2222222-2222-2222-2222-222222222222'::uuid AS agent_2,
  'c1111111-1111-4000-8000-111111111111'::uuid AS center_p1,
  'c2222222-2222-4000-8000-222222222222'::uuid AS center_p2,
  'f1111111-1111-4000-8000-111111111111'::uuid AS alert_a,
  'f2222222-2222-4000-8000-222222222222'::uuid AS alert_b,
  '11111111-1111-1111-1111-111111111111'::uuid AS itv_dual,
  '22222222-2222-2222-2222-222222222222'::uuid AS itv_b;

-- Helper SQL pour configurer le contexte utilisateur PostgREST
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid UUID, p_role TEXT DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', p_role, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', p_role)::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Helper pour simuler le contexte administrateur applicatif légitime (service_role / platform_admin)
-- N'utilise jamais le superuser système 'postgres' pour éviter les escalades de privilèges et erreurs de droits
CREATE OR REPLACE FUNCTION pg_temp.act_as_admin()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '99999999-ffff-4000-8000-999999999999', 'role', 'service_role')::text, true);
  PERFORM set_config('request.jwt.claim.sub', '99999999-ffff-4000-8000-999999999999', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- CATÉGORIE A : COMPTES INACTIFS & DÉSACTIVATION
-- -----------------------------------------------------------------------------

-- Test 1 : Utilisateur actif récupère son organisation
SELECT pg_temp.act_as((SELECT user_client_a FROM _test_constants));
SELECT is(
  public.app_current_org(),
  (SELECT org_client_a FROM _test_constants),
  'A.1 Utilisateur actif (Client A) : app_current_org() renvoie son org'
);

-- Test 2 : Utilisateur actif récupère son rôle
SELECT is(
  public.app_current_role(),
  'USER'::securia_user_role,
  'A.2 Utilisateur actif (Client A) : app_current_role() renvoie USER'
);

-- Test 3 : Désactivation de Client A -> app_current_org() devient NULL
SELECT pg_temp.act_as_admin();
UPDATE public.users SET is_active = false WHERE id = (SELECT user_client_a FROM _test_constants);

SELECT pg_temp.act_as((SELECT user_client_a FROM _test_constants));
SELECT is(
  public.app_current_org(),
  NULL::uuid,
  'A.3 Utilisateur inactif (Client A is_active=false) : app_current_org() est NULL'
);

-- Test 4 : Utilisateur inactif -> app_current_role() devient NULL
SELECT is(
  public.app_current_role(),
  NULL::securia_user_role,
  'A.4 Utilisateur inactif : app_current_role() est NULL'
);

-- Test 5 : Utilisateur inactif tente d'appeler get_scoped_interventions_feed() -> P0001
SELECT throws_ok(
  format('SELECT * FROM public.get_scoped_interventions_feed(''%s'')', (SELECT org_client_a FROM _test_constants)),
  'P0001',
  NULL,
  'A.5 Utilisateur inactif appelant la RPC get_scoped_interventions_feed lève P0001'
);

-- Rétablissement Client A
SELECT pg_temp.act_as_admin();
UPDATE public.users SET is_active = true WHERE id = (SELECT user_client_a FROM _test_constants);

-- Test 6 : Agent désactivé sur security_agents -> app_current_agent_ids() vide
SELECT pg_temp.act_as_admin();
UPDATE public.security_agents SET is_active = false WHERE id = (SELECT agent_1 FROM _test_constants);

SELECT pg_temp.act_as((SELECT user_agent_1 FROM _test_constants));
SELECT is_empty(
  'SELECT public.app_current_agent_ids()',
  'A.6 Agent désactivé : app_current_agent_ids() est vide'
);

-- Rétablissement Agent 1
SELECT pg_temp.act_as_admin();
UPDATE public.security_agents SET is_active = true WHERE id = (SELECT agent_1 FROM _test_constants);

-- -----------------------------------------------------------------------------
-- CATÉGORIE B : CLOISONNEMENT DES AGENTS & RPC SCOPING
-- -----------------------------------------------------------------------------

-- Test 7 : Agent 1 ne voit pas les interventions assignées aux autres agents
SELECT pg_temp.act_as((SELECT user_agent_1 FROM _test_constants));
SELECT is_empty(
  format('SELECT id FROM public.interventions WHERE agent_id != ''%s''', (SELECT agent_1 FROM _test_constants)),
  'B.1 Agent 1 ne voit aucune intervention qui ne lui est pas assignée'
);

-- Test 8 : Validation p_facet dans RPC - Facette invalide -> P0001
SELECT pg_temp.act_as((SELECT user_manager_p1 FROM _test_constants));
SELECT throws_ok(
  format('SELECT * FROM public.get_scoped_interventions_feed(''%s'', ''INVALID'')', (SELECT org_provider_1 FROM _test_constants)),
  'P0001',
  NULL,
  'B.2 RPC get_scoped_interventions_feed rejette p_facet invalide avec P0001'
);

-- Test 9 : Validation p_facet dans RPC - Facette NULL -> P0001
SELECT throws_ok(
  format('SELECT * FROM public.get_scoped_interventions_feed(''%s'', NULL)', (SELECT org_provider_1 FROM _test_constants)),
  'P0001',
  NULL,
  'B.3 RPC get_scoped_interventions_feed rejette p_facet NULL avec P0001'
);

-- Test 10 : Violation cross-tenant dans RPC -> P0001
SELECT pg_temp.act_as((SELECT user_client_a FROM _test_constants));
SELECT throws_ok(
  format('SELECT * FROM public.get_scoped_interventions_feed(''%s'', ''ANY'')', (SELECT org_client_b FROM _test_constants)),
  'P0001',
  NULL,
  'B.4 Tentative cross-tenant par Client A sur org Client B lève P0001'
);

-- -----------------------------------------------------------------------------
-- CATÉGORIE C : IMMUABILITÉ DIRECTE ET INDIRECTE (ANTI-TAMPERING)
-- -----------------------------------------------------------------------------

SELECT pg_temp.act_as((SELECT user_manager_p1 FROM _test_constants));

-- Test 11 : created_by immuable à l'UPDATE -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET created_by = ''%s'' WHERE id = ''%s''', (SELECT user_client_b FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.1 Tentative de modification de created_by bloquée avec P0001'
);

-- Test 12 : organization_id immuable à l'UPDATE -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET organization_id = ''%s'' WHERE id = ''%s''', (SELECT org_client_b FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.2 Tentative de modification de organization_id bloquée avec P0001'
);

-- Test 13 : client_organization_id immuable à l'UPDATE -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET client_organization_id = ''%s'' WHERE id = ''%s''', (SELECT org_client_b FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.3 Tentative de modification de client_organization_id bloquée avec P0001'
);

-- Test 14 : provider_organization_id immuable à l'UPDATE -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET provider_organization_id = ''%s'' WHERE id = ''%s''', (SELECT org_provider_2 FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.4 Tentative de modification de provider_organization_id bloquée avec P0001'
);

-- Test 15 : Détournement indirect du prestataire via security_center_id -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET security_center_id = ''%s'' WHERE id = ''%s''', (SELECT center_p2 FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.5 Tentative de détournement indirect de prestataire via security_center_id bloquée avec P0001'
);

-- Test 16 : Détournement indirect du prestataire via agent_id -> P0001
SELECT throws_ok(
  format('UPDATE public.interventions SET agent_id = ''%s'' WHERE id = ''%s''', (SELECT agent_2 FROM _test_constants), (SELECT itv_dual FROM _test_constants)),
  'P0001',
  NULL,
  'C.6 Tentative de détournement indirect de prestataire via agent_id bloquée avec P0001'
);

-- Test 17 : Falsification de l'agent assigné sur une alerte par résident -> P0001
SELECT pg_temp.act_as((SELECT user_client_a FROM _test_constants));
SELECT throws_ok(
  format('UPDATE public.alerts SET assigned_agent_id = ''%s'' WHERE id = ''%s''', (SELECT agent_2 FROM _test_constants), (SELECT alert_a FROM _test_constants)),
  'P0001',
  NULL,
  'C.7 Modification de l''agent assigné sur une alerte par un résident bloquée avec P0001'
);

-- Test 18 : Falsification de l'organisation d'une alerte par résident -> P0001
SELECT throws_ok(
  format('UPDATE public.alerts SET organization_id = ''%s'' WHERE id = ''%s''', (SELECT org_client_b FROM _test_constants), (SELECT alert_a FROM _test_constants)),
  'P0001',
  NULL,
  'C.8 Modification de l''organisation d''une alerte par un résident bloquée avec P0001'
);

-- Test 19 : Insertion incohérente d'intervention (centre P2 pour prestataire P1) -> P0001
SELECT pg_temp.act_as((SELECT user_manager_p1 FROM _test_constants));
SELECT throws_ok(
  format('INSERT INTO public.interventions (id, client_organization_id, provider_organization_id, security_center_id, status) VALUES (gen_random_uuid(), ''%s'', ''%s'', ''%s'', ''PENDING'')',
    (SELECT org_client_a FROM _test_constants),
    (SELECT org_provider_1 FROM _test_constants),
    (SELECT center_p2 FROM _test_constants)
  ),
  'P0001',
  NULL,
  'C.9 Insertion d''une intervention incohérente (centre étranger) bloquée avec P0001'
);

-- -----------------------------------------------------------------------------
-- CATÉGORIE D : INTÉGRITÉ DU TRIGGER ACTIF v4.2
-- (Note DevSecOps : Les triggers de repli 'rollback_safe' sont testés dans la suite dédiée au rollback)
-- -----------------------------------------------------------------------------

SELECT pg_temp.act_as_admin();
SELECT has_function(
  'public',
  'trg_fn_sync_intervention_tenants_v4_2',
  'D.1 Fonction de trigger dual-tenant trg_fn_sync_intervention_tenants_v4_2 installée'
);

SELECT finish();

-- ANNULATION TRANSACTIONNELLE SYSTÉMATIQUE (GARANTIE ZÉRO PERSISTANCE)
ROLLBACK;

-- RÉINITIALISATION DE L'AUTORISATION DE SESSION
-- Exécutée après ROLLBACK pour éviter d'être bloquée par un état de transaction avortée (25P02)
RESET SESSION AUTHORIZATION;

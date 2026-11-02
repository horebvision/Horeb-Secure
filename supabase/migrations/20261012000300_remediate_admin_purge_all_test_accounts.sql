-- =============================================================================
-- SECURIA SaaS — MIGRATION ADDITIVE DE REMÉDIATION CONSOLIDÉE P0 / P1
-- Fichier : supabase/migrations/20261012000300_remediate_admin_purge_all_test_accounts.sql
-- Date : 12 Octobre 2026
-- Phase : Remédiation globale P0 / P1
--
-- RÈGLE DEVSECOPS ABSOLUE :
-- Ce script est une proposition corrective additive STRICTEMENT NON APPLIQUÉE.
-- Il neutralise de manière étanche et réversible les vulnérabilités identifiées :
-- 1. P0 : Suppression définitive de la fonction destructrice admin_purge_all_test_accounts()
-- 2. P0 : Cloisonnement strict multi-tenant de admin_delete_user_account()
-- 3. P0 : Cloisonnement multi-tenant, RBAC et masquage d'accès dans get_dispatch_map_data()
-- 4. P1 : Révocation des mutations directes sur les tables financières payments,
--         payment_transactions et fiscal_configurations avec RLS SELECT borné.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1 (P0) : SUPPRESSION DÉFINITIVE DE ADMIN_PURGE_ALL_TEST_ACCOUNTS
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname = 'admin_purge_all_test_accounts'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_purge_all_test_accounts() FROM PUBLIC, anon, authenticated';
    RAISE NOTICE 'Privilèges révoqués avec succès pour public.admin_purge_all_test_accounts()';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_purge_all_test_accounts();

-- =============================================================================
-- SECTION 2 (P0) : CLOISONNEMENT MULTI-TENANT DE ADMIN_DELETE_USER_ACCOUNT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user_account(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_caller_role securia_user_role;
  v_caller_id UUID := auth.uid();
  v_caller_org UUID;
  v_target_org UUID;
  v_target_email TEXT;
  v_is_platform_admin BOOLEAN := false;
BEGIN
  -- 1. Résolution autoritaire du contexte d'exécution (Platform Admin / service_role vs Administrateur d'organisation)
  v_is_platform_admin := public.app_is_admin_context();

  IF NOT v_is_platform_admin THEN
    -- Appelant utilisateur authentifié obligatoire
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Accès refusé : Session utilisateur non authentifiée.';
    END IF;

    -- Vérifier que l'appelant possède le rôle ADMIN actif
    SELECT role, organization_id INTO v_caller_role, v_caller_org 
    FROM public.users 
    WHERE id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL OR v_caller_role <> 'ADMIN' THEN
      RAISE EXCEPTION 'Accès refusé : Seul un administrateur actif peut supprimer un compte utilisateur.';
    END IF;

    -- Interdiction formelle de supprimer son propre compte administrateur
    IF p_target_user_id = v_caller_id THEN
      RAISE EXCEPTION 'Action impossible : Vous ne pouvez pas supprimer votre propre compte administrateur connecté.';
    END IF;
  ELSE
    -- Contexte administrateur plateforme ou service_role
    IF v_caller_id IS NOT NULL THEN
      SELECT role, organization_id INTO v_caller_role, v_caller_org 
      FROM public.users 
      WHERE id = v_caller_id AND is_active = true;

      IF p_target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Action impossible : Vous ne pouvez pas supprimer votre propre compte administrateur connecté.';
      END IF;
    END IF;
  END IF;

  -- 2. Vérifier que l'utilisateur cible existe et récupérer son organisation
  SELECT email, organization_id INTO v_target_email, v_target_org 
  FROM public.users 
  WHERE id = p_target_user_id;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Utilisateur cible introuvable.';
  END IF;

  -- 3. ÉTANCHÉITÉ MULTI-TENANT : Vérifier l'appartenance à la même organisation (sauf Platform Admin)
  IF NOT v_is_platform_admin AND (v_target_org IS NULL OR v_caller_org IS NULL OR v_target_org <> v_caller_org) THEN
    RAISE EXCEPTION 'Accès refusé : Vous ne pouvez pas supprimer un utilisateur appartenant à une autre organisation.';
  END IF;

  -- 4. Nettoyage en cascade strictement borné à p_target_user_id
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;

  DELETE FROM public.alert_events 
  WHERE actor_id = p_target_user_id 
     OR alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id);

  DELETE FROM public.interventions 
  WHERE alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id)
     OR agent_id IN (SELECT id FROM public.security_agents WHERE user_id = p_target_user_id);

  DELETE FROM public.alerts WHERE user_id = p_target_user_id;
  DELETE FROM public.site_members WHERE user_id = p_target_user_id;
  DELETE FROM public.emergency_contacts WHERE user_id = p_target_user_id;
  DELETE FROM public.protected_sites WHERE owner_id = p_target_user_id;
  DELETE FROM public.security_agents WHERE user_id = p_target_user_id;
  DELETE FROM public.users WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  -- 5. Journalisation d'audit
  INSERT INTO public.audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (
    gen_random_uuid()::text,
    COALESCE(v_caller_id::text, 'service_role'),
    'ADMIN_DELETE_USER_ACCOUNT',
    'users',
    p_target_user_id::text,
    jsonb_build_object('deleted_email', v_target_email, 'organization_id', v_target_org, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'email', v_target_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(UUID) TO authenticated, service_role;

-- =============================================================================
-- SECTION 3 (P0) : SÉCURISATION TACTIQUE DE GET_DISPATCH_MAP_DATA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_dispatch_map_data(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sites jsonb;
  v_agents jsonb;
  v_interventions jsonb;
  v_caller_id uuid := auth.uid();
  v_caller_org uuid;
  v_caller_role securia_user_role;
  v_target_org uuid := p_org_id;
  v_is_platform_admin boolean := false;
BEGIN
  -- 1. Résolution de l'organisation et contexte d'habilitation
  v_is_platform_admin := public.app_is_admin_context();
  v_caller_org := public.app_current_org();

  IF v_is_platform_admin THEN
    IF v_target_org IS NULL THEN
      v_target_org := v_caller_org;
    END IF;
  ELSE
    -- Contrôle d'authentification obligatoire pour les sessions utilisateurs standard
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Accès refusé : Authentification obligatoire pour consulter les données cartographiques.';
    END IF;

    -- Contrôle du rôle de l'appelant (Superviseurs, Admins et Agents uniquement)
    v_caller_role := public.app_current_role();
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SECURITY_MANAGER', 'AGENT') THEN
      RAISE EXCEPTION 'Accès refusé : Habilitation insuffisante pour la console tactique de dispatching.';
    END IF;

    -- Cloisonnement strict multi-tenant
    IF v_target_org IS NOT NULL AND v_target_org <> v_caller_org THEN
      RAISE EXCEPTION 'Accès refusé : Il est strictement interdit d''accéder aux coordonnées cartographiques d''une autre organisation.';
    END IF;
    v_target_org := v_caller_org;
  END IF;

  -- FAIL-CLOSED : Si aucune organisation n'est rattachée, refuser catégoriquement le déversement global
  IF v_target_org IS NULL THEN
    RETURN jsonb_build_object(
      'sites', '[]'::jsonb,
      'agents', '[]'::jsonb,
      'active_interventions', '[]'::jsonb,
      'notice', 'Aucune organisation associée au compte'
    );
  END IF;

  -- 4. Sites protégés rattachés STRICTEMENT à l'organisation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'name', ps.name,
      'site_type', ps.site_type,
      'address', ps.address,
      'city', COALESCE(ps.city, 'Abidjan'),
      'postal_code', ps.postal_code,
      'latitude', ps.latitude,
      'longitude', ps.longitude,
      'access_instructions', CASE 
        WHEN v_caller_role IN ('ADMIN', 'SECURITY_MANAGER') OR v_is_platform_admin THEN ps.access_instructions 
        ELSE NULL 
      END,
      'is_default', ps.is_default,
      'created_at', ps.created_at,
      'organization_id', ps.organization_id,
      'owner', jsonb_build_object(
        'id', u.id,
        'full_name', COALESCE(u.full_name, 'Client Sécuria'),
        'phone', u.phone,
        'email', u.email
      ),
      'has_active_alert', EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
      ),
      'active_alert', (
        SELECT jsonb_build_object(
          'id', a.id,
          'alert_number', a.alert_number,
          'type', a.type,
          'priority', a.priority,
          'status', a.status,
          'created_at', a.created_at
        )
        FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
          ORDER BY a.created_at DESC
          LIMIT 1
        )
      )
    ), '[]'::jsonb)
  INTO v_sites
  FROM public.protected_sites ps
  LEFT JOIN public.users u ON u.id = ps.owner_id
  WHERE ps.organization_id = v_target_org
    AND ps.latitude IS NOT NULL
    AND ps.longitude IS NOT NULL;

  -- 5. Agents actifs rattachés à l'organisation (colonnes réelles: current_latitude, current_longitude)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'agent_name', COALESCE(u.full_name, 'Agent Patrouille'),
      'badge_number', sa.badge_number,
      'duty_status', sa.duty_status,
      'latitude', sa.current_latitude,
      'longitude', sa.current_longitude,
      'phone', u.phone,
      'patrol_vehicle', COALESCE(sa.patrol_vehicle, 'Patrouille Securia'),
      'last_update', sa.updated_at
    )
  ), '[]'::jsonb)
  INTO v_agents
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE sa.organization_id = v_target_org
    AND sa.is_active = true
    AND u.is_active = true
    AND sa.current_latitude IS NOT NULL
    AND sa.current_longitude IS NOT NULL;

  -- 6. Interventions actives de l'organisation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'alert_id', i.alert_id,
      'alert_number', a.alert_number,
      'status', i.status,
      'type', a.type,
      'priority', a.priority,
      'created_at', i.created_at,
      'site', jsonb_build_object(
        'id', ps.id,
        'name', ps.name,
        'address', ps.address,
        'latitude', ps.latitude,
        'longitude', ps.longitude
      ),
      'agent', jsonb_build_object(
        'id', sa.id,
        'name', u.full_name,
        'badge_number', sa.badge_number,
        'latitude', sa.current_latitude,
        'longitude', sa.current_longitude
      )
    )
  ), '[]'::jsonb)
  INTO v_interventions
  FROM public.interventions i
  JOIN public.alerts a ON a.id = i.alert_id
  LEFT JOIN public.protected_sites ps ON ps.id = a.site_id
  LEFT JOIN public.security_agents sa ON sa.id = i.agent_id
  LEFT JOIN public.users u ON u.id = sa.user_id
  WHERE (a.organization_id = v_target_org OR i.client_organization_id = v_target_org OR i.provider_organization_id = v_target_org)
    AND i.status NOT IN ('COMPLETED', 'ABORTED');

  RETURN jsonb_build_object(
    'sites', v_sites,
    'agents', v_agents,
    'active_interventions', v_interventions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dispatch_map_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dispatch_map_data(uuid) TO authenticated, service_role;

-- =============================================================================
-- SECTION 4 (P1) : SÉCURISATION ET VERROUILLAGE RLS DES TABLES FINANCIÈRES
-- =============================================================================

DO $$
BEGIN
  -- 4.1 Table public.payments
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.payments TO authenticated;
    GRANT ALL ON TABLE public.payments TO service_role;

    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "payments_org_isolation" ON public.payments;
    DROP POLICY IF EXISTS "payments_select_scoped_v4_4" ON public.payments;

    CREATE POLICY "payments_select_scoped_v4_4" ON public.payments FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 4.2 Table public.payment_transactions
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_transactions') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_transactions FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.payment_transactions TO authenticated;
    GRANT ALL ON TABLE public.payment_transactions TO service_role;

    ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "payment_tx_org_isolation" ON public.payment_transactions;
    DROP POLICY IF EXISTS "payment_tx_select_scoped_v4_4" ON public.payment_transactions;

    CREATE POLICY "payment_tx_select_scoped_v4_4" ON public.payment_transactions FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 4.3 Table public.fiscal_configurations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fiscal_configurations') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.fiscal_configurations FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.fiscal_configurations TO authenticated;
    GRANT ALL ON TABLE public.fiscal_configurations TO service_role;

    ALTER TABLE public.fiscal_configurations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "fiscal_config_org_isolation" ON public.fiscal_configurations;
    DROP POLICY IF EXISTS "fiscal_config_select_scoped_v4_4" ON public.fiscal_configurations;

    CREATE POLICY "fiscal_config_select_scoped_v4_4" ON public.fiscal_configurations FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;
END $$;

-- =============================================================================
-- SECTION 5 : TRACE D'AUDIT SYSTÈME
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    INSERT INTO public.audit_logs (id, action, entity_type, entity_id, details, created_at)
    VALUES (
      gen_random_uuid()::text,
      'SECURITY_REMEDIATION_CONSOLIDATED_P0_P1_READY',
      'system_migration',
      '20261012000300',
      jsonb_build_object(
        'version', '20261012000300',
        'remediated_items', jsonb_build_array(
          'admin_purge_all_test_accounts (DROPPED)',
          'admin_delete_user_account (TENANT HARDENED)',
          'get_dispatch_map_data (RBAC + TENANT SCOPED)',
          'payments (MUTATIONS REVOKED + RLS SELECT LOCKED)',
          'payment_transactions (MUTATIONS REVOKED + RLS SELECT LOCKED)',
          'fiscal_configurations (MUTATIONS REVOKED + RLS SELECT LOCKED)'
        )
      ),
      NOW()
    );
  END IF;
END $$;

COMMIT;

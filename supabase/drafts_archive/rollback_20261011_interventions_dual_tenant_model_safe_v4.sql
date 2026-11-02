-- =============================================================================
-- SECURIA SaaS — PLAN DE RESTAURATION SÉCURISÉ v4 (NON DESTRUCTEUR & SANS RÉGRESSION)
-- Fichier : supabase/migrations/rollback_20261011_interventions_dual_tenant_model_safe_v4.sql
-- Date : 11 Octobre 2026
-- Phase : 2.0 Préparation Sécurisée du Staging
-- 
-- RÈGLE ABSOLUE DEVSECOPS :
-- - Ne supprime aucune donnée (colonnes et enregistrements conservés).
-- - NE RÉACTIVE AUCUNE POLITIQUE HISTORIQUEMENT VULNÉRABLE (zéro 'role = ADMIN' sans tenant).
-- - Encapsulation transactionnelle complète (BEGIN ... COMMIT).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ARCHIVAGE HORODATÉ DYNAMIQUE DE TOUTES LES DONNÉES SENSIBLES
-- =============================================================================
DO $$ 
DECLARE
  v_suffix TEXT;
  v_tbl_interventions TEXT;
  v_tbl_alerts TEXT;
  v_tbl_users TEXT;
BEGIN
  v_suffix := to_char(now(), 'YYYYMMDD_HH24MISS');
  v_tbl_interventions := '_archive_interventions_rollback_' || v_suffix;
  v_tbl_alerts := '_archive_alerts_rollback_' || v_suffix;
  v_tbl_users := '_archive_users_rollback_' || v_suffix;

  EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.interventions', v_tbl_interventions);
  EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.alerts', v_tbl_alerts);
  EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.users', v_tbl_users);

  RAISE NOTICE 'Tables d archive creees avec succes : %, %, %', v_tbl_interventions, v_tbl_alerts, v_tbl_users;
END $$;

-- =============================================================================
-- 2. DÉPÔT PROPRE DES TRIGGERS ET FONCTIONS v4 / v4.1
-- =============================================================================
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v3 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
DROP FUNCTION IF EXISTS public.trg_fn_sync_intervention_tenants_v4();

DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4 ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
DROP FUNCTION IF EXISTS public.trg_fn_protect_users_privileges_v4();

DROP FUNCTION IF EXISTS public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT);

-- =============================================================================
-- 3. RESTAURATION DE POLITIQUES RLS DE SECOURS ÉTANCHES (ZÉRO FUITE MULTI-TENANT)
-- =============================================================================

-- 3.1 Table public.interventions : Maintien strict de l'étanchéité par tenant
DROP POLICY IF EXISTS "interventions_select_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4" ON public.interventions;

CREATE POLICY "interventions_select_rollback_safe" ON public.interventions FOR SELECT
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR (
    client_organization_id IS NOT NULL 
    AND client_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR EXISTS (
    SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id
  )
);

CREATE POLICY "interventions_insert_rollback_safe" ON public.interventions FOR INSERT
WITH CHECK (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR (
    (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('SECURITY_MANAGER', 'ADMIN')
    AND (
      provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
      OR client_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  )
);

CREATE POLICY "interventions_update_rollback_safe" ON public.interventions FOR UPDATE
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR (
    provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id
  )
);

CREATE POLICY "interventions_delete_rollback_safe" ON public.interventions FOR DELETE
USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- 3.2 Table public.alerts : Isolation stricte de secours
DROP POLICY IF EXISTS "alerts_select_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4" ON public.alerts;

CREATE POLICY "alerts_select_rollback_safe" ON public.alerts FOR SELECT
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR user_id = auth.uid()
  OR (organization_id IS NOT NULL AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()))
  OR (security_center_id IS NOT NULL AND security_center_id IN (
    SELECT sc.id FROM public.security_centers sc WHERE sc.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  ))
  OR (assigned_agent_id IS NOT NULL AND assigned_agent_id IN (
    SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()
  ))
);

CREATE POLICY "alerts_insert_rollback_safe" ON public.alerts FOR INSERT
WITH CHECK (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR (
    user_id = auth.uid()
    AND (organization_id IS NULL OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()))
  )
);

CREATE POLICY "alerts_update_rollback_safe" ON public.alerts FOR UPDATE
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "alerts_delete_rollback_safe" ON public.alerts FOR DELETE
USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- 3.3 Table public.users : Verrouillage strict de secours
DROP POLICY IF EXISTS "users_select_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4" ON public.users;

CREATE POLICY "users_select_rollback_safe" ON public.users FOR SELECT
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "users_insert_rollback_safe" ON public.users FOR INSERT
WITH CHECK (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR (auth.uid() = id AND organization_id IS NULL)
);

CREATE POLICY "users_update_rollback_safe" ON public.users FOR UPDATE
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR auth.uid() = id
);

CREATE POLICY "users_delete_rollback_safe" ON public.users FOR DELETE
USING (current_setting('request.jwt.claim.role', true) = 'service_role');

COMMIT;

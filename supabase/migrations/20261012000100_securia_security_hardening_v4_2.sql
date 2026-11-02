-- =============================================================================
-- SECURIA SaaS — MIGRATION ARCHITECTURE MULTI-TENANT & RLS GLOBALE (VERSION 4.2)
-- Fichier : supabase/migrations/20261012000100_securia_security_hardening_v4_2.sql
-- Date : 12 Octobre 2026
-- Phase : 2.5 Corrections Ciblées Avant Validation
--
-- REMÉDIATIONS AUDIT PHASE 2.1 :
-- 1. Élimination totale des récursions RLS (42P17) via fonctions auxiliaires dédiées
--    (app_current_org, app_current_role, app_current_agent_ids, app_is_admin_context).
-- 2. Détection fiable des contextes privilégiés (service_role, postgres, platform_admins)
--    sans dépendre de GUC obsolètes ni bloquer l'onboarding applicatif.
-- 3. Verrouillage strict des factures, abonnements et clés d'API (SQL GRANTs + RLS).
-- 4. Protection des preuves : alert_id et provider_organization_id en ON DELETE RESTRICT
--    (fin du CASCADE destructeur de preuves historiques).
-- 5. Immuabilité des rattachements clients et prestataires lors des mises à jour.
-- 6. Verrouillage des alertes : le résident ne peut ni assigner ni forger d'agent/centre.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. VÉRIFICATION D'INTÉGRITÉ DU SCHÉMA
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'interventions') THEN
    RAISE EXCEPTION 'Table public.interventions absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    RAISE EXCEPTION 'Table public.organizations absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    RAISE EXCEPTION 'Table public.users absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alerts') THEN
    RAISE EXCEPTION 'Table public.alerts absente : prérequis non satisfait.';
  END IF;
END $$;

-- =============================================================================
-- 0.1 NEUTRALISATION CONTRÔLÉE DE TOUTE ANCIENNE POLITIQUE SUR LES TABLES SENSIBLES
-- Garantit qu'aucune politique permissive historique (OR) ne subsiste sur ces tables.
-- =============================================================================
DO $$
DECLARE
  v_tbl TEXT;
  v_pol RECORD;
  v_targets TEXT[] := ARRAY[
    'users', 'organizations', 'platform_admins', 'security_centers',
    'security_agents', 'alerts', 'interventions', 'invoices',
    'subscriptions', 'api_keys'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_targets LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tbl) THEN
      FOR v_pol IN (
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tbl
      ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 1. TABLE SÉCURISÉE : public.platform_admins
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated, service_role;
GRANT ALL ON TABLE public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_read_v4_2" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write_v4_2" ON public.platform_admins;

CREATE POLICY "platform_admins_read_v4_2" ON public.platform_admins FOR SELECT
USING (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
  OR user_id = auth.uid()
);

CREATE POLICY "platform_admins_write_v4_2" ON public.platform_admins FOR ALL
USING (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
)
WITH CHECK (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
);

-- =============================================================================
-- 2. FONCTIONS AUXILIAIRES SÉCURISÉES SANS RÉCURSION (SECURITY DEFINER STABLE)
-- =============================================================================

-- 2.1 Contexte privilégié (migrations, service_role, ou platform_admin certifié)
CREATE OR REPLACE FUNCTION public.app_is_admin_context()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_claims JSONB;
BEGIN
  -- Superusers et rôles administratifs internes PostgreSQL (session physique directe)
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;

  -- Rôle système service_role via PostgREST / Supabase Auth
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  BEGIN
    v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    IF v_jwt_claims IS NOT NULL AND (v_jwt_claims ->> 'role') = 'service_role' THEN
      RETURN TRUE;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- Super-administrateur de plateforme authentifié (doit être actif dans public.users)
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 
      FROM public.platform_admins pa
      JOIN public.users u ON u.id = pa.user_id
      WHERE pa.user_id = auth.uid()
        AND u.is_active = true
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_is_admin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_admin_context() TO authenticated, service_role;

-- 2.2 Super-administrateur de plateforme
CREATE OR REPLACE FUNCTION public.app_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.app_is_admin_context();
$$;

REVOKE EXECUTE ON FUNCTION public.app_is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_platform_admin() TO authenticated, service_role;

-- 2.3 Organisation de l'utilisateur courant (accès direct sans déclencher RLS externe, compte actif obligatoire)
CREATE OR REPLACE FUNCTION public.app_current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.organization_id 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_org() TO authenticated, service_role;

-- 2.4 Rôle de l'utilisateur courant (compte actif obligatoire)
CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS securia_user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.role 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_role() TO authenticated, service_role;

-- 2.5 Identifiants d'agents associés à l'utilisateur courant (agents et utilisateurs actifs uniquement)
CREATE OR REPLACE FUNCTION public.app_current_agent_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT sa.id 
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE sa.user_id = auth.uid()
    AND sa.is_active = true
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_agent_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_agent_ids() TO authenticated, service_role;

-- Compatibilité ascendante avec l'ancienne signature
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.app_is_platform_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- =============================================================================
-- 3. PROTECTION DE LA TABLE public.users CONTRE L'AUTO-ÉLÉVATION
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Opérations administratives et serveur autorisées sans restriction
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  -- 1. Auto-inscription standard (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'USER'::securia_user_role THEN
      RAISE EXCEPTION 'Action interdite : auto-inscription autorisée uniquement avec le rôle USER.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas vous auto-assigner à une organisation lors de l''inscription.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- 2. Modification de profil (UPDATE)
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4 ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4_2 ON public.users;
CREATE TRIGGER trg_protect_users_privileges_v4_2
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges_v4_2();

-- Politiques RLS sur public.users sans récursion
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Création profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
DROP POLICY IF EXISTS "Suppression profil admin" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4_2" ON public.users;

CREATE POLICY "users_select_scoped_v4_2" ON public.users FOR SELECT
USING (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "users_insert_scoped_v4_2" ON public.users FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    auth.uid() = id 
    AND role = 'USER'::securia_user_role
    AND organization_id IS NULL
  )
);

CREATE POLICY "users_update_scoped_v4_2" ON public.users FOR UPDATE
USING (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
);

CREATE POLICY "users_delete_scoped_v4_2" ON public.users FOR DELETE
USING (public.app_is_admin_context());

-- 3.1 PRÉREQUIS STRUCTUREL : COLONNES MULTI-TENANT SUR public.interventions
-- Requis en amont des politiques RLS dépendantes (organizations, alerts)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID,
ADD COLUMN IF NOT EXISTS provider_organization_id UUID,
ADD COLUMN IF NOT EXISTS organization_id UUID,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- =============================================================================
-- 4. RLS SUR public.organizations
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture organisations autorisées" ON public.organizations;
DROP POLICY IF EXISTS "Gestion organisations admin" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped_v4" ON public.organizations;
DROP POLICY IF EXISTS "organizations_write_scoped_v4" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped_v4_2" ON public.organizations;
DROP POLICY IF EXISTS "organizations_write_scoped_v4_2" ON public.organizations;

CREATE POLICY "organizations_select_scoped_v4_2" ON public.organizations FOR SELECT
USING (
  public.app_is_admin_context()
  OR id = public.app_current_org()
  OR id IN (
    SELECT i.provider_organization_id FROM public.interventions i
    WHERE i.client_organization_id = public.app_current_org()
  )
  OR id IN (
    SELECT i.client_organization_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org()
  )
);

CREATE POLICY "organizations_write_scoped_v4_2" ON public.organizations FOR ALL
USING (public.app_is_admin_context())
WITH CHECK (public.app_is_admin_context());

-- =============================================================================
-- 5. VERROUILLAGE SÉCURISÉ : FACTURES, ABONNEMENTS ET CLÉS D'API
-- =============================================================================
DO $$ BEGIN
  -- 5.1 Factures (invoices)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.invoices TO authenticated;
    GRANT ALL ON TABLE public.invoices TO service_role;

    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "invoices_org_isolation" ON public.invoices;
    DROP POLICY IF EXISTS "invoices_org_isolation_v4" ON public.invoices;
    DROP POLICY IF EXISTS "invoices_select_scoped_v4_2" ON public.invoices;

    CREATE POLICY "invoices_select_scoped_v4_2" ON public.invoices FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 5.2 Abonnements (subscriptions)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.subscriptions TO authenticated;
    GRANT ALL ON TABLE public.subscriptions TO service_role;

    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "subscriptions_org_isolation" ON public.subscriptions;
    DROP POLICY IF EXISTS "subscriptions_org_isolation_v4" ON public.subscriptions;
    DROP POLICY IF EXISTS "subscriptions_select_scoped_v4_2" ON public.subscriptions;

    CREATE POLICY "subscriptions_select_scoped_v4_2" ON public.subscriptions FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 5.3 Clés d'API (api_keys)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    REVOKE ALL ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;
    -- Révocation de key_hash pour le rôle authenticated : projection restreinte obligatoire
    GRANT SELECT (
      id, organization_id, name, key_prefix, scopes, rate_limit_per_minute,
      last_used_at, expires_at, revoked_at, created_by, created_at, updated_at
    ) ON TABLE public.api_keys TO authenticated;
    GRANT ALL ON TABLE public.api_keys TO service_role;

    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "api_keys_org_isolation" ON public.api_keys;
    DROP POLICY IF EXISTS "api_keys_org_isolation_v4" ON public.api_keys;
    DROP POLICY IF EXISTS "api_keys_select_scoped_v4_2" ON public.api_keys;

    CREATE POLICY "api_keys_select_scoped_v4_2" ON public.api_keys FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() = 'ADMIN'::securia_user_role
      )
    );
  END IF;
END $$;

-- =============================================================================
-- 6. CENTRES DE SÉCURITÉ & AGENTS (RLS SANS CYCLE)
-- =============================================================================

-- 6.1 Centres de sécurité (public.security_centers)
ALTER TABLE public.security_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture centres autorisés" ON public.security_centers;
DROP POLICY IF EXISTS "Gestion centres responsable ou admin" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped_v4" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped_v4" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped_v4_2" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped_v4_2" ON public.security_centers;

CREATE POLICY "security_centers_select_scoped_v4_2" ON public.security_centers FOR SELECT
USING (
  public.app_is_admin_context()
  OR organization_id = public.app_current_org()
  OR id IN (
    SELECT a.security_center_id FROM public.alerts a
    WHERE a.organization_id = public.app_current_org() AND a.security_center_id IS NOT NULL
  )
);

CREATE POLICY "security_centers_write_scoped_v4_2" ON public.security_centers FOR ALL
USING (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- 6.2 Agents de sécurité (public.security_agents)
ALTER TABLE public.security_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture agents autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Mise a jour agent autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Gestion agents manager admin" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_update_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_insert_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_delete_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped_v4" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_write_scoped_v4" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped_v4_2" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_write_scoped_v4_2" ON public.security_agents;

CREATE POLICY "security_agents_select_scoped_v4_2" ON public.security_agents FOR SELECT
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR organization_id = public.app_current_org()
);

CREATE POLICY "security_agents_write_scoped_v4_2" ON public.security_agents FOR ALL
USING (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- =============================================================================
-- 7. ALERTES : TRIGGER DE VALIDATION TENANT & RLS ÉTANCHE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_org UUID;
  v_caller_role securia_user_role;
  v_agent_org UUID;
  v_center_org UUID;
BEGIN
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  v_user_org := public.app_current_org();
  v_caller_role := public.app_current_role();

  IF TG_OP = 'INSERT' THEN
    -- Forcer user_id sur le contexte authentifié
    NEW.user_id := auth.uid();
    
    -- Résolution sécurisée de l'organisation cliente légitime
    IF v_user_org IS NOT NULL THEN
      -- Utilisateur affilié : forcer l'organisation cliente sur son organisation
      NEW.organization_id := v_user_org;
    ELSIF NEW.site_id IS NOT NULL THEN
      -- Utilisateur sans organisation explicite mais site déclaré : dériver depuis le site de l'appelant
      SELECT ps.organization_id INTO NEW.organization_id 
      FROM public.protected_sites ps 
      WHERE ps.id = NEW.site_id AND ps.owner_id = auth.uid();
    ELSE
      -- Résident indépendant sans organisation : organisation_id doit rester NULL
      NEW.organization_id := NULL;
    END IF;

    -- Un résident ne peut assigner ni centre de sécurité ni agent de son propre chef à la création
    IF v_caller_role = 'USER'::securia_user_role THEN
      NEW.assigned_agent_id := NULL;
      NEW.security_center_id := NULL;
    END IF;
  END IF;

  -- Vérification de cohérence agent / centre prestataire
  IF NEW.assigned_agent_id IS NOT NULL THEN
    SELECT organization_id INTO v_agent_org FROM public.security_agents WHERE id = NEW.assigned_agent_id;
    IF NEW.security_center_id IS NOT NULL THEN
      SELECT organization_id INTO v_center_org FROM public.security_centers WHERE id = NEW.security_center_id;
      IF v_agent_org IS DISTINCT FROM v_center_org THEN
        RAISE EXCEPTION 'Incohérence prestataire : l''agent assigné (%) n''appartient pas au prestataire du centre (%).',
          NEW.assigned_agent_id, NEW.security_center_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Contrôles d'intégrité et immuabilité à la mise à jour
  IF TG_OP = 'UPDATE' THEN
    -- L'organisation cliente d'une alerte est strictement immuable pour tout utilisateur non-admin
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''organisation de l''alerte.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Un résident ne peut modifier ni l'agent assigné ni le centre de sécurité
    IF v_caller_role = 'USER'::securia_user_role THEN
      IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''agent assigné à l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.security_center_id IS DISTINCT FROM OLD.security_center_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier le centre de sécurité de l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_alert_tenancy ON public.alerts;
DROP TRIGGER IF EXISTS trg_validate_alert_tenancy_v4_2 ON public.alerts;
CREATE TRIGGER trg_validate_alert_tenancy_v4_2
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2();

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture des alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alerte par résident" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alertes" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alerte autorisée" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_select_scoped_v4_2" ON public.alerts FOR SELECT
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (organization_id IS NOT NULL AND organization_id = public.app_current_org())
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

CREATE POLICY "alerts_insert_scoped_v4_2" ON public.alerts FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    user_id = auth.uid()
    AND (organization_id IS NULL OR organization_id = public.app_current_org())
  )
);

CREATE POLICY "alerts_update_scoped_v4_2" ON public.alerts FOR UPDATE
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

CREATE POLICY "alerts_delete_scoped_v4_2" ON public.alerts FOR DELETE
USING (public.app_is_admin_context());

-- =============================================================================
-- 8. INTERVENTIONS : STRUCTURE DUAL-TENANT, CONTRAINTES & PREUVES HISTORIQUES
-- =============================================================================
-- Note : L'ajout des colonnes client_organization_id, provider_organization_id,
-- organization_id, created_by et mission_type a été positionné en amont (section 3.1)
-- pour satisfaire les politiques RLS interdépendantes (organizations et alerts).

-- Rétro-remplissage sécurisé
UPDATE public.interventions i
SET client_organization_id = a.organization_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.client_organization_id IS NULL;

UPDATE public.interventions i
SET provider_organization_id = sc.organization_id
FROM public.security_centers sc
WHERE i.security_center_id = sc.id
  AND i.provider_organization_id IS NULL;

UPDATE public.interventions i
SET provider_organization_id = sa.organization_id
FROM public.security_agents sa
WHERE i.agent_id = sa.id
  AND i.provider_organization_id IS NULL;

UPDATE public.interventions
SET organization_id = COALESCE(client_organization_id, provider_organization_id)
WHERE organization_id IS NULL;

UPDATE public.interventions i
SET created_by = a.user_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.created_by IS NULL;

-- Assainissement des orphelins avant pose de contrainte
UPDATE public.interventions
SET client_organization_id = NULL
WHERE client_organization_id IS NOT NULL 
  AND client_organization_id NOT IN (SELECT id FROM public.organizations);

UPDATE public.interventions
SET provider_organization_id = NULL
WHERE provider_organization_id IS NOT NULL 
  AND provider_organization_id NOT IN (SELECT id FROM public.organizations);

-- Suppression dynamique ciblée uniquement des FK unicolonnes obsolètes
-- Protection stricte : les contraintes composites (conkey > 1) et les contraintes métier non concernées sont strictement préservées
DO $$ 
DECLARE
  r RECORD;
  v_composite_count INT := 0;
BEGIN
  -- 1. Détection et préservation explicite de toute contrainte composite éventuelle
  SELECT COUNT(DISTINCT con.conname) INTO v_composite_count
  FROM pg_constraint con
  WHERE con.conrelid = 'public.interventions'::regclass
    AND con.contype = 'f'
    AND array_length(con.conkey, 1) > 1
    AND EXISTS (
      SELECT 1 FROM pg_attribute att 
      WHERE att.attrelid = con.conrelid 
        AND att.attnum = ANY(con.conkey)
        AND att.attname IN ('client_organization_id', 'provider_organization_id', 'alert_id')
    );

  IF v_composite_count > 0 THEN
    RAISE NOTICE 'SÉCURITÉ : Préservation de % contrainte(s) composite(s) métier sur public.interventions.', v_composite_count;
  END IF;

  -- 2. Suppression uniquement des FK unicolonnes strictes sur les colonnes et tables cibles
  FOR r IN (
    SELECT DISTINCT con.conname 
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.interventions'::regclass
      AND con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND (
        (att.attname = 'alert_id' AND con.confrelid = 'public.alerts'::regclass)
        OR (att.attname = 'client_organization_id' AND con.confrelid = 'public.organizations'::regclass)
        OR (att.attname = 'provider_organization_id' AND con.confrelid = 'public.organizations'::regclass)
      )
  ) LOOP
    EXECUTE format('ALTER TABLE public.interventions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Pose explicite des contraintes : PROTECTION ABSOLUE DES PREUVES
-- 1. alert_id en ON DELETE RESTRICT (la suppression d'une alerte ne doit pas détruire l'intervention)
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_alert
FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE RESTRICT;

-- 2. client_organization_id en ON DELETE RESTRICT
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_client_organization
FOREIGN KEY (client_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- 3. provider_organization_id en ON DELETE RESTRICT (préserve la trace légale du prestataire)
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_provider_organization
FOREIGN KEY (provider_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Trigger Dual-Tenant v4.2 avec IMMUABILITÉ RENFORCÉE (DIRECTE ET INDIRECTE) lors des mises à jour
CREATE OR REPLACE FUNCTION public.trg_fn_sync_intervention_tenants_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert_org UUID;
  v_alert_center UUID;
  v_alert_agent UUID;
  v_center_org UUID;
  v_agent_org UUID;
  v_alert_center_org UUID;
  v_alert_agent_org UUID;
BEGIN
  -- 1. CONTRÔLE D'IMMUABILITÉ DES CHAMPS SOURCES DIRECTS ET HISTORIQUES (UPDATE non-admin)
  IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Action interdite : le créateur (created_by) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de rattachement (organization_id) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_organization_id IS DISTINCT FROM OLD.client_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation cliente d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.provider_organization_id IS DISTINCT FROM OLD.provider_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation prestataire d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.alert_id IS DISTINCT FROM OLD.alert_id THEN
      RAISE EXCEPTION 'Action interdite : l''alerte rattachée à une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 1.bis CONTRÔLE D'AUTHENTICITÉ DE L'AUTEUR (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF NOT public.app_is_admin_context() THEN
      IF auth.uid() IS NOT NULL THEN
        IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
          RAISE EXCEPTION 'Action interdite : usurpation d''identité interdite sur created_by.'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.created_by := auth.uid();
      ELSE
        RAISE EXCEPTION 'Action interdite : création d''intervention non authentifiée.'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- Contexte admin : préserver NEW.created_by si renseigné, sinon assigner auth.uid() si disponible
      IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
      END IF;
    END IF;
  END IF;

  -- 2. RÉSOLUTION ET VALIDATION DE L'ALERTE (CHAMP SOURCE CLIENT ET PRESTATAIRE DE BASE)
  IF NEW.alert_id IS NOT NULL THEN
    SELECT a.organization_id, a.security_center_id, a.assigned_agent_id
    INTO v_alert_org, v_alert_center, v_alert_agent
    FROM public.alerts a WHERE a.id = NEW.alert_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Alerte inexistante (%) liée à l''intervention.', NEW.alert_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence alerte <-> organisation cliente
    IF v_alert_org IS NOT NULL THEN
      IF NEW.client_organization_id IS NOT NULL AND NEW.client_organization_id IS DISTINCT FROM v_alert_org THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''organisation cliente fournie (%) ne correspond pas à celle de l''alerte (%).',
          NEW.client_organization_id, v_alert_org
          USING ERRCODE = 'P0001';
      END IF;
      NEW.client_organization_id := v_alert_org;
    END IF;
  END IF;

  -- 3. RÉSOLUTION ET VALIDATION DU CENTRE DE SÉCURITÉ
  IF NEW.security_center_id IS NOT NULL THEN
    SELECT sc.organization_id INTO v_center_org
    FROM public.security_centers sc WHERE sc.id = NEW.security_center_id;

    IF NOT FOUND OR v_center_org IS NULL THEN
      RAISE EXCEPTION 'Centre de sécurité invalide ou introuvable (%).', NEW.security_center_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence centre <-> prestataire fourni
    IF NEW.provider_organization_id IS NOT NULL AND NEW.provider_organization_id IS DISTINCT FROM v_center_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : le centre de sécurité (%) appartient au prestataire (%) et non au prestataire spécifié (%).',
        NEW.security_center_id, v_center_org, NEW.provider_organization_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Interdiction de détournement indirect du prestataire via le centre de sécurité (UPDATE non-admin)
    IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
      IF OLD.provider_organization_id IS NOT NULL AND v_center_org IS DISTINCT FROM OLD.provider_organization_id THEN
        RAISE EXCEPTION 'Action interdite : modification indirecte interdite. Le centre de sécurité (%) appartient au prestataire (%) différent du prestataire immuable (%).',
          NEW.security_center_id, v_center_org, OLD.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    NEW.provider_organization_id := v_center_org;
  END IF;

  -- 4. RÉSOLUTION ET VALIDATION DE L'AGENT ASSIGNÉ
  IF NEW.agent_id IS NOT NULL THEN
    SELECT sa.organization_id INTO v_agent_org
    FROM public.security_agents sa WHERE sa.id = NEW.agent_id;

    IF NOT FOUND OR v_agent_org IS NULL THEN
      RAISE EXCEPTION 'Agent de sécurité invalide ou introuvable (%).', NEW.agent_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence agent <-> centre de sécurité
    IF v_center_org IS NOT NULL AND v_agent_org IS DISTINCT FROM v_center_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) relève du prestataire (%) tandis que le centre (%) relève de (%).',
        NEW.agent_id, v_agent_org, NEW.security_center_id, v_center_org
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence agent <-> prestataire
    IF NEW.provider_organization_id IS NOT NULL AND NEW.provider_organization_id IS DISTINCT FROM v_agent_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) n''appartient pas au prestataire opérant (%).',
        NEW.agent_id, NEW.provider_organization_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Interdiction de détournement indirect du prestataire via l'agent (UPDATE non-admin)
    IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
      IF OLD.provider_organization_id IS NOT NULL AND v_agent_org IS DISTINCT FROM OLD.provider_organization_id THEN
        RAISE EXCEPTION 'Action interdite : modification indirecte interdite. L''agent assigné (%) appartient au prestataire (%) différent du prestataire immuable (%).',
          NEW.agent_id, v_agent_org, OLD.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    NEW.provider_organization_id := v_agent_org;
  END IF;

  -- 5. COHÉRENCE CROISÉE ALERTE <-> PRESTATAIRE / CENTRE / AGENT
  IF NEW.alert_id IS NOT NULL THEN
    IF v_alert_center IS NOT NULL THEN
      SELECT sc.organization_id INTO v_alert_center_org
      FROM public.security_centers sc WHERE sc.id = v_alert_center;

      IF v_alert_center_org IS NOT NULL AND NEW.provider_organization_id IS NOT NULL AND v_alert_center_org IS DISTINCT FROM NEW.provider_organization_id THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''alerte (%) est rattachée au centre (%) du prestataire (%) différent du prestataire d''intervention (%).',
          NEW.alert_id, v_alert_center, v_alert_center_org, NEW.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF v_alert_agent IS NOT NULL THEN
      SELECT sa.organization_id INTO v_alert_agent_org
      FROM public.security_agents sa WHERE sa.id = v_alert_agent;

      IF v_alert_agent_org IS NOT NULL AND NEW.provider_organization_id IS NOT NULL AND v_alert_agent_org IS DISTINCT FROM NEW.provider_organization_id THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''alerte (%) est assignée à l''agent (%) du prestataire (%) différent du prestataire d''intervention (%).',
          NEW.alert_id, v_alert_agent, v_alert_agent_org, NEW.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 6. VALIDATION D'IMMUABILITÉ DES VALEURS FINALES CALCULÉES (UPDATE non-admin)
  IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Action interdite : le créateur (created_by) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de rattachement (organization_id) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_organization_id IS DISTINCT FROM OLD.client_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation cliente d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.provider_organization_id IS DISTINCT FROM OLD.provider_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation prestataire d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 7. OBLIGATION D'UN ANCRAGE TENANT MINIMAL
  IF NEW.client_organization_id IS NULL AND NEW.provider_organization_id IS NULL THEN
    RAISE EXCEPTION 'Intervention invalide : une intervention doit obligatoirement être rattachée à une organisation cliente ou prestataire.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. VÉRIFICATION D'HABILITATION TENANT À LA CRÉATION POUR NON-ADMIN
  IF TG_OP = 'INSERT' AND NOT public.app_is_admin_context() THEN
    IF public.app_current_org() IS NULL OR (
      public.app_current_org() IS DISTINCT FROM NEW.provider_organization_id
      AND public.app_current_org() IS DISTINCT FROM NEW.client_organization_id
    ) THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez créer une intervention que pour votre propre organisation cliente ou prestataire.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 9. GESTION ET VALIDATION DE COHÉRENCE DE organization_id
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(NEW.client_organization_id, NEW.provider_organization_id);
  ELSIF NEW.organization_id IS DISTINCT FROM NEW.client_organization_id 
    AND NEW.organization_id IS DISTINCT FROM NEW.provider_organization_id THEN
    RAISE EXCEPTION 'Incohérence multi-tenant : l''organisation de rattachement (%) ne correspond ni au client (%) ni au prestataire (%).',
      NEW.organization_id, NEW.client_organization_id, NEW.provider_organization_id
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v3 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4_2 ON public.interventions;
CREATE TRIGGER trg_sync_intervention_tenants_v4_2
BEFORE INSERT OR UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_intervention_tenants_v4_2();

-- RLS sur public.interventions sans récursion
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interventions_select_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4_2" ON public.interventions;

CREATE POLICY "interventions_select_scoped_v4_2" ON public.interventions FOR SELECT
USING (
  public.app_is_admin_context()
  OR (
    client_organization_id IS NOT NULL 
    AND client_organization_id = public.app_current_org()
    AND public.app_current_role() != 'AGENT'
  )
  OR (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

CREATE POLICY "interventions_insert_scoped_v4_2" ON public.interventions FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    public.app_current_role() IN ('SECURITY_MANAGER', 'ADMIN')
    AND (
      provider_organization_id = public.app_current_org()
      OR client_organization_id = public.app_current_org()
    )
  )
);

CREATE POLICY "interventions_update_scoped_v4_2" ON public.interventions FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (
    provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

CREATE POLICY "interventions_delete_scoped_v4_2" ON public.interventions FOR DELETE
USING (public.app_is_admin_context());

-- =============================================================================
-- 9. PROCÉDURE RPC SÉCURISÉE : public.get_scoped_interventions_feed()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed(
  p_org_id UUID,
  p_facet TEXT DEFAULT 'ANY',
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  alert_id UUID,
  security_center_id UUID,
  agent_id UUID,
  status securia_intervention_status,
  report TEXT,
  client_organization_id UUID,
  provider_organization_id UUID,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validation stricte de la facette (valeurs admises : CLIENT, PROVIDER, ANY)
  IF p_facet IS NULL OR p_facet NOT IN ('CLIENT', 'PROVIDER', 'ANY') THEN
    RAISE EXCEPTION 'Paramètre p_facet invalide (%). Les valeurs autorisées sont CLIENT, PROVIDER ou ANY.', p_facet
      USING ERRCODE = 'P0001';
  END IF;

  -- Vérification d'isolation : l'appelant doit être admin de plateforme ou appartenir à l'org demandée
  IF NOT (public.app_is_admin_context() OR public.app_current_org() = p_org_id) THEN
    RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.alert_id,
    i.security_center_id,
    i.agent_id,
    i.status,
    i.report,
    i.client_organization_id,
    i.provider_organization_id,
    i.assigned_at,
    i.accepted_at,
    i.en_route_at,
    i.arrived_at,
    i.resolved_at,
    i.created_at,
    i.updated_at
  FROM public.interventions i
  WHERE (
    (p_facet = 'CLIENT' AND i.client_organization_id = p_org_id)
    OR (p_facet = 'PROVIDER' AND i.provider_organization_id = p_org_id)
    OR (p_facet = 'ANY' AND (i.client_organization_id = p_org_id OR i.provider_organization_id = p_org_id))
  )
  AND (p_status IS NULL OR i.status::text = p_status)
  AND (
    public.app_is_admin_context()
    OR (
      i.client_organization_id IS NOT NULL 
      AND i.client_organization_id = public.app_current_org()
      AND public.app_current_role() != 'AGENT'
    )
    OR (
      i.provider_organization_id IS NOT NULL 
      AND i.provider_organization_id = public.app_current_org()
      AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
    )
    OR i.agent_id IN (SELECT public.app_current_agent_ids())
  )
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;

COMMIT;

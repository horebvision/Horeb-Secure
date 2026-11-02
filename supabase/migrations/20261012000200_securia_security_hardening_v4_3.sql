-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.3)
-- Fichier : supabase/migrations/20261012000200_securia_security_hardening_v4_3.sql
-- Date : 12 Octobre 2026
-- Phase : 2.7C Remédiation consolidée de sécurité
--
-- MOTIVATION :
-- Pour les environnements où la migration 20261012000100_securia_security_hardening_v4_2.sql
-- a déjà été appliquée et enregistrée dans la table supabase_migrations, cette migration
-- incrémentale applique sans rupture les durcissements identifiés lors de l'audit 2.7B :
-- 1. Intégration de la clause is_active = true dans app_current_org(), app_current_role(),
--    app_current_agent_ids() et app_is_admin_context() (neutralisation des JWT orphelins).
-- 2. Validation stricte du paramètre p_facet ('CLIENT', 'PROVIDER', 'ANY') dans get_scoped_interventions_feed().
-- 3. Isolation absolue des agents rattachés à une organisation cliente (restreints à leurs interventions assignées).
-- =============================================================================

BEGIN;

-- 1. FONCTIONS AUXILIAIRES DE SÉCURITÉ AVEC CONTRÔLE is_active = true

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

  -- Super-administrateur de plateforme authentifié (compte actif obligatoire)
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

-- 2. POLITIQUE RLS SELECT SUR public.interventions

DROP POLICY IF EXISTS "interventions_select_scoped_v4_2" ON public.interventions;
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

-- 3. PROCÉDURE RPC SÉCURISÉE : public.get_scoped_interventions_feed()

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

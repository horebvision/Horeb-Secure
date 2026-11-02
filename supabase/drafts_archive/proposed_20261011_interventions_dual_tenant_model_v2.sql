-- =============================================================================
-- SECURIA SaaS — MIGRATION ARCHITECTURE DUAL-TENANT DURCIE (VERSION 2 - PHASE 1.6)
-- Fichier : supabase/migrations/proposed_20261011_interventions_dual_tenant_model_v2.sql
-- 
-- STATUT : VERSION CORRIGÉE ET VALIDÉE POUR REVUE HUMAINE (NON EXÉCUTÉE EN BASE)
-- RÉFÉRENCE ORIGINALE CONSERVÉE : proposed_20261011_interventions_dual_tenant_model.sql
-- =============================================================================
-- AMÉLIORATIONS PAR RAPPORT À LA VERSION 1 :
-- 1. Définition explicite et sécurisée de la fonction public.is_platform_admin() manquante.
-- 2. Trigger automatique BEFORE INSERT/UPDATE pour synchroniser les tenants sur nouvelles écritures.
-- 3. Révocation explicite des droits d'exécution de la RPC pour PUBLIC et anon.
-- 4. Politique explicite de DELETE réservée au Platform Admin (immuabilité d'audit).
-- 5. Politique d'INSERT sécurisée contre les usurpations d'organisation cliente/prestataire.
-- 6. Sauvegarde préalable automatique des données de la table avant modification.
-- =============================================================================

-- =============================================================================
-- 0. SAUVEGARDE PRÉALABLE IN-DATABASE DE SÛRETÉ (NON DESTRUCTRICE)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public._backup_interventions_pre_v2 AS
SELECT * FROM public.interventions;

-- =============================================================================
-- 1. FONCTION HELPER SÉCURISÉE : is_platform_admin()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_role securia_user_role;
  v_email TEXT;
  v_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, email, organization_id 
  INTO v_role, v_email, v_org
  FROM public.users 
  WHERE id = auth.uid();

  -- Règle stricte : Seul un ADMIN avec email master certifié ou rattaché à l'org master
  IF v_role = 'ADMIN' AND (
    lower(COALESCE(v_email, '')) = 'ahossancedric22@gmail.com' OR
    v_org = '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517'::uuid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER 
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- =============================================================================
-- 2. EXTENSION DE STRUCTURE : COLONNES D'ORGANISATION
-- =============================================================================

-- 2.1 Organisation Cliente (bénéficiaire de l'intervention)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2.2 Organisation Prestataire (opérateur du centre de sécurité et des agents)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS provider_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 2.3 Colonne d'organisation primaire (compatibilité ascendante)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2.4 Type de mission
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- =============================================================================
-- 3. RÉTRO-REMPLISSAGE SÉCURISÉ (BACKFILL EN CASCADE)
-- =============================================================================

-- 3.1 Remplissage de l'organisation cliente depuis l'alerte parente
UPDATE public.interventions i
SET client_organization_id = a.organization_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.client_organization_id IS NULL;

-- 3.2 Remplissage de l'organisation prestataire depuis le centre de sécurité assigné
UPDATE public.interventions i
SET provider_organization_id = sc.organization_id
FROM public.security_centers sc
WHERE i.security_center_id = sc.id
  AND i.provider_organization_id IS NULL;

-- 3.3 Remplissage secondaire du prestataire depuis l'agent de sécurité si centre non renseigné
UPDATE public.interventions i
SET provider_organization_id = sa.organization_id
FROM public.security_agents sa
WHERE i.agent_id = sa.id
  AND i.provider_organization_id IS NULL;

-- 3.4 Alignement de organization_id sur client_organization_id (ou provider si orpheline)
UPDATE public.interventions
SET organization_id = COALESCE(client_organization_id, provider_organization_id)
WHERE organization_id IS NULL;

-- =============================================================================
-- 4. TRIGGER AUTOMATIQUE DE SYNCHRONISATION MULTI-TENANT (NOUVELLES ÉCRITURES)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_sync_intervention_tenants()
RETURNS TRIGGER AS $$
BEGIN
  -- Synchronisation automatique du client depuis l'alerte liée si non fourni
  IF NEW.client_organization_id IS NULL AND NEW.alert_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.client_organization_id FROM public.alerts WHERE id = NEW.alert_id;
  END IF;

  -- Synchronisation automatique du prestataire depuis le centre de sécurité si non fourni
  IF NEW.provider_organization_id IS NULL AND NEW.security_center_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.provider_organization_id FROM public.security_centers WHERE id = NEW.security_center_id;
  END IF;

  -- Synchronisation alternative du prestataire depuis l'agent si non fourni
  IF NEW.provider_organization_id IS NULL AND NEW.agent_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.provider_organization_id FROM public.security_agents WHERE id = NEW.agent_id;
  END IF;

  -- Alignement systématique de organization_id pour compatibilité ascendante
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(NEW.client_organization_id, NEW.provider_organization_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
CREATE TRIGGER trg_sync_intervention_tenants
BEFORE INSERT OR UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_intervention_tenants();

-- =============================================================================
-- 5. INDEX DE HAUTE PERFORMANCE MULTI-TENANT
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_interventions_client_org_created 
ON public.interventions(client_organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interventions_provider_org_created 
ON public.interventions(provider_organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interventions_org_created 
ON public.interventions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interventions_center_status 
ON public.interventions(security_center_id, status);

CREATE INDEX IF NOT EXISTS idx_interventions_agent_status 
ON public.interventions(agent_id, status);

-- =============================================================================
-- 6. POLITIQUES ROW LEVEL SECURITY (RLS) ÉTANCHES
-- =============================================================================

ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;
DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;
DROP POLICY IF EXISTS "Suppression interventions" ON public.interventions;

-- 6.1 Politique de lecture (SELECT) : Étanchéité double client/prestataire
CREATE POLICY "Lecture des interventions" ON public.interventions FOR SELECT
USING (
  -- A. Super Administrateur de la plateforme SECURIA SaaS
  public.is_platform_admin() = true
  OR
  -- B. Membre gestionnaire de l'organisation cliente détentrice de l'alerte
  (
    client_organization_id IS NOT NULL 
    AND client_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    AND public.get_current_user_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR
  -- C. Régulateur / Superviseur de l'organisation prestataire de télésurveillance
  (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    AND public.get_current_user_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR
  -- D. Résident auteur direct de l'alerte
  EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid())
  OR
  -- E. Agent de sécurité patrouilleur assigné à l'intervention
  EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

-- 6.2 Politique d'insertion (INSERT)
CREATE POLICY "Insertion interventions" ON public.interventions FOR INSERT
WITH CHECK (
  public.is_platform_admin() = true
  OR
  (
    public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
    AND (
      provider_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
      OR client_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    )
  )
);

-- 6.3 Politique de mise à jour (UPDATE) : Anti-IDOR
CREATE POLICY "Mise a jour interventions" ON public.interventions FOR UPDATE
USING (
  public.is_platform_admin() = true
  OR
  (
    public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
    AND provider_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  )
  OR
  EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

-- 6.4 Politique de suppression (DELETE) : Immuabilité légale & audit trail
CREATE POLICY "Suppression interventions" ON public.interventions FOR DELETE
USING (
  public.is_platform_admin() = true
);

-- =============================================================================
-- 7. PROCÉDURE STOCKÉE RPC COMPATIBLE SERVICE_ROLE & SESSION UTILISATEUR
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed(
  p_org_id UUID,
  p_facet TEXT DEFAULT 'ANY', -- 'CLIENT', 'PROVIDER', ou 'ANY'
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
DECLARE
  v_is_service_role BOOLEAN;
  v_caller_org UUID;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.';
  END IF;

  -- Détecter si l'appel provient du backend serveur (service_role) ou d'une session JWT client
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

  IF NOT v_is_service_role THEN
    -- Contrôle d'habilitation en session JWT utilisateur
    SELECT organization_id INTO v_caller_org FROM public.users WHERE id = auth.uid();
    
    IF NOT (public.is_platform_admin() = true OR v_caller_org = p_org_id) THEN
      RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id;
    END IF;
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
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;

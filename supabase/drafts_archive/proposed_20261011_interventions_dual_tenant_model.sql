-- =============================================================================
-- SECURIA SaaS — PROPOSITION DE MIGRATION ARCHITECTURE MULTI-TENANT (PHASE 1.4)
-- Date : 11 Octobre 2026
-- Fichier : supabase/migrations/proposed_20261011_interventions_dual_tenant_model.sql
-- 
-- STATUT : PROPOSITION FORMELLE POUR VALIDATION HUMAINE (NON EXÉCUTÉE EN BASE)
-- =============================================================================
-- OBJECTIF :
-- Modéliser avec précision le double ancrage organisationnel des interventions :
-- 1. Organisation Cliente (bénéficiaire de la protection, résident / entreprise cliente)
-- 2. Organisation Prestataire (société de télésurveillance opérant le SOC et les agents)
-- Éliminer les fuites de données cross-tenant tout en garantissant aux régulateurs
-- du centre de sécurité l'accès légitime aux interventions qu'ils pilotent.
-- =============================================================================

-- =============================================================================
-- 1. EXTENSION DE STRUCTURE : COLONNES D'ORGANISATION SUR INTERVENTIONS
-- =============================================================================

-- 1.1 Organisation Cliente (bénéficiaire de l'intervention)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 1.2 Organisation Prestataire (opérateur du centre de sécurité et des agents)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS provider_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 1.3 Colonne d'organisation primaire (compatibilité ascendante avec filtres standard)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 1.4 Type d'intervention (permet de distinguer réponse sur alerte vs patrouille de routine orpheline)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- =============================================================================
-- 2. RÉTRO-REMPLISSAGE SÉCURISÉ (BACKFILL EN CASCADE)
-- =============================================================================

-- 2.1 Remplissage de l'organisation cliente depuis l'alerte parente
UPDATE public.interventions i
SET client_organization_id = a.organization_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.client_organization_id IS NULL;

-- 2.2 Remplissage de l'organisation prestataire depuis le centre de sécurité assigné
UPDATE public.interventions i
SET provider_organization_id = sc.organization_id
FROM public.security_centers sc
WHERE i.security_center_id = sc.id
  AND i.provider_organization_id IS NULL;

-- 2.3 Remplissage secondaire du prestataire depuis l'agent de sécurité si centre non renseigné
UPDATE public.interventions i
SET provider_organization_id = sa.organization_id
FROM public.security_agents sa
WHERE i.agent_id = sa.id
  AND i.provider_organization_id IS NULL;

-- 2.4 Alignement de organization_id sur client_organization_id (ou provider si orpheline sans alerte)
UPDATE public.interventions
SET organization_id = COALESCE(client_organization_id, provider_organization_id)
WHERE organization_id IS NULL;

-- =============================================================================
-- 3. INDEX DE HAUTE PERFORMANCE MULTI-TENANT
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
-- 4. POLITIQUES ROW LEVEL SECURITY (RLS) ÉTANCHES
-- =============================================================================

ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;
DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;

-- 4.1 Politique de lecture (SELECT) : Étanchéité double client/prestataire
CREATE POLICY "Lecture des interventions" ON public.interventions FOR SELECT
USING (
  -- A. Super Administrateur de la plateforme SECURIA SaaS
  public.is_platform_admin() = true
  OR
  -- B. Membre de l'organisation cliente détentrice de l'alerte
  (client_organization_id IS NOT NULL AND client_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  OR
  -- C. Régulateur / Superviseur de l'organisation prestataire de télésurveillance
  (provider_organization_id IS NOT NULL AND provider_organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  OR
  -- D. Résident auteur direct de l'alerte
  EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid())
  OR
  -- E. Agent de sécurité patrouilleur assigné à l'intervention
  EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

-- 4.2 Politique d'insertion (INSERT)
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

-- 4.3 Politique de mise à jour (UPDATE)
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

-- =============================================================================
-- 5. PROCÉDURE STOCKÉE RPC COMPATIBLE SERVICE_ROLE & SESSION UTILISATEUR
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

-- =============================================================================
-- 6. PLAN DE RETOUR ARRIÈRE (ROLLBACK PLAN)
-- =============================================================================
-- En cas de nécessité d'annulation de cette migration sur une base où elle aurait été exécutée :
--
-- DROP FUNCTION IF EXISTS public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT);
-- DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;
-- DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;
-- DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
-- DROP INDEX IF EXISTS idx_interventions_agent_status;
-- DROP INDEX IF EXISTS idx_interventions_center_status;
-- DROP INDEX IF EXISTS idx_interventions_org_created;
-- DROP INDEX IF EXISTS idx_interventions_provider_org_created;
-- DROP INDEX IF EXISTS idx_interventions_client_org_created;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS mission_type;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS provider_organization_id;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS client_organization_id;

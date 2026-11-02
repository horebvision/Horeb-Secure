-- =============================================================================
-- PROPOSITION DE MIGRATION (NON EXÉCUTÉE - POUR VALIDATION HUMAINE)
-- Date : 10 Octobre 2026
-- Phase : 1.3 Architecture Data & RLS Interventions
-- =============================================================================
-- OBJECTIF :
-- Doter la table public.interventions d'une colonne organization_id native
-- et d'une politique RLS étanche, afin d'éliminer toute dépendance aux jointures
-- indirectes et de garantir l'étanchéité multi-tenant au niveau PostgreSQL.
-- =============================================================================

-- 1. Ajout de la colonne organization_id directe sur interventions
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Rétro-remplissage (backfill) sécurisé depuis les alertes parentes
UPDATE public.interventions i
SET organization_id = a.organization_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.organization_id IS NULL;

-- 3. Rétro-remplissage secondaire pour les interventions orphelines via security_centers
UPDATE public.interventions i
SET organization_id = sc.organization_id
FROM public.security_centers sc
WHERE i.security_center_id = sc.id
  AND i.organization_id IS NULL;

-- 4. Index de performance pour les filtres et la pagination multi-tenant
CREATE INDEX IF NOT EXISTS idx_interventions_organization_id_created_at 
ON public.interventions(organization_id, created_at DESC);

-- 5. Durcissement des politiques Row Level Security (RLS)
DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;

CREATE POLICY "Lecture des interventions" ON public.interventions FOR SELECT
USING (
  -- Super Admin Plateforme : accès de supervision
  public.is_platform_admin() = true
  OR
  -- Membre de l'organisation détentrice de l'intervention
  organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  OR
  -- Résident auteur de l'alerte
  EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid())
  OR
  -- Agent assigné à l'intervention
  EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

-- 6. Procédure stockée RPC dédiée et paginée pour les API v1
CREATE OR REPLACE FUNCTION public.get_organization_interventions(
  p_org_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  alert_id UUID,
  security_center_id UUID,
  agent_id UUID,
  status securia_intervention_status,
  report TEXT,
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
  -- Contrôle de sécurité : l'appelant doit appartenir à l'organisation ou être Super Admin
  IF NOT (
    public.is_platform_admin() = true OR 
    (SELECT organization_id FROM public.users WHERE id = auth.uid()) = p_org_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id;
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.alert_id,
    i.security_center_id,
    i.agent_id,
    i.status,
    i.report,
    i.assigned_at,
    i.accepted_at,
    i.en_route_at,
    i.arrived_at,
    i.resolved_at,
    i.created_at,
    i.updated_at
  FROM public.interventions i
  WHERE i.organization_id = p_org_id
    AND (p_status IS NULL OR i.status::text = p_status)
  ORDER BY i.created_at DESC
  LIMIT LEAST(p_limit, 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

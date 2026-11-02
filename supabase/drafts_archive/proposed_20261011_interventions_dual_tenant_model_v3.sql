-- =============================================================================
-- SECURIA SaaS — MIGRATION ARCHITECTURE MULTI-TENANT & RLS GLOBALE (VERSION 3)
-- Fichier : supabase/migrations/proposed_20261011_interventions_dual_tenant_model_v3.sql
-- Date : 11 Octobre 2026
-- Phase : 1.8 Remédiation Globale RLS, RBAC & Isolation Multi-Tenant
-- 
-- STATUT : PROPOSITION FORMELLE POUR VALIDATION HUMAINE (NON EXÉCUTÉE EN BASE)
-- =============================================================================
-- OBJECTIF MAJEUR :
-- 1. Éliminer définitivement l'élévation de privilèges sur public.users.
-- 2. Refondre is_platform_admin() sur une table serveur dédiée (platform_admins) 
--    et sur auth.users.app_metadata (aucun email ou UUID hardcodé).
-- 3. Sécuriser intégralement les politiques RLS sur TOUTES les tables sensibles :
--    - public.users
--    - public.organizations
--    - public.security_centers
--    - public.security_agents
--    - public.alerts
--    - public.interventions
--    Élimination de toutes les clauses globales "OR role = 'ADMIN'" non scopées.
-- 4. Modèle dual-tenant pour interventions avec trigger anti-falsification, 
--    gestion explicite des patrouilles orphelines et intégrité ON DELETE RESTRICT.
-- 5. Procédure RPC get_scoped_interventions_feed avec validation stricte.
-- =============================================================================

-- =============================================================================
-- 0. TABLE D'HABILITATION DE SÉCURITÉ SERVEUR : platform_admins
-- =============================================================================
-- Table dédiée aux Super Administrateurs de la Plateforme SECURIA SaaS.
-- Cette table est protégée : AUCUN utilisateur client ne peut y écrire via PostgREST.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write" ON public.platform_admins;

-- Seul le service_role ou un platform_admin existant peut lire cette table
CREATE POLICY "platform_admins_read" ON public.platform_admins FOR SELECT
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR user_id = auth.uid()
);

-- Seul le service_role (console serveur) peut attribuer ce privilège
CREATE POLICY "platform_admins_write" ON public.platform_admins FOR ALL
USING (current_setting('request.jwt.claim.role', true) = 'service_role')
WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- =============================================================================
-- 1. FONCTION HELPER CENTRALISÉE : public.is_platform_admin()
-- =============================================================================
-- Source de vérité robuste :
-- A. Vérification de la table certifiée public.platform_admins
-- B. OU Vérification des claims app_metadata du JWT (gérés côté serveur uniquement)
-- C. ZÉRO email hardcodé, ZÉRO UUID client hardcodé.

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Service role serveur
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- 2. Vérification dans la table certifiée platform_admins
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;

  -- 3. Vérification des app_metadata dans le JWT Supabase Auth (inviolables côté client)
  IF COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_platform_admin')::boolean,
    false
  ) = true THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER 
SET search_path = public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- =============================================================================
-- 2. VERROUILLAGE ET SÉCURISATION DE LA TABLE : public.users
-- =============================================================================

-- 2.1 Trigger de protection des colonnes sensibles (Anti-Élévation de Privilège)
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'appelant est service_role ou platform_admin certifié, modification autorisée
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Interdiction formelle pour un utilisateur de modifier son rôle ou son organisation
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.';
  END IF;

  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.';
  END IF;

  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.';
  END IF;

  -- Préservation immuable de l'identifiant et de l'email auth
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
CREATE TRIGGER trg_protect_users_privileges
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges();

-- 2.2 RLS étanche sur public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Création profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
DROP POLICY IF EXISTS "Suppression profil admin" ON public.users;

-- Lecture : propre profil, même organisation (pour managers/admins de tenant), ou platform admin
CREATE POLICY "users_select_scoped" ON public.users FOR SELECT
USING (
  public.is_platform_admin()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  -- Un agent de patrouille assigné peut lire le profil de contact du résident sur son alerte
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    JOIN public.alerts a ON a.id = i.alert_id
    JOIN public.security_agents sa ON sa.id = i.agent_id
    WHERE sa.user_id = auth.uid() AND a.user_id = public.users.id
  )
);

-- Insertion : Inscription de son propre compte avec rôle borné à USER, ou création par Platform Admin
CREATE POLICY "users_insert_scoped" ON public.users FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    auth.uid() = id 
    AND role = 'USER'::securia_user_role
  )
);

-- Mise à jour : Son propre profil (champs permis filtrés par trigger), ou gestion tenant par Admin
CREATE POLICY "users_update_scoped" ON public.users FOR UPDATE
USING (
  public.is_platform_admin()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
  )
);

-- Suppression : Platform Admin uniquement
CREATE POLICY "users_delete_scoped" ON public.users FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 3. RLS ÉTANCHE SUR : public.organizations
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture organisations autorisées" ON public.organizations;
DROP POLICY IF EXISTS "Gestion organisations admin" ON public.organizations;

CREATE POLICY "organizations_select_scoped" ON public.organizations FOR SELECT
USING (
  public.is_platform_admin()
  OR id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
);

CREATE POLICY "organizations_insert_scoped" ON public.organizations FOR INSERT
WITH CHECK (public.is_platform_admin());

CREATE POLICY "organizations_update_scoped" ON public.organizations FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
  )
);

CREATE POLICY "organizations_delete_scoped" ON public.organizations FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 4. RLS ÉTANCHE SUR : public.security_centers
-- =============================================================================

ALTER TABLE public.security_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture centres autorisés" ON public.security_centers;
DROP POLICY IF EXISTS "Gestion centres responsable ou admin" ON public.security_centers;

CREATE POLICY "security_centers_select_scoped" ON public.security_centers FOR SELECT
USING (
  public.is_platform_admin()
  -- Membre de l'organisation prestataire gestionnaire du centre
  OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  -- Ou client ayant une alerte/intervention activement prise en charge par ce centre
  OR EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.security_center_id = public.security_centers.id
      AND a.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  )
);

CREATE POLICY "security_centers_write_scoped" ON public.security_centers FOR ALL
USING (
  public.is_platform_admin()
  OR (
    organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- =============================================================================
-- 5. RLS ÉTANCHE SUR : public.security_agents
-- =============================================================================

ALTER TABLE public.security_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture agents autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Mise a jour agent autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Gestion agents manager admin" ON public.security_agents;

-- Lecture des agents : Pas d'espionnage inter-prestataires
CREATE POLICY "security_agents_select_scoped" ON public.security_agents FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  -- Un résident dont l'alerte a cet agent assigné peut voir l'agent sur la carte
  OR EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.assigned_agent_id = public.security_agents.id
      AND (a.user_id = auth.uid() OR a.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()))
  )
);

-- Mise à jour : L'agent pour sa position/statut, ou manager/admin du même prestataire
CREATE POLICY "security_agents_update_scoped" ON public.security_agents FOR UPDATE
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR (
    organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "security_agents_insert_scoped" ON public.security_agents FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "security_agents_delete_scoped" ON public.security_agents FOR DELETE
USING (
  public.is_platform_admin()
  OR (
    organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
  )
);

-- =============================================================================
-- 6. RLS ÉTANCHE SUR : public.alerts
-- =============================================================================

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alerte par résident" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alertes" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alerte autorisée" ON public.alerts;

-- SELECT : Cloisonné par organisation cliente, prestataire assigné, ou auteur
CREATE POLICY "alerts_select_scoped" ON public.alerts FOR SELECT
USING (
  public.is_platform_admin()
  -- Auteur direct de l'alerte
  OR user_id = auth.uid()
  -- Membre de l'organisation cliente détentrice de l'alerte
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  )
  -- Prestataire mandaté via son centre de sécurité
  OR (
    security_center_id IS NOT NULL
    AND security_center_id IN (
      SELECT sc.id FROM public.security_centers sc 
      WHERE sc.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  )
  -- Agent de sécurité assigné à l'alerte
  OR (
    assigned_agent_id IS NOT NULL
    AND assigned_agent_id IN (
      SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()
    )
  )
);

-- INSERT : Résident auteur ou manager de son organisation
CREATE POLICY "alerts_insert_scoped" ON public.alerts FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    user_id = auth.uid()
    AND (
      organization_id IS NULL 
      OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  )
);

-- UPDATE : Gestionnaire de l'organisation cliente ou superviseur/agent assigné
CREATE POLICY "alerts_update_scoped" ON public.alerts FOR UPDATE
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR (
    security_center_id IS NOT NULL
    AND security_center_id IN (
      SELECT sc.id FROM public.security_centers sc 
      WHERE sc.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  )
  OR (
    assigned_agent_id IS NOT NULL
    AND assigned_agent_id IN (
      SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()
    )
  )
);

CREATE POLICY "alerts_delete_scoped" ON public.alerts FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 7. STRUCTURE DUAL-TENANT DURCIE : public.interventions
-- =============================================================================

-- 7.1 Colonnes dual-tenant avec ON DELETE RESTRICT (Protection juridique)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS provider_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- 7.2 Rétro-remplissage sécurisé (Backfill)
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

-- 7.3 Trigger Anti-Falsification et Synchronisation Multi-Tenant v3
CREATE OR REPLACE FUNCTION public.trg_fn_sync_intervention_tenants_v3()
RETURNS TRIGGER AS $$
DECLARE
  v_alert_org UUID;
  v_center_org UUID;
  v_agent_org UUID;
BEGIN
  -- RÈGLE 1 : Si alert_id est renseigné, l'organisation cliente DOIT être celle de l'alerte
  IF NEW.alert_id IS NOT NULL THEN
    SELECT a.organization_id INTO v_alert_org FROM public.alerts a WHERE a.id = NEW.alert_id;
    
    IF v_alert_org IS NOT NULL THEN
      -- Écrasement impératif de toute valeur forgée
      NEW.client_organization_id := v_alert_org;
    END IF;
  END IF;

  -- RÈGLE 2 : Si security_center_id est renseigné, l'organisation prestataire est déduite du centre
  IF NEW.security_center_id IS NOT NULL THEN
    SELECT sc.organization_id INTO v_center_org FROM public.security_centers sc WHERE sc.id = NEW.security_center_id;
    
    IF v_center_org IS NOT NULL THEN
      NEW.provider_organization_id := v_center_org;
    END IF;
  END IF;

  -- RÈGLE 3 : Si agent_id est renseigné mais pas de centre, déduire du prestataire de l'agent
  IF NEW.agent_id IS NOT NULL THEN
    SELECT sa.organization_id INTO v_agent_org FROM public.security_agents sa WHERE sa.id = NEW.agent_id;
    
    IF NEW.provider_organization_id IS NULL AND v_agent_org IS NOT NULL THEN
      NEW.provider_organization_id := v_agent_org;
    ELSIF NEW.provider_organization_id IS NOT NULL AND v_agent_org IS DISTINCT FROM NEW.provider_organization_id THEN
      -- Alerte d'incohérence : l'agent assigné n'appartient pas au prestataire opérant
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) n''appartient pas à l''organisation prestataire (%).',
        NEW.agent_id, NEW.provider_organization_id;
    END IF;
  END IF;

  -- RÈGLE 4 : Rejet des enregistrements complètement orphelins
  IF NEW.client_organization_id IS NULL AND NEW.provider_organization_id IS NULL THEN
    RAISE EXCEPTION 'Intervention invalide : une intervention doit obligatoirement être rattachée à une organisation cliente ou prestataire.';
  END IF;

  -- RÈGLE 5 : Alignement rétro-compatible
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(NEW.client_organization_id, NEW.provider_organization_id);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v3 ON public.interventions;
CREATE TRIGGER trg_sync_intervention_tenants_v3
BEFORE INSERT OR UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_intervention_tenants_v3();

-- 7.4 Index de performance
CREATE INDEX IF NOT EXISTS idx_interventions_client_org_v3 
ON public.interventions(client_organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interventions_provider_org_v3 
ON public.interventions(provider_organization_id, created_at DESC);

-- 7.5 Politiques RLS durcies sur public.interventions
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;
DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;
DROP POLICY IF EXISTS "Suppression interventions" ON public.interventions;

-- SELECT : Étancheité double client / prestataire / agent / résident
CREATE POLICY "interventions_select_scoped_v3" ON public.interventions FOR SELECT
USING (
  public.is_platform_admin()
  -- Organisation cliente
  OR (
    client_organization_id IS NOT NULL 
    AND client_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  -- Organisation prestataire
  OR (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  -- Résident auteur de l'alerte liée
  OR EXISTS (
    SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid()
  )
  -- Agent patrouilleur assigné à la mission
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id
  )
);

-- INSERT : Uniquement les superviseurs ou administrateurs légitimes
CREATE POLICY "interventions_insert_scoped_v3" ON public.interventions FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('SECURITY_MANAGER', 'ADMIN')
    AND (
      provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
      OR client_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  )
);

-- UPDATE : Prestataire opérant ou agent assigné (Anti-IDOR)
CREATE POLICY "interventions_update_scoped_v3" ON public.interventions FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('SECURITY_MANAGER', 'ADMIN')
  )
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id
  )
);

-- DELETE : Strictement réservé au Platform Admin (Immuabilité légale)
CREATE POLICY "interventions_delete_scoped_v3" ON public.interventions FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 8. PROCÉDURE RPC SÉCURISÉE : public.get_scoped_interventions_feed()
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
DECLARE
  v_is_service_role BOOLEAN;
  v_caller_org UUID;
BEGIN
  -- 1. Validation obligatoire de l'argument organisation
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.';
  END IF;

  -- 2. Détection du contexte d'appel
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

  IF NOT v_is_service_role THEN
    -- Contrôle d'habilitation en session JWT utilisateur
    SELECT u.organization_id INTO v_caller_org FROM public.users u WHERE u.id = auth.uid();
    
    IF NOT (public.is_platform_admin() OR v_caller_org = p_org_id) THEN
      RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id;
    END IF;
  END IF;

  -- 3. Requête strictement filtrée
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

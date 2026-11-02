-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.6)
-- Fichier : supabase/migrations/20261012000600_harden_users_self_reactivation_and_alerts_mutations.sql
-- Date : 14 Octobre 2026
-- Phase : 2AC Durcissement de l'auto-réactivation dans public.users et des mutations sur public.alerts
--
-- MOTIVATIONS DE SÉCURITÉ (Audit Phase 2AB) :
-- 1. Risque 1 (public.users) :
--    Un compte utilisateur désactivé (is_active = false) conservant un JWT valide
--    pouvait exploiter la branche 'auth.uid() = id' de la politique RLS UPDATE pour
--    modifier sa propre ligne sans vérification d'état actif.
--    Le trigger 'trg_fn_protect_users_privileges_v4_2()' ne contrôlait pas 'is_active',
--    permettant à un utilisateur désactivé de s'auto-réactiver (is_active = true).
--
-- 2. Risque 2 (public.alerts) :
--    - INSERT : La politique 'alerts_insert_scoped_v4_2' permettait à un compte inactif
--      d'insérer une alerte avec 'organization_id = NULL' car 'user_id = auth.uid()'
--      ne vérifiait pas 'public.app_current_role() IS NOT NULL'.
--    - UPDATE : La politique 'alerts_update_scoped_v4_2' permettait à un compte inactif
--      de modifier ses alertes via 'user_id = auth.uid()'. Le trigger 'trg_fn_validate_alert_tenancy_v4_2'
--      contournait ses contrôles de résident car 'v_caller_role' était NULL.
--
-- REMÉDIATIONS APPORTÉES :
-- 1. Redéfinition de 'public.trg_fn_protect_users_privileges_v4_2()' :
--    - Interdit formellement à un utilisateur de modifier son propre statut d'activation (auth.uid() = OLD.id).
--    - Interdit la modification de 'is_active' pour tout appelant non-administrateur d'organisation actif.
--    - Restreint les modifications de statut d'un administrateur d'organisation à son propre tenant.
--    - Préserve l'accès des administrateurs de plateforme et contextes serveur (app_is_admin_context()).
-- 2. Redéfinition de la politique 'users_update_scoped_v4_2' sur public.users :
--    - Exige '(auth.uid() = id AND public.app_current_role() IS NOT NULL)' en USING et WITH CHECK.
-- 3. Redéfinition de la politique 'alerts_insert_scoped_v4_2' sur public.alerts :
--    - Exige 'public.app_current_role() IS NOT NULL' pour la branche propriétaire.
-- 4. Redéfinition de la politique 'alerts_update_scoped_v4_2' sur public.alerts :
--    - Exige 'public.app_current_role() IS NOT NULL' pour la branche propriétaire.
--    - Définit une clause WITH CHECK symétrique stricte.
-- 5. Redéfinition de 'public.trg_fn_validate_alert_tenancy_v4_2()' :
--    - Rejette immédiatement (fail-closed P0001) tout utilisateur authentifié dont le rôle actif est NULL.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DURCISSEMENT DU TRIGGER DE PRIVILÈGES UTILISATEUR (public.users)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Opérations administratives plateforme et serveur autorisées sans restriction
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
  -- 2.1 Verrouillage strict de l'auto-réactivation et modifications de statut d'activation
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    -- Règle A : Un utilisateur ne peut jamais modifier son propre statut d'activation
    -- Règle B : Seul un administrateur d'organisation actif peut modifier le statut d'un tiers dans son propre tenant
    IF auth.uid() = OLD.id 
       OR public.app_current_role() IS DISTINCT FROM 'ADMIN'::securia_user_role
       OR public.app_current_org() IS NULL
       OR OLD.organization_id IS NULL
       OR OLD.organization_id IS DISTINCT FROM public.app_current_org() THEN
      RAISE EXCEPTION 'Action interdite : vous ne disposez pas des privilèges nécessaires pour modifier ce statut d''activation.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2.2 Immuabilité du rôle utilisateur pour tout non-superadmin
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.3 Immuabilité de l'organisation de rattachement pour tout non-superadmin
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.4 Immuabilité du centre de sécurité pour tout non-superadmin
  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.5 Préservation des identifiants et horodatage
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4_2 ON public.users;
CREATE TRIGGER trg_protect_users_privileges_v4_2
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges_v4_2();

-- -----------------------------------------------------------------------------
-- 2. DURCISSEMENT DE LA POLITIQUE RLS UPDATE SUR public.users
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_scoped_v4_2" ON public.users;

CREATE POLICY "users_update_scoped_v4_2" ON public.users FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (auth.uid() = id AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (auth.uid() = id AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
);

-- -----------------------------------------------------------------------------
-- 3. DURCISSEMENT DU TRIGGER DE VALIDATION TENANT DES ALERTES (public.alerts)
-- -----------------------------------------------------------------------------
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

  v_caller_role := public.app_current_role();
  v_user_org := public.app_current_org();

  -- Contrôle fail-closed : tout utilisateur authentifié dont le compte est inactif ou sans rôle actif est rejeté
  IF auth.uid() IS NOT NULL AND v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : compte utilisateur inactif ou non habilité pour la gestion des alertes.'
      USING ERRCODE = 'P0001';
  END IF;

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

DROP TRIGGER IF EXISTS trg_validate_alert_tenancy_v4_2 ON public.alerts;
CREATE TRIGGER trg_validate_alert_tenancy_v4_2
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2();

-- -----------------------------------------------------------------------------
-- 4. DURCISSEMENT DES POLITIQUES RLS DE MUTATION SUR public.alerts
-- -----------------------------------------------------------------------------

-- 4.1 INSERT sur public.alerts
DROP POLICY IF EXISTS "alerts_insert_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_insert_scoped_v4_2" ON public.alerts FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    user_id = auth.uid()
    AND public.app_current_role() IS NOT NULL
    AND (organization_id IS NULL OR organization_id = public.app_current_org())
  )
);

-- 4.2 UPDATE sur public.alerts
DROP POLICY IF EXISTS "alerts_update_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_update_scoped_v4_2" ON public.alerts FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
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
)
WITH CHECK (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
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

COMMIT;

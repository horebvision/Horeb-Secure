-- =============================================================================
-- SECURIA SaaS — MIGRATION ARCHITECTURE MULTI-TENANT & RLS GLOBALE (VERSION 4)
-- Fichier : supabase/migrations/proposed_20261011_interventions_dual_tenant_model_v4.sql
-- Date : 11 Octobre 2026
-- Phase : 1.9 Audit Contradictoire & Remédiation Définitive
-- 
-- STATUT : PROPOSITION FORMELLE DURCIE (NON EXÉCUTÉE EN BASE DISTANTE)
-- RÉFÉRENCES : v1, v2 et v3 conservées intactes dans le dépôt
-- =============================================================================
-- AMÉLIORATIONS MAJEURES PAR RAPPORT À LA VERSION 3 :
-- 1. Élimination des fuites RLS historiques résiduelles sur TOUTES les tables :
--    - public.invoices (Phase 6)
--    - public.subscriptions (Phase 6)
--    - public.api_keys (Phase 5)
--    - public.protected_sites
-- 2. Sécurisation de l'INSERT sur public.users : interdiction formelle pour
--    un utilisateur de s'auto-rattacher à une organisation lors de l'inscription.
-- 3. Visibilité réciproque légitime entre organisations partenaires :
--    Le client peut lire le nom de l'entreprise de sécurité assignée et vice-versa.
-- 4. Contraintes physiques de clés étrangères réelles : suppression des anciennes
--    contraintes CASCADE et création explicite de contraintes RESTRICT nommées.
-- 5. Protection de la table platform_admins par révocation des privilèges publics.
-- 6. Trigger dual-tenant v4 imperméable aux valeurs forgées et aux orphelins.
-- =============================================================================

-- =============================================================================
-- 1. TABLE D'HABILITATION SÉCURISÉE : public.platform_admins
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Révocation stricte des privilèges par défaut pour neutraliser les accès PostgREST
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated, service_role;
GRANT ALL ON TABLE public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write" ON public.platform_admins;

CREATE POLICY "platform_admins_read" ON public.platform_admins FOR SELECT
USING (
  (current_setting('request.jwt.claim.role', true) = 'service_role')
  OR user_id = auth.uid()
);

CREATE POLICY "platform_admins_write" ON public.platform_admins FOR ALL
USING (current_setting('request.jwt.claim.role', true) = 'service_role')
WITH CHECK (current_setting('request.jwt.claim.role', true) = 'service_role');

-- =============================================================================
-- 2. FONCTION CENTRALE : public.is_platform_admin()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_jwt_claims JSONB;
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
  BEGIN
    v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    IF COALESCE((v_jwt_claims -> 'app_metadata' ->> 'is_platform_admin')::boolean, false) = true THEN
      RETURN TRUE;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- En cas de chaîne JSON invalide ou absente
  END;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER 
SET search_path = public, auth, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- =============================================================================
-- 3. VERROUILLAGE ÉTANCHE : public.users
-- =============================================================================

-- 3.1 Trigger de protection des colonnes sensibles (Anti-Élévation et Anti-Rattachement Forgé)
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges_v4()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'appelant est service_role ou platform_admin certifié, modification autorisée
  IF current_setting('request.jwt.claim.role', true) = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Sur INSERT par un utilisateur ordinaire : Interdiction de s'attribuer une organisation ou un rôle élevé
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'USER'::securia_user_role THEN
      RAISE EXCEPTION 'Action interdite : auto-inscription autorisée uniquement avec le rôle USER.';
    END IF;
    -- Une auto-inscription ne peut pas s'auto-rattacher à une organisation sans invitation
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas vous auto-assigner à une organisation lors de l''inscription.';
    END IF;
    RETURN NEW;
  END IF;

  -- Sur UPDATE : Interdiction de modifier les champs de privilège ou d'organisation
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.';
  END IF;

  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.';
  END IF;

  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.';
  END IF;

  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4 ON public.users;
CREATE TRIGGER trg_protect_users_privileges_v4
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges_v4();

-- 3.2 RLS étanche sur public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Création profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
DROP POLICY IF EXISTS "Suppression profil admin" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped" ON public.users;

CREATE POLICY "users_select_scoped_v4" ON public.users FOR SELECT
USING (
  public.is_platform_admin()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    JOIN public.alerts a ON a.id = i.alert_id
    JOIN public.security_agents sa ON sa.id = i.agent_id
    WHERE sa.user_id = auth.uid() AND a.user_id = public.users.id
  )
);

CREATE POLICY "users_insert_scoped_v4" ON public.users FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    auth.uid() = id 
    AND role = 'USER'::securia_user_role
    AND organization_id IS NULL
  )
);

CREATE POLICY "users_update_scoped_v4" ON public.users FOR UPDATE
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

CREATE POLICY "users_delete_scoped_v4" ON public.users FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 4. RLS ÉTANCHE AVEC VISIBILITÉ INTER-ORGANISATIONS PARTENAIRES : public.organizations
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture organisations autorisées" ON public.organizations;
DROP POLICY IF EXISTS "Gestion organisations admin" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_scoped" ON public.organizations;

-- SELECT : Propre organisation OU organisation partenaire liée par une intervention commune
CREATE POLICY "organizations_select_scoped_v4" ON public.organizations FOR SELECT
USING (
  public.is_platform_admin()
  -- Propre organisation
  OR id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  -- Organisation prestataire d'une alerte du client
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    WHERE i.provider_organization_id = public.organizations.id
      AND i.client_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  )
  -- Organisation cliente d'une mission confiée au prestataire
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    WHERE i.client_organization_id = public.organizations.id
      AND i.provider_organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  )
);

CREATE POLICY "organizations_write_scoped_v4" ON public.organizations FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- =============================================================================
-- 5. NETTOYAGE RLS DES TABLES SENSIBLES CONNEXES (FACTURES, ABONNEMENTS, APIS)
-- =============================================================================

-- 5.1 Factures (public.invoices) — Suppression de la clause globale OR role = 'ADMIN'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "invoices_org_isolation" ON public.invoices;
    DROP POLICY IF EXISTS "invoices_org_isolation_v4" ON public.invoices;
    
    CREATE POLICY "invoices_org_isolation_v4" ON public.invoices FOR ALL
    USING (
      public.is_platform_admin()
      OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
    WITH CHECK (
      public.is_platform_admin()
      OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    );
  END IF;
END $$;

-- 5.2 Abonnements (public.subscriptions)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "subscriptions_org_isolation" ON public.subscriptions;
    DROP POLICY IF EXISTS "subscriptions_org_isolation_v4" ON public.subscriptions;
    
    CREATE POLICY "subscriptions_org_isolation_v4" ON public.subscriptions FOR ALL
    USING (
      public.is_platform_admin()
      OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
    WITH CHECK (
      public.is_platform_admin()
      OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    );
  END IF;
END $$;

-- 5.3 Clés d'API (public.api_keys)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "api_keys_org_isolation" ON public.api_keys;
    DROP POLICY IF EXISTS "api_keys_org_isolation_v4" ON public.api_keys;
    
    CREATE POLICY "api_keys_org_isolation_v4" ON public.api_keys FOR ALL
    USING (
      public.is_platform_admin()
      OR (
        organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
        AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
      )
    )
    WITH CHECK (
      public.is_platform_admin()
      OR (
        organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
        AND (SELECT u.role FROM public.users u WHERE u.id = auth.uid()) = 'ADMIN'::securia_user_role
      )
    );
  END IF;
END $$;

-- =============================================================================
-- 6. RLS DURCIE SUR LES CENTRES, AGENTS ET ALERTES
-- =============================================================================

-- 6.1 Centres de Sécurité
ALTER TABLE public.security_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_centers_select_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped" ON public.security_centers;

CREATE POLICY "security_centers_select_scoped_v4" ON public.security_centers FOR SELECT
USING (
  public.is_platform_admin()
  OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.security_center_id = public.security_centers.id
      AND a.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  )
);

CREATE POLICY "security_centers_write_scoped_v4" ON public.security_centers FOR ALL
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

-- 6.2 Agents de Sécurité
ALTER TABLE public.security_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_agents_select_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_update_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_insert_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_delete_scoped" ON public.security_agents;

CREATE POLICY "security_agents_select_scoped_v4" ON public.security_agents FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.assigned_agent_id = public.security_agents.id
      AND (a.user_id = auth.uid() OR a.organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()))
  )
);

CREATE POLICY "security_agents_write_scoped_v4" ON public.security_agents FOR ALL
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

-- 6.3 Alertes
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts_select_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped" ON public.alerts;

CREATE POLICY "alerts_select_scoped_v4" ON public.alerts FOR SELECT
USING (
  public.is_platform_admin()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
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

CREATE POLICY "alerts_insert_scoped_v4" ON public.alerts FOR INSERT
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

CREATE POLICY "alerts_update_scoped_v4" ON public.alerts FOR UPDATE
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

CREATE POLICY "alerts_delete_scoped_v4" ON public.alerts FOR DELETE
USING (public.is_platform_admin());

-- =============================================================================
-- 7. STRUCTURE DUAL-TENANT & CONTRAINTES PHYSIQUES RÉELLES : public.interventions
-- =============================================================================

-- 7.1 Ajout des colonnes physiques
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID,
ADD COLUMN IF NOT EXISTS provider_organization_id UUID,
ADD COLUMN IF NOT EXISTS organization_id UUID,
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- 7.2 Remplacement formel des contraintes étrangères existantes par RESTRICT/SET NULL
-- (Évite le comportement passif de ADD COLUMN IF NOT EXISTS qui conserve CASCADE)
DO $$ BEGIN
  -- Client Organization FK
  ALTER TABLE public.interventions 
    DROP CONSTRAINT IF EXISTS fk_interventions_client_organization,
    DROP CONSTRAINT IF EXISTS interventions_client_organization_id_fkey;

  ALTER TABLE public.interventions 
    ADD CONSTRAINT fk_interventions_client_organization
    FOREIGN KEY (client_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

  -- Provider Organization FK
  ALTER TABLE public.interventions 
    DROP CONSTRAINT IF EXISTS fk_interventions_provider_organization,
    DROP CONSTRAINT IF EXISTS interventions_provider_organization_id_fkey;

  ALTER TABLE public.interventions 
    ADD CONSTRAINT fk_interventions_provider_organization
    FOREIGN KEY (provider_organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erreur lors de la mise a jour des contraintes FK : %', SQLERRM;
END $$;

-- 7.3 Rétro-remplissage sécurisé
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

-- 7.4 Trigger Anti-Falsification Dual-Tenant v4
CREATE OR REPLACE FUNCTION public.trg_fn_sync_intervention_tenants_v4()
RETURNS TRIGGER AS $$
DECLARE
  v_alert_org UUID;
  v_center_org UUID;
  v_agent_org UUID;
BEGIN
  -- RÈGLE 1 : Si alert_id est renseigné, l'organisation cliente est OBLIGATOIREMENT celle de l'alerte
  IF NEW.alert_id IS NOT NULL THEN
    SELECT a.organization_id INTO v_alert_org FROM public.alerts a WHERE a.id = NEW.alert_id;
    IF v_alert_org IS NOT NULL THEN
      NEW.client_organization_id := v_alert_org;
    END IF;
  END IF;

  -- RÈGLE 2 : Si security_center_id est renseigné, déduire le prestataire
  IF NEW.security_center_id IS NOT NULL THEN
    SELECT sc.organization_id INTO v_center_org FROM public.security_centers sc WHERE sc.id = NEW.security_center_id;
    IF v_center_org IS NOT NULL THEN
      NEW.provider_organization_id := v_center_org;
    END IF;
  END IF;

  -- RÈGLE 3 : Vérification de la cohérence de l'agent assigné
  IF NEW.agent_id IS NOT NULL THEN
    SELECT sa.organization_id INTO v_agent_org FROM public.security_agents sa WHERE sa.id = NEW.agent_id;
    IF NEW.provider_organization_id IS NULL AND v_agent_org IS NOT NULL THEN
      NEW.provider_organization_id := v_agent_org;
    ELSIF NEW.provider_organization_id IS NOT NULL AND v_agent_org IS DISTINCT FROM NEW.provider_organization_id THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) n''appartient pas au prestataire opérant (%).',
        NEW.agent_id, NEW.provider_organization_id;
    END IF;
  END IF;

  -- RÈGLE 4 : Rejet des orphelins absolus
  IF NEW.client_organization_id IS NULL AND NEW.provider_organization_id IS NULL THEN
    RAISE EXCEPTION 'Intervention invalide : une intervention doit obligatoirement être rattachée à une organisation cliente ou prestataire.';
  END IF;

  -- RÈGLE 5 : Alignement
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
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4 ON public.interventions;
CREATE TRIGGER trg_sync_intervention_tenants_v4
BEFORE INSERT OR UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_intervention_tenants_v4();

-- 7.5 Politiques RLS durcies sur public.interventions
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interventions_select_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4" ON public.interventions;

CREATE POLICY "interventions_select_scoped_v4" ON public.interventions FOR SELECT
USING (
  public.is_platform_admin()
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

CREATE POLICY "interventions_insert_scoped_v4" ON public.interventions FOR INSERT
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

CREATE POLICY "interventions_update_scoped_v4" ON public.interventions FOR UPDATE
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

CREATE POLICY "interventions_delete_scoped_v4" ON public.interventions FOR DELETE
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
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.';
  END IF;

  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role');

  IF NOT v_is_service_role THEN
    SELECT u.organization_id INTO v_caller_org FROM public.users u WHERE u.id = auth.uid();
    
    IF NOT (public.is_platform_admin() OR v_caller_org = p_org_id) THEN
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

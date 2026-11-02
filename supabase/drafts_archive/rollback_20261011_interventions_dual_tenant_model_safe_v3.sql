-- =============================================================================
-- SECURIA SaaS — PLAN DE RETOUR ARRIÈRE SÉCURISÉ v3 (NON DESTRUCTEUR)
-- Fichier : supabase/migrations/rollback_20261011_interventions_dual_tenant_model_safe_v3.sql
-- Date : 11 Octobre 2026
-- Phase : 1.8 Remédiation Globale RLS, RBAC & Isolation Multi-Tenant
-- 
-- STATUT : SCRIPT DE ROLLBACK FORMEL POUR VALIDATION HUMAINE (NON EXÉCUTÉ)
-- OBJECTIF : Permettre un retour à l'état de référence contrôlé sans perte 
--            d'écritures acquises pendant la période de préproduction.
-- =============================================================================

-- =============================================================================
-- PHASE 1 : ARCHIVAGE DYNAMIQUE HORODATÉ DU DELTA DES DONNÉES
-- =============================================================================
-- Création d'une table d'archive horodatée unique pour ne jamais écraser une sauvegarde précédente.
DO $$ 
DECLARE
  v_table_name TEXT;
BEGIN
  v_table_name := '_archive_interventions_rollback_' || to_char(now(), 'YYYYMMDD_HH24MISS');
  EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.interventions', v_table_name);
  RAISE NOTICE 'Table d archive creee avec succes : %', v_table_name;
END $$;

-- =============================================================================
-- PHASE 2 : DÉSACTIVATION DES TRIGGERS ET FONCTIONS AJOUTÉS EN V3
-- =============================================================================
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v3 ON public.interventions;
DROP FUNCTION IF EXISTS public.trg_fn_sync_intervention_tenants_v3();

DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
DROP FUNCTION IF EXISTS public.trg_fn_protect_users_privileges();

DROP FUNCTION IF EXISTS public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT);

-- =============================================================================
-- PHASE 3 : RESTAURATION DES POLITIQUES RLS DE RÉFÉRENCE HISTORIQUE
-- =============================================================================

-- 3.1 Table public.interventions
DROP POLICY IF EXISTS "interventions_select_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v3" ON public.interventions;

CREATE POLICY "Lecture des interventions" ON public.interventions FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = interventions.alert_id AND a.user_id = auth.uid())
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
  OR EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

CREATE POLICY "Insertion interventions" ON public.interventions FOR INSERT
WITH CHECK (public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN'));

CREATE POLICY "Mise a jour interventions" ON public.interventions FOR UPDATE
USING (
  public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
  OR EXISTS (SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = interventions.agent_id)
);

-- 3.2 Table public.alerts
DROP POLICY IF EXISTS "alerts_select_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped" ON public.alerts;

CREATE POLICY "Lecture des alertes" ON public.alerts FOR SELECT
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND (organization_id = public.get_current_user_org_id() OR organization_id IS NULL))
  OR (public.get_current_user_role() = 'AGENT' AND (
    assigned_agent_id IN (SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid())
    OR assigned_agent_id IS NULL
  ))
);

CREATE POLICY "Insertion alertes" ON public.alerts FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN'));

CREATE POLICY "Mise a jour alertes" ON public.alerts FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND (organization_id = public.get_current_user_org_id() OR organization_id IS NULL))
  OR (public.get_current_user_role() = 'AGENT' AND assigned_agent_id IN (
    SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()
  ))
);

-- 3.3 Table public.users
DROP POLICY IF EXISTS "users_select_scoped" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped" ON public.users;

CREATE POLICY "Lecture profil utilisateur" ON public.users FOR SELECT
USING (
  auth.uid() = id
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    JOIN public.alerts a ON a.id = i.alert_id
    JOIN public.security_agents sa ON sa.id = i.agent_id
    WHERE sa.user_id = auth.uid() AND a.user_id = public.users.id
  )
);

CREATE POLICY "Création profil utilisateur" ON public.users FOR INSERT
WITH CHECK (auth.uid() = id OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Modification propre profil" ON public.users FOR UPDATE
USING (auth.uid() = id OR public.get_current_user_role() = 'ADMIN');

-- 3.4 Table public.security_centers
DROP POLICY IF EXISTS "security_centers_select_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped" ON public.security_centers;

CREATE POLICY "Lecture centres autorisés" ON public.security_centers FOR SELECT
USING (
  organization_id = public.get_current_user_org_id()
  OR public.get_current_user_role() IN ('ADMIN', 'USER')
);

CREATE POLICY "Gestion centres responsable ou admin" ON public.security_centers FOR ALL
USING (
  public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
);

-- 3.5 Table public.security_agents
DROP POLICY IF EXISTS "security_agents_select_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_update_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_insert_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_delete_scoped" ON public.security_agents;

CREATE POLICY "Lecture agents autorisée" ON public.security_agents FOR SELECT
USING (
  user_id = auth.uid()
  OR organization_id = public.get_current_user_org_id()
  OR public.get_current_user_role() = 'ADMIN'
);

CREATE POLICY "Mise a jour agent autorisée" ON public.security_agents FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
);

CREATE POLICY "Gestion agents manager admin" ON public.security_agents FOR ALL
USING (public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN'));

-- 3.6 Table public.organizations
DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_scoped" ON public.organizations;

CREATE POLICY "Lecture organisations autorisées" ON public.organizations FOR SELECT
USING (id = public.get_current_user_org_id() OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Gestion organisations admin" ON public.organizations FOR ALL
USING (public.get_current_user_role() = 'ADMIN');

-- =============================================================================
-- PHASE 4 : SUPPRESSION SÉLECTIVE DES INDEX v3
-- =============================================================================
DROP INDEX IF EXISTS public.idx_interventions_client_org_v3;
DROP INDEX IF EXISTS public.idx_interventions_provider_org_v3;

-- =============================================================================
-- PHASE 5 : CONSERVATION DES STRUCTURES DE DONNÉES (AUCUN DROP COLUMN DIRECT)
-- =============================================================================
-- Les colonnes client_organization_id, provider_organization_id, mission_type
-- sont maintenues en base pour éviter toute interruption brutale des requêtes
-- applicatives Next.js.

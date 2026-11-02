-- =============================================================================
-- SECURIA SaaS — SCRIPT DE RETOUR ARRIÈRE SÉCURISÉ v4.2 (NON DESTRUCTEUR)
-- Fichier : supabase/rollback/rollback_20261012000100_securia_security_hardening_v4_2.sql
-- Date : 12 Octobre 2026
-- Phase : 2.5 Corrections Ciblées Avant Validation
--
-- INVENTAIRE EXACT DES ÉLÉMENTS CONSERVÉS APRÈS RETOUR ARRIÈRE :
-- 1. Colonnes physiques sur 'public.interventions' : client_organization_id,
--    provider_organization_id, organization_id, created_by, mission_type (aucune perte de données).
-- 2. Contraintes d'intégrité ON DELETE RESTRICT (fk_interventions_alert,
--    fk_interventions_client_organization, fk_interventions_provider_organization)
--    pour empêcher toute suppression en cascade détruisant les preuves et signatures.
-- 3. Table 'public.platform_admins' et fonctions auxiliaires d'isolation
--    (app_is_admin_context, app_is_platform_admin, app_current_org, app_current_role,
--    app_current_agent_ids) nécessaires aux politiques de repli sans récursion 42P17.
-- 4. Trigger anti-auto-promotion sur 'public.users' (trg_fn_protect_users_privileges_v4_2)
--    strictement maintenu pour interdire toute élévation de privilèges après rollback.
-- 5. Verrouillage SQL des factures, abonnements et restriction au niveau colonne de key_hash.
--
-- POLITIQUES DE REPLI (RLS INTERIM SANS FAILLE) :
-- - Les politiques de repli réinstallées sur interventions, alerts et users s'appuient
--   sur app_current_org() et app_is_admin_context() : aucune politique permissive
--   historique globale (ex: 'role = ADMIN') n'est restaurée.
--
-- AVERTISSEMENT RESTAURATION MANUELLE REQUISE :
-- - Les données archivées sont stockées dans backup._archive_* avec droits révoqués.
-- - Toute réinjection de données antérieures doit faire l'objet d'un script DBA manuel.
-- - La fonction RPC public.get_scoped_interventions_feed() est retirée par le rollback ;
--   les clients applicatifs en dépendant nécessitent la réapplication de la migration v4.2.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ARCHIVAGE SÉCURISÉ DANS LE SCHÉMA PRIVÉ 'backup'
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON SCHEMA backup TO postgres, service_role;

DO $$ 
DECLARE
  v_suffix TEXT;
  v_tbl_interventions TEXT;
  v_tbl_alerts TEXT;
  v_tbl_users TEXT;
BEGIN
  v_suffix := to_char(now(), 'YYYYMMDD_HH24MISS');
  v_tbl_interventions := '_archive_interventions_' || v_suffix;
  v_tbl_alerts := '_archive_alerts_' || v_suffix;
  v_tbl_users := '_archive_users_' || v_suffix;

  EXECUTE format('CREATE TABLE backup.%I AS SELECT * FROM public.interventions', v_tbl_interventions);
  EXECUTE format('CREATE TABLE backup.%I AS SELECT * FROM public.alerts', v_tbl_alerts);
  EXECUTE format('CREATE TABLE backup.%I AS SELECT * FROM public.users', v_tbl_users);

  -- Révoquer tout privilège sur les tables d'archive
  EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM PUBLIC, anon, authenticated', v_tbl_interventions);
  EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM PUBLIC, anon, authenticated', v_tbl_alerts);
  EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM PUBLIC, anon, authenticated', v_tbl_users);

  RAISE NOTICE 'Archives creees avec succes dans le schema backup : %, %, %', 
    v_tbl_interventions, v_tbl_alerts, v_tbl_users;
END $$;

-- =============================================================================
-- 2. TRANSITION SÉCURISÉE DES TRIGGERS ET FONCTIONS EN MODE REPLI
-- =============================================================================
-- Retrait du trigger principal v4.2 mais installation immédiate d'un trigger
-- de repli pour préserver l'immuabilité absolue de created_by et organization_id
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4_2 ON public.interventions;
DROP FUNCTION IF EXISTS public.trg_fn_sync_intervention_tenants_v4_2();

CREATE OR REPLACE FUNCTION public.trg_fn_protect_interventions_rollback_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Action interdite : le créateur (created_by) est strictement immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de rattachement (organization_id) est immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_organization_id IS DISTINCT FROM OLD.client_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation cliente est immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.provider_organization_id IS DISTINCT FROM OLD.provider_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation prestataire est immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_interventions_rollback_safe ON public.interventions;
CREATE TRIGGER trg_protect_interventions_rollback_safe
BEFORE UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_interventions_rollback_safe();

-- Retrait du trigger d'alerte v4.2 et installation du trigger de repli d'intégrité
DROP TRIGGER IF EXISTS trg_validate_alert_tenancy_v4_2 ON public.alerts;
DROP FUNCTION IF EXISTS public.trg_fn_validate_alert_tenancy_v4_2();

CREATE OR REPLACE FUNCTION public.trg_fn_protect_alerts_rollback_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Action interdite : l''auteur de l''alerte (user_id) est strictement immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de l''alerte est immuable (mode repli).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_alerts_rollback_safe ON public.alerts;
CREATE TRIGGER trg_protect_alerts_rollback_safe
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_alerts_rollback_safe();

DROP FUNCTION IF EXISTS public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT);

-- Note de sécurité : Le trigger anti-élévation sur users est MAINTENU pour interdire l'auto-promotion
-- même après retour arrière. Il continue d'utiliser app_is_admin_context().

-- =============================================================================
-- 3. POLITIQUES DE REPLI ÉTANCHES (RLS INTERIM SANS RÉCURSION ET SANS ÉLÉVATION)
-- =============================================================================

-- 3.1 Table public.interventions : repli étanche par organisation avec WITH CHECK
DROP POLICY IF EXISTS "interventions_select_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_rollback_safe" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_rollback_safe" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_rollback_safe" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_rollback_safe" ON public.interventions;

CREATE POLICY "interventions_select_rollback_safe" ON public.interventions FOR SELECT
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

CREATE POLICY "interventions_insert_rollback_safe" ON public.interventions FOR INSERT
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

CREATE POLICY "interventions_update_rollback_safe" ON public.interventions FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (
    provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
)
WITH CHECK (
  public.app_is_admin_context()
  OR (
    provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

CREATE POLICY "interventions_delete_rollback_safe" ON public.interventions FOR DELETE
USING (public.app_is_admin_context());

-- 3.2 Table public.alerts : repli étanche avec WITH CHECK
DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_rollback_safe" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_rollback_safe" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_rollback_safe" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_rollback_safe" ON public.alerts;

CREATE POLICY "alerts_select_rollback_safe" ON public.alerts FOR SELECT
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (organization_id IS NOT NULL AND organization_id = public.app_current_org())
);

CREATE POLICY "alerts_insert_rollback_safe" ON public.alerts FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    user_id = auth.uid()
    AND (organization_id IS NULL OR organization_id = public.app_current_org())
  )
);

CREATE POLICY "alerts_update_rollback_safe" ON public.alerts FOR UPDATE
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "alerts_delete_rollback_safe" ON public.alerts FOR DELETE
USING (public.app_is_admin_context());

-- 3.3 Table public.users : repli anti-auto-promotion
DROP POLICY IF EXISTS "users_select_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_select_rollback_safe" ON public.users;
DROP POLICY IF EXISTS "users_insert_rollback_safe" ON public.users;
DROP POLICY IF EXISTS "users_update_rollback_safe" ON public.users;
DROP POLICY IF EXISTS "users_delete_rollback_safe" ON public.users;

CREATE POLICY "users_select_rollback_safe" ON public.users FOR SELECT
USING (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "users_insert_rollback_safe" ON public.users FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (auth.uid() = id AND role = 'USER'::securia_user_role AND organization_id IS NULL)
);

CREATE POLICY "users_update_rollback_safe" ON public.users FOR UPDATE
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

CREATE POLICY "users_delete_rollback_safe" ON public.users FOR DELETE
USING (public.app_is_admin_context());

COMMIT;

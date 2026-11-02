-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.4)
-- Fichier : supabase/migrations/20261012000400_harden_alerts_inactive_users_rls.sql
-- Date : 14 Octobre 2026
-- Phase : 2T Durcissement RLS des alertes pour les comptes inactifs
--
-- MOTIVATION :
-- Le test dynamique de durcissement (test A.3 de 01_security_hardening_phase2_8_transactional.sql)
-- a révélé qu'un utilisateur désactivé (public.users.is_active = false) conservant
-- un JWT valide pouvait encore accéder à ses propres alertes via la branche
-- permissive `user_id = auth.uid()` de la politique `alerts_select_scoped_v4_2`.
--
-- REMÉDIATION :
-- Remplacement de la politique SELECT sur `public.alerts` afin que la branche
-- propriétaire exige également un rôle actif non nul :
--   (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
--
-- Étant donné que `public.app_current_role()` filtre strictement sur `u.is_active = true`,
-- elle retourne NULL pour tout compte inactif. Cette condition ferme la faille
-- pour les JWT orphelins/désactivés tout en maintenant l'accès légitime des résidents
-- actifs à leurs alertes.
-- =============================================================================

BEGIN;

-- 1. Remplacement de la politique SELECT sur public.alerts
DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_select_scoped_v4_2" ON public.alerts FOR SELECT
USING (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
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

COMMIT;

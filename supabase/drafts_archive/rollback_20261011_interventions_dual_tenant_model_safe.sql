-- =============================================================================
-- SECURIA SaaS — PLAN DE RETOUR ARRIÈRE SÉCURISÉ (ROLLBACK SAFE - PHASE 1.6)
-- Fichier : supabase/migrations/rollback_20261011_interventions_dual_tenant_model_safe.sql
-- 
-- STATUT : PROCÉDURE DE ROLLBACK SÉCURISÉE (NON EXÉCUTÉE)
-- OBJECTIF : Restaurer les politiques RLS initiales SANS destruction de données
--            ni perte irrémédiable des interventions créées post-migration.
-- =============================================================================

-- =============================================================================
-- PHASE 1 : CONSERVATION DU DELTA DE DONNÉES (AUCUNE PERTE D'ÉCRITURE)
-- =============================================================================
-- Si des interventions ont été créées ou mises à jour pendant la période de préprod,
-- les exporter dans une table d'archive avant toute modification.
CREATE TABLE IF NOT EXISTS public._archive_interventions_post_migration_delta AS
SELECT 
  id,
  alert_id,
  security_center_id,
  agent_id,
  status,
  report,
  client_organization_id,
  provider_organization_id,
  organization_id,
  mission_type,
  created_at,
  updated_at
FROM public.interventions;

-- =============================================================================
-- PHASE 2 : DÉSACTIVATION DOUCE DU TRIGGER ET DE LA PROCÉDURE RPC
-- =============================================================================
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
DROP FUNCTION IF EXISTS public.trg_fn_sync_intervention_tenants();
DROP FUNCTION IF EXISTS public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT);

-- =============================================================================
-- PHASE 3 : RESTAURATION DES POLITIQUES RLS INITIALES (SOURCE VÉRIFIÉE)
-- Source certifiée : 20260924102500_securia_triggers_and_policies.sql (L236-250)
-- =============================================================================
DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;
DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;
DROP POLICY IF EXISTS "Suppression interventions" ON public.interventions;

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

-- =============================================================================
-- PHASE 4 : SUPPRESSION SÉLECTIVE DES INDEX SECONDAIRES AJOUTÉS
-- =============================================================================
DROP INDEX IF EXISTS public.idx_interventions_client_org_created;
DROP INDEX IF EXISTS public.idx_interventions_provider_org_created;
DROP INDEX IF EXISTS public.idx_interventions_org_created;
DROP INDEX IF EXISTS public.idx_interventions_center_status;
DROP INDEX IF EXISTS public.idx_interventions_agent_status;

-- =============================================================================
-- PHASE 5 : CONSERVATION VOLONTAIRE DES COLONNES (AUCUN DROP COLUMN DIRECT)
-- =============================================================================
-- ⚠️ AVERTISSEMENT DE SÉCURITÉ :
-- Les colonnes client_organization_id, provider_organization_id, organization_id
-- et mission_type NE SONT PAS SUPPRIMÉES IMMÉDIATEMENT.
-- Leur maintien en base est inoffensif pour le code legacy mais préserve 100% de
-- l'intégrité des relations.
-- 
-- La suppression des colonnes ne doit intervenir QU'APRÈS validation formelle
-- et sauvegarde physique complète :
-- 
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS mission_type;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS provider_organization_id;
-- ALTER TABLE public.interventions DROP COLUMN IF EXISTS client_organization_id;

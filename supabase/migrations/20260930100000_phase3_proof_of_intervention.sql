-- ==============================================================================
-- SECURIA V2 — PHASE 3 : PROOF OF INTERVENTION & RAPPORT D'INTERVENTION
-- Enrichissement du schéma pour la gestion complète du dossier de preuve numérique,
-- checklists configurables, photos d'intervention et validation par le superviseur SOC.
-- ==============================================================================

-- 1. EXTENSIONS DE COLONNES SUR PUBLIC.INTERVENTIONS (SI NON EXISTANTES)
ALTER TABLE public.interventions
  ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'REPORT_DRAFT',
  ADD COLUMN IF NOT EXISTS findings TEXT,
  ADD COLUMN IF NOT EXISTS actions_taken TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS damages TEXT,
  ADD COLUMN IF NOT EXISTS recommendations TEXT,
  ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arrival_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS arrival_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS departure_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS departure_longitude DOUBLE PRECISION;

-- 2. INDEXATION DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_interventions_report_status ON public.interventions(report_status);
CREATE INDEX IF NOT EXISTS idx_interventions_validated_at ON public.interventions(validated_at);
CREATE INDEX IF NOT EXISTS idx_interventions_alert_id ON public.interventions(alert_id);
CREATE INDEX IF NOT EXISTS idx_interventions_agent_id ON public.interventions(agent_id);

-- 3. PROCÉDURE DE SOUMISSION DE RAPPORT D'INTERVENTION PAR L'AGENT
CREATE OR REPLACE FUNCTION public.submit_agent_intervention_report(
  p_intervention_id UUID,
  p_agent_user_id UUID,
  p_findings TEXT,
  p_actions_taken TEXT,
  p_outcome TEXT,
  p_observations TEXT DEFAULT NULL,
  p_damages TEXT DEFAULT NULL,
  p_recommendations TEXT DEFAULT NULL,
  p_checklist JSONB DEFAULT '[]'::jsonb,
  p_photos JSONB DEFAULT '[]'::jsonb,
  p_summary_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_int RECORD;
  v_alert RECORD;
  v_agent RECORD;
  v_summary TEXT;
BEGIN
  -- 1. Récupération de l'intervention
  SELECT * INTO v_int FROM public.interventions WHERE id = p_intervention_id;
  IF v_int.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Intervention introuvable');
  END IF;

  -- 2. Vérification que l'agent correspond
  SELECT * INTO v_agent FROM public.security_agents WHERE user_id = p_agent_user_id;
  IF v_agent.id IS NULL OR v_agent.id <> v_int.agent_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Action non autorisée pour cet agent');
  END IF;

  v_summary := COALESCE(p_summary_text, p_findings, 'Mission terminée et rapport soumis par le patrouilleur.');

  -- 3. Mise à jour de l'intervention
  UPDATE public.interventions
  SET
    status = 'COMPLETED',
    report_status = 'REPORT_SUBMITTED',
    report = v_summary,
    findings = p_findings,
    actions_taken = p_actions_taken,
    outcome = p_outcome,
    observations = p_observations,
    damages = p_damages,
    recommendations = p_recommendations,
    checklist = p_checklist,
    photos = p_photos,
    resolved_at = COALESCE(resolved_at, now()),
    updated_at = now()
  WHERE id = p_intervention_id;

  -- 4. Mise à jour de l'alerte liée
  UPDATE public.alerts
  SET
    status = 'RESOLVED',
    resolution_report = v_summary,
    resolved_at = COALESCE(resolved_at, now()),
    updated_at = now()
  WHERE id = v_int.alert_id;

  -- 5. Enregistrement dans alert_events
  INSERT INTO public.alert_events (
    alert_id,
    actor_id,
    from_status,
    to_status,
    event_type,
    comment,
    metadata
  ) VALUES (
    v_int.alert_id,
    p_agent_user_id,
    v_int.status::text::securia_alert_status,
    'RESOLVED',
    'REPORT_SUBMITTED',
    'Rapport de fin de mission soumis par l''agent. En attente de validation superviseur.',
    jsonb_build_object(
      'intervention_id', p_intervention_id,
      'has_photos', jsonb_array_length(p_photos) > 0,
      'checklist_count', jsonb_array_length(p_checklist)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'intervention_id', p_intervention_id,
    'report_status', 'REPORT_SUBMITTED'
  );
END;
$$;

-- 4. PROCÉDURE DE VALIDATION DU RAPPORT PAR LE SUPERVISEUR SOC
CREATE OR REPLACE FUNCTION public.validate_intervention_report(
  p_intervention_id UUID,
  p_supervisor_user_id UUID,
  p_supervisor_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_role TEXT;
  v_int RECORD;
BEGIN
  -- Vérifier rôle superviseur ou admin
  SELECT role INTO v_caller_role FROM public.users WHERE id = p_supervisor_user_id;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('SECURITY_MANAGER', 'ADMIN') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Accès refusé : Seul un superviseur SOC ou administrateur peut valider ce rapport');
  END IF;

  SELECT * INTO v_int FROM public.interventions WHERE id = p_intervention_id;
  IF v_int.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Intervention introuvable');
  END IF;

  -- Mise à jour
  UPDATE public.interventions
  SET
    report_status = 'REPORT_VALIDATED',
    validated_at = now(),
    validated_by = p_supervisor_user_id,
    updated_at = now()
  WHERE id = p_intervention_id;

  -- Journalisation d'événement
  INSERT INTO public.alert_events (
    alert_id,
    actor_id,
    from_status,
    to_status,
    event_type,
    comment,
    metadata
  ) VALUES (
    v_int.alert_id,
    p_supervisor_user_id,
    'RESOLVED',
    'RESOLVED',
    'REPORT_VALIDATED',
    'Rapport d''intervention validé par le responsable de sécurité. Proof of Intervention certifié et disponible.',
    jsonb_build_object(
      'intervention_id', p_intervention_id,
      'validated_at', now(),
      'notes', p_supervisor_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'intervention_id', p_intervention_id,
    'report_status', 'REPORT_VALIDATED',
    'validated_at', now()
  );
END;
$$;

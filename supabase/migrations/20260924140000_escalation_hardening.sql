-- =============================================================================
-- SECURIA — MIGRATION ESCALATION HARDENING & ORG TIMEOUTS
-- =============================================================================

-- 1. Extension pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Colonnes de temporisation configurables par organisation
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS acknowledgement_timeout_seconds INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS assignment_timeout_seconds INTEGER DEFAULT 180,
  ADD COLUMN IF NOT EXISTS response_timeout_seconds INTEGER DEFAULT 600,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- 3. Fonction d'escalade durcie avec paramètres par organisation et anti-concurrence
DROP FUNCTION IF EXISTS public.escalate_overdue_alerts(integer);

CREATE OR REPLACE FUNCTION public.escalate_overdue_alerts(p_timeout_seconds integer DEFAULT NULL)
 RETURNS TABLE(
   escalated_alert_id uuid,
   alert_num text,
   previous_status securia_alert_status,
   assigned_supervisor_id uuid,
   organization_id uuid,
   security_center_id uuid,
   escalation_reason text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec RECORD;
  v_supervisor_id UUID;
  v_reason TEXT;
BEGIN
  -- Boucle sur les alertes en souffrance avec verrouillage strict FOR UPDATE SKIP LOCKED
  FOR v_rec IN 
    SELECT 
      a.id, 
      a.alert_number, 
      a.status, 
      a.organization_id, 
      a.security_center_id,
      a.assigned_agent_id,
      a.location_address, 
      a.type,
      a.created_at,
      a.acknowledged_at,
      a.escalation_deadline,
      COALESCE(p_timeout_seconds, o.acknowledgement_timeout_seconds, 60) AS ack_timeout,
      COALESCE(o.assignment_timeout_seconds, 180) AS assign_timeout
    FROM public.alerts a
    LEFT JOIN public.organizations o ON a.organization_id = o.id
    WHERE 
      -- Cas 1 : Non acquittée dans les délais
      (
        a.status IN ('CREATED', 'SENT', 'RECEIVED')
        AND (
          (a.escalation_deadline IS NOT NULL AND a.escalation_deadline <= now())
          OR (a.created_at <= (now() - (COALESCE(p_timeout_seconds, o.acknowledgement_timeout_seconds, 60) || ' seconds')::interval))
        )
      )
      -- Cas 2 : Acquittée mais agent non affecté dans les délais
      OR (
        a.status = 'ACKNOWLEDGED'
        AND a.assigned_agent_id IS NULL
        AND a.acknowledged_at IS NOT NULL
        AND a.acknowledged_at <= (now() - (COALESCE(o.assignment_timeout_seconds, 180) || ' seconds')::interval)
      )
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    -- Sélection du superviseur appartenant à l'organisation concernée
    SELECT id INTO v_supervisor_id
    FROM public.users
    WHERE role IN ('SECURITY_MANAGER', 'ADMIN') 
      AND is_active = true
      AND (organization_id = v_rec.organization_id OR organization_id IS NULL)
    ORDER BY (organization_id = v_rec.organization_id) DESC, role ASC, created_at ASC
    LIMIT 1;

    IF v_rec.status = 'ACKNOWLEDGED' THEN
      v_reason := 'Délai d affectation dépassé (' || v_rec.assign_timeout || 's) sans agent mobilisé';
    ELSE
      v_reason := 'Délai de prise en charge dépassé (' || v_rec.ack_timeout || 's)';
    END IF;

    -- Mise à jour du statut
    UPDATE public.alerts
    SET status = 'ESCALATED', escalated_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    -- Historique d'événement
    INSERT INTO public.alert_events (
      id, alert_id, actor_id, from_status, to_status, event_type, comment, metadata, created_at
    ) VALUES (
      gen_random_uuid(), v_rec.id, v_supervisor_id, v_rec.status, 'ESCALATED', 'ALERT_ESCALATED',
      'Alerte ' || v_rec.alert_number || ' : ' || v_reason || '. Escaladée vers un superviseur.',
      jsonb_build_object(
        'reason', v_reason,
        'organization_id', v_rec.organization_id,
        'security_center_id', v_rec.security_center_id,
        'assigned_agent_id', v_rec.assigned_agent_id,
        'supervisor_id', v_supervisor_id,
        'ack_timeout', v_rec.ack_timeout,
        'assign_timeout', v_rec.assign_timeout
      ),
      now()
    );

    -- Notification ciblée aux managers de l'organisation
    INSERT INTO public.notifications (
      id, user_id, title, message, type, link, is_read, created_at
    )
    SELECT
      gen_random_uuid(), u.id, '🚨 ESCALADE CRITIQUE : ' || v_rec.alert_number,
      'Alerte ' || v_rec.type || ' (' || v_rec.location_address || ') : ' || v_reason,
      'ALERT_ESCALATED', '/dispatch/alerts/' || v_rec.id, false, now()
    FROM public.users u
    WHERE u.role IN ('SECURITY_MANAGER', 'ADMIN')
      AND (u.organization_id = v_rec.organization_id OR u.organization_id IS NULL);

    escalated_alert_id := v_rec.id;
    alert_num := v_rec.alert_number;
    previous_status := v_rec.status;
    assigned_supervisor_id := v_supervisor_id;
    organization_id := v_rec.organization_id;
    security_center_id := v_rec.security_center_id;
    escalation_reason := v_reason;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 4. Publication Realtime pour notifications
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 5. Planification pg_cron
DO $$
BEGIN
  PERFORM cron.unschedule('securia_escalate_overdue_alerts');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'securia_escalate_overdue_alerts',
  '*/1 * * * *',
  $$SELECT public.escalate_overdue_alerts();$$
);

-- 6. Index de performance et isolation multi-organisations
CREATE INDEX IF NOT EXISTS idx_alerts_org_id ON public.alerts (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON public.users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_protected_sites_org_id ON public.protected_sites (organization_id);
CREATE INDEX IF NOT EXISTS idx_security_agents_org_id ON public.security_agents (organization_id);
CREATE INDEX IF NOT EXISTS idx_security_agents_duty ON public.security_agents (duty_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id);

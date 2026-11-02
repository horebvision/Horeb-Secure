-- ==============================================================================
-- PROJET SECURIA - MIGRATION RPC, TABLES COMPLÉMENTAIRES ET AUDIT TRAIL
-- Tables complémentaires : notifications, audit_logs
-- Extensions colonnes   : alerts (idempotency_key, escalation_deadline, escalated_at, etc.)
-- Procédures stockées   : 19 RPC Functions (Moteur d'alerte, Régulation, Agents, GPS, Audit)
-- ==============================================================================

-- 1. EXTENSIONS DE SCHÉMA SUR ALERTS
ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_report TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alerts_idempotency_key ON public.alerts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_alerts_escalation_deadline ON public.alerts(escalation_deadline);

-- 2. TABLE NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  link TEXT,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE,
  intervention_id UUID REFERENCES public.interventions(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.security_agents(id) ON DELETE SET NULL,
  role TEXT DEFAULT 'USER',
  channel TEXT DEFAULT 'IN_APP',
  status TEXT DEFAULT 'DELIVERED',
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture notifications destinataire" ON public.notifications;
CREATE POLICY "Lecture notifications destinataire" ON public.notifications FOR SELECT
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'ADMIN')));

DROP POLICY IF EXISTS "Mise a jour notifications destinataire" ON public.notifications;
CREATE POLICY "Mise a jour notifications destinataire" ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- 3. TABLE AUDIT_LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture audit logs superviseurs" ON public.audit_logs;
CREATE POLICY "Lecture audit logs superviseurs" ON public.audit_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'ADMIN')));

-- 4. PUBLICATION REALTIME
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 5. RPC FUNCTIONS DÉFINITIVES

-- 5.1 ACKNOWLEDGE_ALERT
CREATE OR REPLACE FUNCTION public.acknowledge_alert(p_alert_id uuid, p_dispatcher_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alert RECORD;
  v_prev_status securia_alert_status;
BEGIN
  SELECT * INTO v_alert FROM alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alerte introuvable');
  END IF;

  v_prev_status := v_alert.status;

  UPDATE alerts
  SET status = 'ACKNOWLEDGED', updated_at = now()
  WHERE id = p_alert_id;

  INSERT INTO alert_events (
    id, alert_id, actor_id, from_status, to_status, event_type, comment, created_at
  ) VALUES (
    gen_random_uuid(), p_alert_id, p_dispatcher_id, v_prev_status, 'ACKNOWLEDGED', 'ALERT_ACKNOWLEDGED',
    'Alerte prise en charge par le régulateur de télésurveillance.', now()
  );

  INSERT INTO audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid()::text, p_dispatcher_id::text, 'ACKNOWLEDGE_ALERT', 'ALERT', p_alert_id::text,
    jsonb_build_object('alert_number', v_alert.alert_number, 'previous_status', v_prev_status, 'new_status', 'ACKNOWLEDGED'), now()
  );

  RETURN jsonb_build_object('success', true, 'message', 'Alerte prise en charge', 'status', 'ACKNOWLEDGED');
END;
$function$;

-- 5.2 ASSIGN_AGENT_TO_ALERT
CREATE OR REPLACE FUNCTION public.assign_agent_to_alert(p_alert_id uuid, p_agent_id uuid, p_dispatcher_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alert RECORD;
  v_agent RECORD;
  v_intervention_id UUID;
  v_prev_status securia_alert_status;
BEGIN
  SELECT * INTO v_alert FROM alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alerte introuvable');
  END IF;

  v_prev_status := v_alert.status;

  SELECT sa.*, u.full_name, u.phone, u.email INTO v_agent
  FROM security_agents sa
  JOIN users u ON u.id = sa.user_id
  WHERE sa.id = p_agent_id OR sa.user_id = p_agent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent de sécurité introuvable');
  END IF;

  v_intervention_id := gen_random_uuid();
  INSERT INTO interventions (
    id, alert_id, security_center_id, agent_id, status, assigned_at, created_at, updated_at
  ) VALUES (
    v_intervention_id, p_alert_id, v_alert.security_center_id, v_agent.id, 'PENDING', now(), now(), now()
  );

  UPDATE alerts
  SET assigned_agent_id = v_agent.id, intervention_id = v_intervention_id, status = 'ASSIGNED', updated_at = now()
  WHERE id = p_alert_id;

  UPDATE security_agents
  SET duty_status = 'DISPATCHED', updated_at = now()
  WHERE id = v_agent.id;

  INSERT INTO alert_events (
    id, alert_id, actor_id, from_status, to_status, event_type, comment, metadata, created_at
  ) VALUES (
    gen_random_uuid(), p_alert_id, p_dispatcher_id, v_prev_status, 'ASSIGNED', 'AGENT_ASSIGNED',
    'Agent ' || v_agent.full_name || ' (' || v_agent.badge_number || ') affecté à l''intervention.',
    jsonb_build_object('agent_id', v_agent.id, 'badge_number', v_agent.badge_number, 'vehicle', v_agent.patrol_vehicle, 'notes', p_notes),
    now()
  );

  INSERT INTO audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid()::text, p_dispatcher_id::text, 'ASSIGN_AGENT', 'ALERT', p_alert_id::text,
    jsonb_build_object('alert_number', v_alert.alert_number, 'agent_id', v_agent.id, 'agent_name', v_agent.full_name, 'badge_number', v_agent.badge_number, 'previous_status', v_prev_status, 'new_status', 'ASSIGNED', 'intervention_id', v_intervention_id, 'notes', p_notes),
    now()
  );

  INSERT INTO notifications (
    id, user_id, title, message, type, link, is_read, created_at
  ) VALUES (
    gen_random_uuid(), v_agent.user_id, '🚨 NOUVELLE MISSION : ' || v_alert.alert_number,
    'Alerte ' || v_alert.type || ' à ' || v_alert.location_address || '. Départ immédiat requis.',
    'MISSION_ASSIGNED', '/agent', false, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Agent ' || v_agent.full_name || ' affecté avec succès.',
    'alert_id', p_alert_id,
    'agent_name', v_agent.full_name,
    'status', 'ASSIGNED',
    'intervention_id', v_intervention_id
  );
END;
$function$;

-- 5.3 CANCEL_OR_UPDATE_ALERT
CREATE OR REPLACE FUNCTION public.cancel_or_update_alert(p_alert_id uuid, p_user_id uuid, p_new_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alert alerts%ROWTYPE;
  v_user users%ROWTYPE;
  v_now timestamptz := now();
  v_reason text := COALESCE(p_reason, 'Alerte annulée');
BEGIN
  SELECT * INTO v_alert FROM alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alerte introuvable', 'code', 404);
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable ou non autorisé', 'code', 403);
  END IF;

  IF v_user.role = 'USER'::securia_user_role AND v_alert.user_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Interdit: Vous ne pouvez pas modifier l''alerte d''un tiers', 'code', 403);
  END IF;

  IF v_user.role = 'AGENT'::securia_user_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'Interdit: Les patrouilleurs doivent passer par la régulation ou la console d''intervention', 'code', 403);
  END IF;

  UPDATE alerts
  SET status = p_new_status::securia_alert_status, updated_at = v_now
  WHERE id = p_alert_id;

  INSERT INTO alert_events (
    id, alert_id, actor_id, from_status, to_status, event_type, comment, created_at
  ) VALUES (
    gen_random_uuid(), p_alert_id, p_user_id, v_alert.status, p_new_status::securia_alert_status,
    CASE WHEN p_new_status = 'CANCELLED' THEN 'ALERT_CANCELLED' ELSE 'STATUS_CHANGE' END, v_reason, v_now
  );

  INSERT INTO audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid()::text, p_user_id::text,
    CASE WHEN p_new_status = 'CANCELLED' THEN 'CANCEL_ALERT' ELSE 'UPDATE_ALERT_STATUS' END,
    'ALERT', p_alert_id::text,
    jsonb_build_object('previous_status', v_alert.status, 'new_status', p_new_status, 'reason', v_reason, 'alert_number', v_alert.alert_number),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true, 'message', 'Alerte mise à jour avec succès', 'status', p_new_status, 'alert_id', p_alert_id
  );
END;
$function$;

-- 5.4 CREATE_PROTECTED_SITE
CREATE OR REPLACE FUNCTION public.create_protected_site(p_owner_id uuid, p_organization_id uuid, p_security_center_id uuid, p_name text, p_site_type text, p_address text, p_city text, p_postal_code text, p_latitude double precision, p_longitude double precision, p_access_instructions text, p_is_default boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_site protected_sites%ROWTYPE;
  v_site_id uuid := gen_random_uuid();
BEGIN
  IF p_is_default THEN
    UPDATE protected_sites SET is_default = false WHERE owner_id = p_owner_id;
  END IF;

  INSERT INTO protected_sites (
    id, owner_id, organization_id, security_center_id, name,
    site_type, address, city, postal_code, latitude, longitude,
    access_instructions, is_default, created_at, updated_at
  ) VALUES (
    v_site_id, p_owner_id, p_organization_id, p_security_center_id, p_name,
    p_site_type::securia_site_type, p_address, p_city, p_postal_code, p_latitude, p_longitude,
    p_access_instructions, p_is_default, now(), now()
  )
  RETURNING * INTO v_site;

  RETURN jsonb_build_object('success', true, 'site', row_to_json(v_site));
END;
$function$;

-- 5.5 CREATE_SECURIA_NOTIFICATION
CREATE OR REPLACE FUNCTION public.create_securia_notification(p_user_id uuid, p_title text, p_message text, p_type text, p_link text DEFAULT NULL::text, p_alert_id uuid DEFAULT NULL::uuid, p_intervention_id uuid DEFAULT NULL::uuid, p_agent_id uuid DEFAULT NULL::uuid, p_role text DEFAULT 'USER'::text, p_channel text DEFAULT 'IN_APP'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_notification public.notifications%ROWTYPE;
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
  )
  VALUES (
    p_user_id, p_title, p_message, p_type, p_link, p_alert_id, p_intervention_id, p_agent_id, p_role, p_channel, 'DELIVERED', COALESCE(p_metadata, '{}'::jsonb), false, NOW()
  )
  RETURNING * INTO v_notification;

  RETURN jsonb_build_object(
    'id', v_notification.id,
    'user_id', v_notification.user_id,
    'title', v_notification.title,
    'message', v_notification.message,
    'type', v_notification.type,
    'link', v_notification.link,
    'alert_id', v_notification.alert_id,
    'intervention_id', v_notification.intervention_id,
    'agent_id', v_notification.agent_id,
    'role', v_notification.role,
    'channel', v_notification.channel,
    'status', v_notification.status,
    'is_read', v_notification.is_read,
    'created_at', v_notification.created_at
  );
END;
$function$;

-- 5.6 ESCALATE_OVERDUE_ALERTS
CREATE OR REPLACE FUNCTION public.escalate_overdue_alerts(p_timeout_seconds integer DEFAULT 60)
 RETURNS TABLE(escalated_alert_id uuid, alert_num text, previous_status securia_alert_status, assigned_supervisor_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rec RECORD;
  v_supervisor_id UUID;
BEGIN
  SELECT id INTO v_supervisor_id
  FROM users
  WHERE role IN ('SECURITY_MANAGER', 'ADMIN') AND is_active = true
  ORDER BY role ASC, created_at ASC
  LIMIT 1;

  FOR v_rec IN 
    SELECT a.id, a.alert_number, a.status, a.organization_id, a.location_address, a.type
    FROM public.alerts a
    WHERE a.status IN ('CREATED', 'SENT', 'RECEIVED')
      AND (
        (a.escalation_deadline IS NOT NULL AND a.escalation_deadline <= now())
        OR (a.created_at <= (now() - (p_timeout_seconds || ' seconds')::interval))
      )
    FOR UPDATE
  LOOP
    UPDATE public.alerts
    SET status = 'ESCALATED', escalated_at = now(), updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO public.alert_events (
      id, alert_id, actor_id, from_status, to_status, event_type, comment, metadata, created_at
    ) VALUES (
      gen_random_uuid(), v_rec.id, v_supervisor_id, v_rec.status, 'ESCALATED', 'ALERT_ESCALATED',
      'Alerte ' || v_rec.alert_number || ' critique non prise en charge dans le délai (' || p_timeout_seconds || 's). Escaladée vers un responsable.',
      jsonb_build_object('timeout_seconds', p_timeout_seconds, 'escalated_to', v_supervisor_id),
      now()
    );

    INSERT INTO public.notifications (
      id, user_id, title, message, type, link, is_read, created_at
    )
    SELECT
      gen_random_uuid(), u.id, '🚨 ESCALADE URGENTE : ' || v_rec.alert_number,
      'Alerte ' || v_rec.type || ' à ' || v_rec.location_address || ' sans prise en charge. Escalade hiérarchique active.',
      'ALERT_ESCALATED', '/dispatch/alerts/' || v_rec.id, false, now()
    FROM users u
    WHERE u.role IN ('SECURITY_MANAGER', 'ADMIN')
      AND (u.organization_id = v_rec.organization_id OR u.organization_id IS NULL);

    escalated_alert_id := v_rec.id;
    alert_num := v_rec.alert_number;
    previous_status := v_rec.status;
    assigned_supervisor_id := v_supervisor_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 5.7 GET_AGENT_DASHBOARD_DATA
CREATE OR REPLACE FUNCTION public.get_agent_dashboard_data(p_agent_identifier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agent_id UUID;
  v_agent_record JSONB;
  v_active_alert JSONB;
  v_interventions JSONB;
BEGIN
  SELECT sa.id INTO v_agent_id
  FROM security_agents sa
  WHERE sa.id::text = p_agent_identifier OR sa.user_id::text = p_agent_identifier
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Agent non trouvé');
  END IF;

  SELECT jsonb_build_object(
    'id', sa.id, 'user_id', sa.user_id, 'badge_number', sa.badge_number,
    'duty_status', sa.duty_status, 'patrol_vehicle', sa.patrol_vehicle,
    'organization_id', sa.organization_id, 'security_center_id', sa.security_center_id,
    'full_name', u.full_name, 'email', u.email, 'phone', u.phone
  ) INTO v_agent_record
  FROM security_agents sa
  JOIN users u ON sa.user_id = u.id
  WHERE sa.id = v_agent_id;

  SELECT jsonb_build_object(
    'id', a.id, 'alert_number', a.alert_number, 'type', a.type, 'priority', a.priority,
    'status', a.status, 'created_at', a.created_at, 'latitude', a.latitude, 'longitude', a.longitude,
    'location_address', a.location_address, 'client_notes', a.client_notes,
    'client', jsonb_build_object('full_name', u.full_name, 'phone', u.phone, 'email', u.email),
    'site', jsonb_build_object('name', ps.name, 'address', ps.address, 'city', ps.city, 'postal_code', ps.postal_code, 'access_instructions', ps.access_instructions),
    'intervention', (
      SELECT jsonb_build_object(
        'id', i.id, 'status', i.status, 'assigned_at', i.assigned_at, 'accepted_at', i.accepted_at,
        'en_route_at', i.en_route_at, 'arrived_at', i.arrived_at, 'resolved_at', i.resolved_at, 'report', i.report
      )
      FROM interventions i
      WHERE i.alert_id = a.id AND i.agent_id = v_agent_id
      ORDER BY i.created_at DESC
      LIMIT 1
    )
  ) INTO v_active_alert
  FROM alerts a
  JOIN users u ON a.user_id = u.id
  LEFT JOIN protected_sites ps ON a.site_id = ps.id
  WHERE a.assigned_agent_id = v_agent_id
    AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
  ORDER BY a.created_at DESC
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id, 'status', i.status, 'assigned_at', i.assigned_at, 'accepted_at', i.accepted_at,
      'en_route_at', i.en_route_at, 'arrived_at', i.arrived_at, 'resolved_at', i.resolved_at, 'report', i.report,
      'alert', jsonb_build_object(
        'id', a.id, 'alert_number', a.alert_number, 'type', a.type, 'priority', a.priority, 'status', a.status,
        'created_at', a.created_at, 'location_address', a.location_address, 'site_name', ps.name, 'site_address', ps.address, 'client_name', u.full_name
      )
    ) ORDER BY i.created_at DESC
  ), '[]'::jsonb) INTO v_interventions
  FROM interventions i
  JOIN alerts a ON i.alert_id = a.id
  JOIN users u ON a.user_id = u.id
  LEFT JOIN protected_sites ps ON a.site_id = ps.id
  WHERE i.agent_id = v_agent_id;

  RETURN jsonb_build_object(
    'agent', v_agent_record,
    'active_alert', v_active_alert,
    'interventions', v_interventions
  );
END;
$function$;

-- 5.8 TRIGGER_ALERT_ENGINE
CREATE OR REPLACE FUNCTION public.trigger_alert_engine(p_user_id uuid, p_site_id uuid DEFAULT NULL::uuid, p_type text DEFAULT 'INTRUSION'::text, p_priority text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_location_address text DEFAULT NULL::text, p_is_silent boolean DEFAULT false, p_client_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_escalation_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user users%ROWTYPE;
  v_site protected_sites%ROWTYPE;
  v_center_id UUID;
  v_org_id UUID;
  v_alert_id UUID;
  v_alert_number TEXT;
  v_priority securia_alert_priority;
  v_type securia_alert_type;
  v_escalation_deadline TIMESTAMPTZ;
  v_existing_alert alerts%ROWTYPE;
  v_recent_alert alerts%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing_alert FROM alerts WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true, 'is_duplicate', true, 'message', 'Alerte déjà enregistrée (idempotence)',
        'alert', row_to_json(v_existing_alert), 'security_center_id', v_existing_alert.security_center_id, 'alert_number', v_existing_alert.alert_number
      );
    END IF;
  END IF;

  SELECT * INTO v_recent_alert FROM alerts
  WHERE user_id = p_user_id
    AND type = p_type::securia_alert_type
    AND status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
    AND created_at > (NOW() - INTERVAL '30 seconds')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true, 'is_duplicate', true, 'cooldown_active', true,
      'message', 'Double déclenchement accidentel prévenu (cooldown 30s actif)',
      'alert', row_to_json(v_recent_alert), 'security_center_id', v_recent_alert.security_center_id, 'alert_number', v_recent_alert.alert_number
    );
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utilisateur introuvable ou non autorisé (ID: ' || p_user_id || ')');
  END IF;

  IF NOT v_user.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Compte utilisateur suspendu');
  END IF;

  IF p_site_id IS NOT NULL THEN
    SELECT * INTO v_site FROM protected_sites WHERE id = p_site_id;
  END IF;

  IF v_site.id IS NULL THEN
    SELECT * INTO v_site FROM protected_sites
    WHERE owner_id = p_user_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;
  END IF;

  IF p_latitude IS NULL AND v_site.latitude IS NOT NULL THEN
    p_latitude := v_site.latitude;
  END IF;
  IF p_longitude IS NULL AND v_site.longitude IS NOT NULL THEN
    p_longitude := v_site.longitude;
  END IF;
  IF p_location_address IS NULL OR p_location_address = '' THEN
    p_location_address := COALESCE(v_site.address, 'Position GPS en direct');
  END IF;

  v_center_id := COALESCE(v_site.security_center_id, v_user.security_center_id);
  v_org_id := COALESCE(v_site.organization_id, v_user.organization_id);

  IF v_center_id IS NULL THEN
    SELECT id, organization_id INTO v_center_id, v_org_id
    FROM security_centers WHERE is_active = true LIMIT 1;
  END IF;

  v_alert_id := gen_random_uuid();
  v_alert_number := 'SEC-' || to_char(NOW(), 'YYYY') || '-' || LPAD(floor(random() * 9000 + 1000)::text, 4, '0');

  v_type := p_type::securia_alert_type;
  IF p_priority IS NOT NULL THEN
    v_priority := p_priority::securia_alert_priority;
  ELSE
    IF v_type IN ('INTRUSION', 'AGRESSION', 'URGENCE') THEN
      v_priority := 'CRITICAL'::securia_alert_priority;
    ELSE
      v_priority := 'HIGH'::securia_alert_priority;
    END IF;
  END IF;

  v_escalation_deadline := NOW() + (p_escalation_seconds || ' seconds')::INTERVAL;

  INSERT INTO alerts (
    id, alert_number, user_id, site_id, security_center_id, organization_id,
    type, priority, status, latitude, longitude, location_address,
    is_silent, client_notes, idempotency_key, escalation_deadline, created_at, updated_at
  ) VALUES (
    v_alert_id, v_alert_number, p_user_id, v_site.id, v_center_id, v_org_id,
    v_type, v_priority, 'SENT', p_latitude, p_longitude, p_location_address,
    p_is_silent, p_client_notes, p_idempotency_key, v_escalation_deadline, NOW(), NOW()
  );

  INSERT INTO alert_events (
    id, alert_id, actor_id, from_status, to_status, event_type, comment, created_at
  ) VALUES (
    gen_random_uuid(), v_alert_id, p_user_id, NULL, 'SENT', 'ALERT_CREATED',
    'Alerte ' || p_type || ' déclenchée par ' || v_user.full_name || ' (' || p_location_address || ')', NOW()
  );

  INSERT INTO notifications (
    id, user_id, title, message, type, link, is_read, created_at
  )
  SELECT
    gen_random_uuid(), u.id, 'ALERTE ' || v_priority || ' : ' || p_type,
    'Alerte ' || v_alert_number || ' à ' || p_location_address || ' par ' || v_user.full_name,
    'ALERT_TRIGGERED', '/dispatch/alerts/' || v_alert_id, false, NOW()
  FROM users u
  WHERE u.role IN ('SECURITY_MANAGER', 'ADMIN')
    AND (u.organization_id = v_org_id OR u.organization_id IS NULL);

  SELECT * INTO v_existing_alert FROM alerts WHERE id = v_alert_id;

  RETURN jsonb_build_object(
    'success', true, 'is_duplicate', false, 'message', 'Alerte transmise avec succès au centre de sécurité',
    'alert', row_to_json(v_existing_alert), 'security_center_id', v_center_id, 'alert_number', v_alert_number
  );
END;
$function$;

-- 5.9 UPDATE_AGENT_DUTY_STATUS
CREATE OR REPLACE FUNCTION public.update_agent_duty_status(p_agent_id uuid, p_status securia_agent_duty_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_agent security_agents%ROWTYPE;
BEGIN
  SELECT * INTO v_agent FROM security_agents WHERE id = p_agent_id OR user_id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent introuvable : %', p_agent_id;
  END IF;

  UPDATE security_agents
  SET duty_status = p_status, updated_at = NOW()
  WHERE id = v_agent.id;

  INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (
    gen_random_uuid()::text, v_agent.user_id::text, 'UPDATE_AGENT_DUTY_STATUS', 'security_agents', v_agent.id::text, jsonb_build_object('duty_status', p_status)
  );

  RETURN jsonb_build_object('agent_id', v_agent.id, 'duty_status', p_status, 'updated_at', NOW());
END;
$function$;

-- 5.10 UPDATE_AGENT_INTERVENTION_STATUS
CREATE OR REPLACE FUNCTION public.update_agent_intervention_status(p_alert_id uuid, p_agent_id uuid, p_action text, p_notes text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intervention interventions%ROWTYPE;
  v_alert alerts%ROWTYPE;
  v_agent security_agents%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_agent FROM security_agents WHERE id = p_agent_id OR user_id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent introuvable : %', p_agent_id;
  END IF;

  SELECT * INTO v_alert FROM alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerte introuvable : %', p_alert_id;
  END IF;

  IF v_alert.organization_id IS NOT NULL AND v_agent.organization_id IS NOT NULL THEN
    IF v_alert.organization_id <> v_agent.organization_id THEN
      RAISE EXCEPTION 'Violation de sécurité : Vous ne pouvez pas intervenir sur une organisation tierce';
    END IF;
  END IF;

  SELECT * INTO v_intervention 
  FROM interventions 
  WHERE alert_id = p_alert_id AND (agent_id = v_agent.id OR agent_id = v_agent.user_id)
  ORDER BY created_at DESC 
  LIMIT 1;

  IF p_action = 'ACCEPT' THEN
    IF v_intervention.id IS NOT NULL THEN
      UPDATE interventions
      SET status = 'ACCEPTED'::securia_intervention_status, accepted_at = NOW(), updated_at = NOW()
      WHERE id = v_intervention.id;
    ELSE
      INSERT INTO interventions (
        id, alert_id, security_center_id, agent_id, status, assigned_at, accepted_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_alert_id, v_alert.security_center_id, v_agent.id, 'ACCEPTED'::securia_intervention_status, NOW(), NOW(), NOW(), NOW()
      ) RETURNING * INTO v_intervention;
    END IF;

    UPDATE alerts SET status = 'ASSIGNED'::securia_alert_status, updated_at = NOW() WHERE id = p_alert_id;
    UPDATE security_agents SET duty_status = 'BUSY'::securia_agent_duty_status, updated_at = NOW() WHERE id = v_agent.id;

    INSERT INTO alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, metadata)
    VALUES (p_alert_id, v_agent.user_id, v_alert.status, 'ASSIGNED'::securia_alert_status, 'AGENT_ACCEPTED', 'Ordre de mission accepté par l''agent patrouilleur (' || v_agent.badge_number || ')', jsonb_build_object('agent_id', v_agent.id, 'badge', v_agent.badge_number));

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (gen_random_uuid()::text, v_agent.user_id::text, 'AGENT_ACCEPT_MISSION', 'alerts', p_alert_id::text, jsonb_build_object('status', 'ASSIGNED', 'agent_id', v_agent.id));

  ELSIF p_action = 'DEPART' THEN
    IF v_intervention.id IS NOT NULL THEN
      UPDATE interventions
      SET status = 'EN_ROUTE'::securia_intervention_status, en_route_at = NOW(), updated_at = NOW()
      WHERE id = v_intervention.id;
    ELSE
      INSERT INTO interventions (
        id, alert_id, security_center_id, agent_id, status, assigned_at, accepted_at, en_route_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_alert_id, v_alert.security_center_id, v_agent.id, 'EN_ROUTE'::securia_intervention_status, NOW(), NOW(), NOW(), NOW(), NOW()
      ) RETURNING * INTO v_intervention;
    END IF;

    UPDATE alerts SET status = 'EN_ROUTE'::securia_alert_status, updated_at = NOW() WHERE id = p_alert_id;
    UPDATE security_agents SET duty_status = 'DISPATCHED'::securia_agent_duty_status, current_latitude = COALESCE(p_latitude, current_latitude), current_longitude = COALESCE(p_longitude, current_longitude), last_location_update = NOW(), updated_at = NOW() WHERE id = v_agent.id;

    INSERT INTO alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, metadata)
    VALUES (p_alert_id, v_agent.user_id, v_alert.status, 'EN_ROUTE'::securia_alert_status, 'PATROL_EN_ROUTE', 'Départ de la patrouille d''intervention vers les lieux', jsonb_build_object('agent_id', v_agent.id, 'badge', v_agent.badge_number));

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (gen_random_uuid()::text, v_agent.user_id::text, 'AGENT_DEPARTURE_EN_ROUTE', 'alerts', p_alert_id::text, jsonb_build_object('status', 'EN_ROUTE', 'agent_id', v_agent.id));

  ELSIF p_action = 'ARRIVE' THEN
    IF v_intervention.id IS NOT NULL THEN
      UPDATE interventions SET status = 'ON_SITE'::securia_intervention_status, arrived_at = NOW(), updated_at = NOW() WHERE id = v_intervention.id;
    END IF;

    UPDATE alerts SET status = 'ARRIVED'::securia_alert_status, updated_at = NOW() WHERE id = p_alert_id;
    UPDATE security_agents SET current_latitude = COALESCE(p_latitude, current_latitude), current_longitude = COALESCE(p_longitude, current_longitude), last_location_update = NOW(), updated_at = NOW() WHERE id = v_agent.id;

    INSERT INTO alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, metadata)
    VALUES (p_alert_id, v_agent.user_id, v_alert.status, 'ARRIVED'::securia_alert_status, 'PATROL_ARRIVED', 'Agent de sécurité arrivé sur le site protégé', jsonb_build_object('agent_id', v_agent.id, 'badge', v_agent.badge_number));

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (gen_random_uuid()::text, v_agent.user_id::text, 'AGENT_ARRIVED_ON_SITE', 'alerts', p_alert_id::text, jsonb_build_object('status', 'ARRIVED', 'agent_id', v_agent.id));

  ELSIF p_action = 'COMPLETE' THEN
    IF v_intervention.id IS NOT NULL THEN
      UPDATE interventions SET status = 'COMPLETED'::securia_intervention_status, resolved_at = NOW(), report = p_notes, updated_at = NOW() WHERE id = v_intervention.id;
    END IF;

    UPDATE alerts SET status = 'RESOLVED'::securia_alert_status, resolution_report = p_notes, resolved_at = NOW(), updated_at = NOW() WHERE id = p_alert_id;
    UPDATE security_agents SET duty_status = 'AVAILABLE'::securia_agent_duty_status, updated_at = NOW() WHERE id = v_agent.id;

    INSERT INTO alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, metadata)
    VALUES (p_alert_id, v_agent.user_id, v_alert.status, 'RESOLVED'::securia_alert_status, 'INTERVENTION_COMPLETED', 'Intervention terminée et sécurisée par l''agent patrouilleur', jsonb_build_object('report', p_notes, 'agent_id', v_agent.id));

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (gen_random_uuid()::text, v_agent.user_id::text, 'AGENT_COMPLETED_INTERVENTION', 'alerts', p_alert_id::text, jsonb_build_object('status', 'RESOLVED', 'report', p_notes));

  ELSIF p_action = 'ABORT' THEN
    IF v_intervention.id IS NOT NULL THEN
      UPDATE interventions SET status = 'ABORTED'::securia_intervention_status, report = p_notes, updated_at = NOW() WHERE id = v_intervention.id;
    END IF;

    UPDATE alerts SET status = 'ESCALATED'::securia_alert_status, assigned_agent_id = NULL, updated_at = NOW() WHERE id = p_alert_id;
    UPDATE security_agents SET duty_status = 'BUSY'::securia_agent_duty_status, updated_at = NOW() WHERE id = v_agent.id;

    INSERT INTO alert_events (alert_id, actor_id, from_status, to_status, event_type, comment, metadata)
    VALUES (p_alert_id, v_agent.user_id, v_alert.status, 'ESCALATED'::securia_alert_status, 'AGENT_UNABLE_TO_RESPOND', 'Impossibilité d''intervenir signalée par l''agent : ' || COALESCE(p_notes, 'Motif non précisé'), jsonb_build_object('reason', p_notes, 'agent_id', v_agent.id));

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (gen_random_uuid()::text, v_agent.user_id::text, 'AGENT_UNABLE_TO_RESPOND', 'alerts', p_alert_id::text, jsonb_build_object('reason', p_notes, 'agent_id', v_agent.id));

    INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
    SELECT gen_random_uuid(), u.id, '🚨 Impossibilité d''intervention - ' || v_alert.alert_number, 'L''agent ' || v_agent.badge_number || ' a signalé une impossibilité d''intervenir : ' || COALESCE(p_notes, 'Sans motif'), 'ALERT_ESCALATED', '/dispatch/alerts/' || p_alert_id::text, false, NOW()
    FROM users u WHERE u.role IN ('SECURITY_MANAGER', 'ADMIN') AND (u.organization_id = v_alert.organization_id OR u.organization_id IS NULL);

  ELSE
    RAISE EXCEPTION 'Action inconnue : %', p_action;
  END IF;

  SELECT jsonb_build_object('alert_id', p_alert_id, 'agent_id', v_agent.id, 'action', p_action, 'status', (SELECT status FROM alerts WHERE id = p_alert_id), 'intervention_id', v_intervention.id, 'updated_at', NOW()) INTO v_result;

  RETURN v_result;
END;
$function$;

-- =============================================================================
-- SECURIA - ATOMIC INTERVENTION LIFECYCLE & TRANSACTIONAL OUTBOX MIGRATION
-- Migration : 20261015140000_atomic_intervention_lifecycle_and_outbox.sql
-- 
-- OBJECTIF :
-- 1. Introduire la procédure atomique unifiée public.transition_intervention_lifecycle
--    pour synchroniser en une seule transaction PostgreSQL :
--    - public.alerts
--    - public.interventions
--    - public.security_agents
--    - public.alert_events
--    - public.audit_logs
--    - public.notifications (Outbox)
-- 2. Index unique partiel de déduplication sur public.notifications ((metadata->>'dedup_key'))
-- 3. Transformer l'ancienne public.update_agent_intervention_status en wrapper compatible
--    avec refus sécurisé (fail-closed) pour les appels privilégiés sans acteur certifié.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. INDEX UNIQUE PARTIEL DE DÉDUPLICATION OUTBOX (public.notifications)
-- -----------------------------------------------------------------------------
-- STRATÉGIE DE MIGRATION & SÉCURITÉ DES DONNÉES EXISTANTES :
-- L'index utilise le prédicat WHERE (metadata->>'dedup_key') IS NOT NULL.
-- Toutes les notifications existantes en base (qui ne possèdent pas cette clé)
-- ont une valeur NULL pour metadata->>'dedup_key'. Elles sont donc totalement
-- exclues de l'index et ne provoquent AUCUN conflit ni violation d'unicité.
-- Aucune notification existante n'est altérée ni supprimée.

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup_key 
ON public.notifications ((metadata->>'dedup_key')) 
WHERE (metadata->>'dedup_key') IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. PROCÉDURE ATOMIQUE UNIFIÉE DU CYCLE DE VIE DES INTERVENTIONS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transition_intervention_lifecycle(
  p_alert_id uuid,
  p_agent_id uuid,
  p_action text,
  p_actor_user_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_intervention_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Variables d'environnement et de contexte
  v_is_direct_admin BOOLEAN := FALSE;
  v_is_service_role BOOLEAN := FALSE;
  v_is_platform_admin BOOLEAN := FALSE;
  v_effective_actor_id UUID;
  v_actor_user RECORD;
  v_actor_type TEXT;

  -- Variables d'entités avec verrouillage exclusif
  v_alert public.alerts%ROWTYPE;
  v_agent public.security_agents%ROWTYPE;
  v_intervention public.interventions%ROWTYPE;
  v_center public.security_centers%ROWTYPE;

  -- États précédents
  v_alert_prev_status securia_alert_status;
  v_int_prev_status securia_intervention_status;

  -- Nouveaux états cibles
  v_normalized_action TEXT;
  v_next_int_status securia_intervention_status;
  v_next_alert_status securia_alert_status;
  v_next_agent_status securia_agent_duty_status;

  -- Événements et audit
  v_event_type TEXT;
  v_comment TEXT;
  v_audit_action TEXT;

  -- Multi-missions
  v_other_active_count INTEGER := 0;
  v_has_en_route BOOLEAN := FALSE;

  -- Notifications outbox
  v_dedup_key TEXT;
  v_client_user_id UUID;
  v_supervisor_rec RECORD;
BEGIN
  -- ---------------------------------------------------------------------------
  -- ÉTAPE 1 : DÉTECTION DU CONTEXTE D'EXÉCUTION & RÉSOLUTION ANTI-USURPATION
  -- ---------------------------------------------------------------------------
  v_is_direct_admin := (session_user IN ('postgres', 'supabase_admin'));
  v_is_service_role := (auth.role() = 'service_role') OR (
    COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
  );

  IF auth.role() = 'authenticated' THEN
    -- Appel émis via JWT utilisateur : l'identité certifiée est strictement auth.uid()
    v_effective_actor_id := auth.uid();
    IF v_effective_actor_id IS NULL THEN
      RAISE EXCEPTION 'Session invalide ou non authentifiée.' USING ERRCODE = 'P4001';
    END IF;

    -- Règle absolue anti-usurpation (y compris pour platform_admins) :
    -- Le client ne peut jamais fournir un p_actor_user_id distinct de sa session
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id <> v_effective_actor_id THEN
      RAISE EXCEPTION 'Usurpation d''identité interdite : p_actor_user_id (%) ne correspond pas au compte authentifié (%).',
        p_actor_user_id, v_effective_actor_id
        USING ERRCODE = 'P4003';
    END IF;
  ELSIF v_is_service_role OR v_is_direct_admin THEN
    -- Appel privilégié serveur backend : l'acteur certifié doit être fourni explicitement
    IF p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'Refus d''exécution : tout appel privilégié de transition requiert un identifiant d''acteur certifié (p_actor_user_id).'
        USING ERRCODE = 'P4003';
    END IF;
    v_effective_actor_id := p_actor_user_id;
  ELSE
    RAISE EXCEPTION 'Accès refusé : contexte d''authentification non reconnu.' USING ERRCODE = 'P4001';
  END IF;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 2 : CONTRÔLE D'EXISTENCE ET VALIDITÉ DE L'ACTEUR (public.users)
  -- ---------------------------------------------------------------------------
  SELECT id, role, organization_id, security_center_id, is_active, full_name
  INTO v_actor_user
  FROM public.users
  WHERE id = v_effective_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acteur certifié introuvable dans public.users : %', v_effective_actor_id
      USING ERRCODE = 'P4003';
  END IF;

  IF v_actor_user.is_active = FALSE THEN
    RAISE EXCEPTION 'Compte utilisateur inactif ou suspendu : %', v_effective_actor_id
      USING ERRCODE = 'P4001';
  END IF;

  -- Vérification super-administrateur de plateforme
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = v_effective_actor_id
  ) INTO v_is_platform_admin;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 3 : VERROUILLAGE SÉQUENTIEL DES ENTITÉS (Ordre strict anti-deadlock)
  -- 1. alerts -> 2. interventions -> 3. security_agents
  -- ---------------------------------------------------------------------------
  -- 3.1 Verrouillage de l'alerte
  SELECT * INTO v_alert
  FROM public.alerts
  WHERE id = p_alert_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerte introuvable : %', p_alert_id USING ERRCODE = 'P4004';
  END IF;
  v_alert_prev_status := v_alert.status;

  -- 3.2 Verrouillage de l'agent de sécurité
  SELECT * INTO v_agent
  FROM public.security_agents
  WHERE id = p_agent_id OR user_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent de sécurité introuvable : %', p_agent_id USING ERRCODE = 'P4004';
  END IF;

  -- 3.3 Verrouillage de l'intervention
  IF p_intervention_id IS NOT NULL THEN
    SELECT * INTO v_intervention
    FROM public.interventions
    WHERE id = p_intervention_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_intervention
    FROM public.interventions
    WHERE alert_id = p_alert_id 
      AND (agent_id = v_agent.id OR agent_id = v_agent.user_id)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_int_prev_status := v_intervention.status;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 4 : DISTINCTION PATROUILLEUR vs SOC ET VÉRIFICATION D'AFFECTATION
  -- ---------------------------------------------------------------------------
  IF v_effective_actor_id = v_agent.user_id THEN
    v_actor_type := 'PATROL';
    -- Un patrouilleur ne peut modifier que ses propres interventions
    IF v_intervention.id IS NOT NULL AND v_intervention.agent_id <> v_agent.id THEN
      RAISE EXCEPTION 'Accès refusé : cette intervention est assignée à un autre agent.'
        USING ERRCODE = 'P4003';
    END IF;
  ELSE
    v_actor_type := 'SOC';
    -- Un intervenant tiers doit avoir un rôle d'encadrement ou être admin
    IF NOT v_is_platform_admin AND v_actor_user.role NOT IN ('SECURITY_MANAGER', 'ADMIN') THEN
      RAISE EXCEPTION 'Accès refusé : seuls les agents assignés ou les superviseurs SOC peuvent modifier une intervention.'
        USING ERRCODE = 'P4003';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 5 : VÉRIFICATION DE CLOISONNEMENT MULTI-TENANT
  -- ---------------------------------------------------------------------------
  IF NOT v_is_platform_admin AND v_actor_user.organization_id IS NOT NULL THEN
    -- Vérification si l'organisation de l'acteur correspond soit au client (alerte),
    -- soit au prestataire (agent ou centre de sécurité)
    IF v_actor_user.organization_id <> v_alert.organization_id 
       AND v_actor_user.organization_id <> v_agent.organization_id THEN
      
      -- Vérification via le centre de sécurité rattaché à l'alerte
      IF v_alert.security_center_id IS NOT NULL THEN
        SELECT * INTO v_center FROM public.security_centers WHERE id = v_alert.security_center_id;
        IF v_center.organization_id <> v_actor_user.organization_id THEN
          RAISE EXCEPTION 'Violation de sécurité multi-tenant : intervention hors périmètre organisation.'
            USING ERRCODE = 'P4003';
        END IF;
      ELSE
        RAISE EXCEPTION 'Violation de sécurité multi-tenant : intervention hors périmètre organisation.'
          USING ERRCODE = 'P4003';
      END IF;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 6 : IMMUABILITÉ STRICTE DES ÉTATS TERMINAUX
  -- ---------------------------------------------------------------------------
  IF v_intervention.id IS NOT NULL AND v_intervention.status IN ('COMPLETED', 'ABORTED') THEN
    RAISE EXCEPTION 'Intervention en statut terminal (%) : aucune modification autorisée.', v_intervention.status
      USING ERRCODE = 'P4009';
  END IF;

  IF v_alert.status IN ('RESOLVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Dossier d''alerte en statut terminal (%) : aucune modification autorisée.', v_alert.status
      USING ERRCODE = 'P4009';
  END IF;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 7 : NORMALISATION DE L'ACTION ET MACHINE À ÉTATS FINIS
  -- ---------------------------------------------------------------------------
  v_normalized_action := UPPER(TRIM(p_action));
  IF v_normalized_action = 'EN_ROUTE' THEN v_normalized_action := 'DEPART'; END IF;
  IF v_normalized_action = 'ARRIVED'  THEN v_normalized_action := 'ARRIVE'; END IF;
  IF v_normalized_action = 'RESOLVE'  THEN v_normalized_action := 'COMPLETE'; END IF;

  CASE v_normalized_action
    -- ACTION : ACCEPT
    WHEN 'ACCEPT' THEN
      IF v_intervention.id IS NOT NULL AND v_intervention.status = 'ACCEPTED' THEN
        -- Idempotence réseau
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'action', 'ACCEPT',
          'alert_id', v_alert.id,
          'alert_status', v_alert.status,
          'intervention_id', v_intervention.id,
          'intervention_status', v_intervention.status,
          'agent_id', v_agent.id,
          'agent_duty_status', v_agent.duty_status,
          'actor_user_id', v_effective_actor_id,
          'actor_type', v_actor_type,
          'message', 'Ordre de mission déjà accepté (idempotent)',
          'updated_at', now()
        );
      END IF;

      IF v_intervention.id IS NOT NULL AND v_intervention.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Transition invalide : Impossible d''accepter une mission au statut % (attendu : PENDING).',
          v_intervention.status
          USING ERRCODE = 'P4009';
      END IF;

      v_next_int_status := 'ACCEPTED'::securia_intervention_status;
      v_next_alert_status := 'ASSIGNED'::securia_alert_status;
      v_next_agent_status := 'BUSY'::securia_agent_duty_status;
      v_event_type := 'AGENT_ACCEPTED';
      v_comment := 'Ordre de mission accepté par l''agent patrouilleur (' || v_agent.badge_number || ')';
      v_audit_action := 'AGENT_ACCEPT_MISSION';

    -- ACTION : DEPART
    WHEN 'DEPART' THEN
      IF v_intervention.id IS NOT NULL AND v_intervention.status = 'EN_ROUTE' THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'action', 'DEPART',
          'alert_id', v_alert.id,
          'alert_status', v_alert.status,
          'intervention_id', v_intervention.id,
          'intervention_status', v_intervention.status,
          'agent_id', v_agent.id,
          'agent_duty_status', v_agent.duty_status,
          'actor_user_id', v_effective_actor_id,
          'actor_type', v_actor_type,
          'message', 'Patrouille déjà en route (idempotent)',
          'updated_at', now()
        );
      END IF;

      IF v_intervention.id IS NULL OR v_intervention.status <> 'ACCEPTED' THEN
        RAISE EXCEPTION 'Transition invalide : La mission doit être acceptée (ACCEPTED) avant le départ. Statut actuel : %',
          COALESCE(v_intervention.status::text, 'AUCUNE_INTERVENTION')
          USING ERRCODE = 'P4009';
      END IF;

      v_next_int_status := 'EN_ROUTE'::securia_intervention_status;
      v_next_alert_status := 'EN_ROUTE'::securia_alert_status;
      v_next_agent_status := 'DISPATCHED'::securia_agent_duty_status;
      v_event_type := 'PATROL_EN_ROUTE';
      v_comment := 'Départ de la patrouille d''intervention vers les lieux';
      v_audit_action := 'AGENT_DEPARTURE_EN_ROUTE';

    -- ACTION : ARRIVE
    WHEN 'ARRIVE' THEN
      IF v_intervention.id IS NOT NULL AND v_intervention.status = 'ON_SITE' THEN
        RETURN jsonb_build_object(
          'success', true,
          'idempotent', true,
          'action', 'ARRIVE',
          'alert_id', v_alert.id,
          'alert_status', v_alert.status,
          'intervention_id', v_intervention.id,
          'intervention_status', v_intervention.status,
          'agent_id', v_agent.id,
          'agent_duty_status', v_agent.duty_status,
          'actor_user_id', v_effective_actor_id,
          'actor_type', v_actor_type,
          'message', 'Patrouille déjà arrivée sur site (idempotent)',
          'updated_at', now()
        );
      END IF;

      IF v_intervention.id IS NULL OR v_intervention.status <> 'EN_ROUTE' THEN
        RAISE EXCEPTION 'Transition invalide : La patrouille doit être signalée en route (EN_ROUTE) avant confirmation d''arrivée. Statut actuel : %',
          COALESCE(v_intervention.status::text, 'AUCUNE_INTERVENTION')
          USING ERRCODE = 'P4009';
      END IF;

      v_next_int_status := 'ON_SITE'::securia_intervention_status;
      v_next_alert_status := 'ARRIVED'::securia_alert_status;
      v_next_agent_status := 'BUSY'::securia_agent_duty_status;
      v_event_type := 'PATROL_ARRIVED';
      v_comment := 'Agent de sécurité arrivé sur le site protégé';
      v_audit_action := 'AGENT_ARRIVED_ON_SITE';

    -- ACTION : COMPLETE
    WHEN 'COMPLETE' THEN
      IF v_intervention.id IS NULL OR v_intervention.status <> 'ON_SITE' THEN
        RAISE EXCEPTION 'Transition invalide : La mission ne peut être clôturée que si l''agent est sur les lieux (ON_SITE). Statut actuel : %',
          COALESCE(v_intervention.status::text, 'AUCUNE_INTERVENTION')
          USING ERRCODE = 'P4009';
      END IF;

      IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
        RAISE EXCEPTION 'Un compte-rendu d''intervention est obligatoire pour clôturer la mission.'
          USING ERRCODE = 'P4000';
      END IF;

      v_next_int_status := 'COMPLETED'::securia_intervention_status;
      v_next_alert_status := 'RESOLVED'::securia_alert_status;
      v_event_type := 'INTERVENTION_COMPLETED';
      v_comment := 'Intervention terminée et levée de doute effectuée';
      v_audit_action := 'AGENT_COMPLETED_INTERVENTION';

      -- Calcul du statut opérationnel de l'agent après clôture (gestion multi-missions)
      SELECT COUNT(*), COALESCE(bool_or(status = 'EN_ROUTE'), FALSE)
      INTO v_other_active_count, v_has_en_route
      FROM public.interventions
      WHERE agent_id = v_agent.id
        AND id <> v_intervention.id
        AND status IN ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE');

      IF v_other_active_count > 0 THEN
        IF v_has_en_route THEN
          v_next_agent_status := 'DISPATCHED'::securia_agent_duty_status;
        ELSE
          v_next_agent_status := 'BUSY'::securia_agent_duty_status;
        END IF;
      ELSE
        IF v_agent.duty_status = 'OFF_DUTY' OR v_agent.is_active = FALSE THEN
          v_next_agent_status := 'OFF_DUTY'::securia_agent_duty_status;
        ELSE
          v_next_agent_status := 'AVAILABLE'::securia_agent_duty_status;
        END IF;
      END IF;

    -- ACTION : ABORT
    WHEN 'ABORT' THEN
      IF v_intervention.id IS NOT NULL AND v_intervention.status IN ('COMPLETED', 'ABORTED') THEN
        RAISE EXCEPTION 'Cette mission est déjà terminée et ne peut plus être abandonnée.'
          USING ERRCODE = 'P4009';
      END IF;

      IF p_notes IS NULL OR TRIM(p_notes) = '' THEN
        RAISE EXCEPTION 'Un motif d''impossibilité d''intervention est obligatoire.'
          USING ERRCODE = 'P4000';
      END IF;

      v_next_int_status := 'ABORTED'::securia_intervention_status;
      v_next_alert_status := 'ESCALATED'::securia_alert_status;
      v_event_type := 'AGENT_UNABLE_TO_RESPOND';
      v_comment := 'Impossibilité d''intervenir signalée : ' || p_notes;
      v_audit_action := 'AGENT_ABORTED_MISSION';

      -- Calcul du statut opérationnel de l'agent après abandon (gestion multi-missions)
      SELECT COUNT(*), COALESCE(bool_or(status = 'EN_ROUTE'), FALSE)
      INTO v_other_active_count, v_has_en_route
      FROM public.interventions
      WHERE agent_id = v_agent.id
        AND (v_intervention.id IS NULL OR id <> v_intervention.id)
        AND status IN ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE');

      IF v_other_active_count > 0 THEN
        IF v_has_en_route THEN
          v_next_agent_status := 'DISPATCHED'::securia_agent_duty_status;
        ELSE
          v_next_agent_status := 'BUSY'::securia_agent_duty_status;
        END IF;
      ELSE
        IF v_agent.duty_status = 'OFF_DUTY' OR v_agent.is_active = FALSE THEN
          v_next_agent_status := 'OFF_DUTY'::securia_agent_duty_status;
        ELSE
          v_next_agent_status := 'AVAILABLE'::securia_agent_duty_status;
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION 'Action non reconnue : %. Valeurs permises: ACCEPT, DEPART, ARRIVE, COMPLETE, ABORT.',
        p_action
        USING ERRCODE = 'P4000';
  END CASE;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 8 : MUTATIONS ATOMIQUES SYNCHRONISÉES DANS LA TRANSACTION UNIQUE
  -- ---------------------------------------------------------------------------

  -- 8.1 Mutation de l'intervention
  IF v_intervention.id IS NOT NULL THEN
    UPDATE public.interventions
    SET status = v_next_int_status,
        accepted_at = CASE WHEN v_normalized_action = 'ACCEPT' THEN now() ELSE accepted_at END,
        en_route_at = CASE WHEN v_normalized_action = 'DEPART' THEN now() ELSE en_route_at END,
        arrived_at  = CASE WHEN v_normalized_action = 'ARRIVE' THEN now() ELSE arrived_at END,
        resolved_at = CASE WHEN v_normalized_action = 'COMPLETE' THEN now() ELSE resolved_at END,
        report      = CASE WHEN v_normalized_action IN ('COMPLETE', 'ABORT') THEN COALESCE(p_notes, report) ELSE report END,
        updated_at  = now()
    WHERE id = v_intervention.id
    RETURNING * INTO v_intervention;
  ELSE
    -- Initialisation lors d'un ACCEPT sans intervention pré-existante
    INSERT INTO public.interventions (
      id, alert_id, security_center_id, agent_id, status, assigned_at, accepted_at,
      client_organization_id, provider_organization_id, created_by, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_alert_id, v_alert.security_center_id, v_agent.id, v_next_int_status, now(), now(),
      v_alert.organization_id, v_agent.organization_id, v_effective_actor_id, now(), now()
    )
    RETURNING * INTO v_intervention;
  END IF;

  -- 8.2 Mutation de l'alerte
  UPDATE public.alerts
  SET status = v_next_alert_status,
      assigned_agent_id = CASE WHEN v_normalized_action = 'ABORT' THEN NULL ELSE COALESCE(assigned_agent_id, v_agent.id) END,
      resolution_report = CASE WHEN v_normalized_action = 'COMPLETE' THEN p_notes ELSE resolution_report END,
      resolved_at = CASE WHEN v_normalized_action = 'COMPLETE' THEN now() ELSE resolved_at END,
      escalated_at = CASE WHEN v_normalized_action = 'ABORT' THEN now() ELSE escalated_at END,
      updated_at = now()
  WHERE id = v_alert.id
  RETURNING * INTO v_alert;

  -- 8.3 Mutation de l'agent de sécurité
  UPDATE public.security_agents
  SET duty_status = v_next_agent_status,
      current_latitude = COALESCE(p_latitude, current_latitude),
      current_longitude = COALESCE(p_longitude, current_longitude),
      last_location_update = CASE WHEN p_latitude IS NOT NULL THEN now() ELSE last_location_update END,
      updated_at = now()
  WHERE id = v_agent.id
  RETURNING * INTO v_agent;

  -- 8.4 Enregistrement immuable dans alert_events
  INSERT INTO public.alert_events (
    id, alert_id, actor_id, from_status, to_status, event_type, comment, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_alert.id,
    v_effective_actor_id,
    v_alert_prev_status,
    v_next_alert_status,
    v_event_type,
    v_comment,
    jsonb_build_object(
      'action', v_normalized_action,
      'actor_user_id', v_effective_actor_id,
      'actor_type', v_actor_type,
      'actor_role', v_actor_user.role,
      'target_agent_id', v_agent.id,
      'target_agent_badge', v_agent.badge_number,
      'target_agent_user_id', v_agent.user_id,
      'intervention_id', v_intervention.id,
      'duty_status_after', v_next_agent_status,
      'latitude', p_latitude,
      'longitude', p_longitude,
      'notes', p_notes
    ),
    now()
  );

  -- 8.5 Enregistrement dans audit_logs
  INSERT INTO public.audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid()::text,
    v_effective_actor_id::text,
    v_audit_action,
    'interventions',
    v_intervention.id::text,
    jsonb_build_object(
      'alert_id', v_alert.id,
      'alert_number', v_alert.alert_number,
      'from_status', v_int_prev_status,
      'to_status', v_next_int_status,
      'agent_id', v_agent.id,
      'actor_type', v_actor_type,
      'duty_status', v_next_agent_status
    ),
    now()
  );

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 9 : NOTIFICATIONS OUTBOX TRANSACTIONNELLES (Sans appel réseau)
  -- ---------------------------------------------------------------------------
  v_client_user_id := v_alert.user_id;

  -- Notification client résident (IN_APP direct + Outbox PUSH selon action)
  IF v_client_user_id IS NOT NULL THEN
    IF v_normalized_action = 'DEPART' THEN
      -- IN_APP (immédiat)
      v_dedup_key := 'notif:' || v_intervention.id || ':DEPART:' || v_client_user_id || ':IN_APP';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Patrouille en route',
        'L''agent ' || v_agent.badge_number || ' fait route vers votre site sécurisé.',
        'INTERVENTION_EN_ROUTE',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'IN_APP', 'DELIVERED',
        jsonb_build_object('dedup_key', v_dedup_key),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

      -- OUTBOX PUSH (asynchrone)
      v_dedup_key := 'notif:' || v_intervention.id || ':DEPART:' || v_client_user_id || ':PUSH';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Patrouille en route',
        'L''agent ' || v_agent.badge_number || ' fait route vers votre site sécurisé.',
        'INTERVENTION_EN_ROUTE',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'PUSH', 'PENDING',
        jsonb_build_object('dedup_key', v_dedup_key, 'retry_count', 0),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

    ELSIF v_normalized_action = 'ARRIVE' THEN
      v_dedup_key := 'notif:' || v_intervention.id || ':ARRIVE:' || v_client_user_id || ':IN_APP';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Patrouille arrivée sur site',
        'L''agent ' || v_agent.badge_number || ' est arrivé sur place et débute la sécurisation.',
        'INTERVENTION_ON_SITE',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'IN_APP', 'DELIVERED',
        jsonb_build_object('dedup_key', v_dedup_key),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

      v_dedup_key := 'notif:' || v_intervention.id || ':ARRIVE:' || v_client_user_id || ':PUSH';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Patrouille arrivée sur site',
        'L''agent ' || v_agent.badge_number || ' est arrivé sur place et débute la sécurisation.',
        'INTERVENTION_ON_SITE',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'PUSH', 'PENDING',
        jsonb_build_object('dedup_key', v_dedup_key, 'retry_count', 0),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

    ELSIF v_normalized_action = 'COMPLETE' THEN
      v_dedup_key := 'notif:' || v_intervention.id || ':COMPLETE:' || v_client_user_id || ':IN_APP';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Intervention terminée',
        'Votre site a été sécurisé et le rapport de mission est disponible.',
        'INTERVENTION_COMPLETED',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'IN_APP', 'DELIVERED',
        jsonb_build_object('dedup_key', v_dedup_key),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

      v_dedup_key := 'notif:' || v_intervention.id || ':COMPLETE:' || v_client_user_id || ':EMAIL';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_client_user_id,
        'Rapport d''intervention certifié - ' || v_alert.alert_number,
        COALESCE(p_notes, 'Site sécurisé et certifié par l''agent patrouilleur.'),
        'INTERVENTION_COMPLETED',
        '/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'USER', 'EMAIL', 'PENDING',
        jsonb_build_object('dedup_key', v_dedup_key, 'retry_count', 0),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- Notification des superviseurs SOC en cas d'abandon / escalade
  IF v_normalized_action = 'ABORT' THEN
    FOR v_supervisor_rec IN
      SELECT id FROM public.users
      WHERE role IN ('SECURITY_MANAGER', 'ADMIN')
        AND (organization_id = v_alert.organization_id OR organization_id = v_agent.organization_id OR organization_id IS NULL)
        AND is_active = true
      LIMIT 10
    LOOP
      v_dedup_key := 'notif:' || v_intervention.id || ':ABORT:' || v_supervisor_rec.id || ':IN_APP';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_supervisor_rec.id,
        '🚨 Impossibilité d''intervention - ' || v_alert.alert_number,
        'L''agent ' || v_agent.badge_number || ' a signalé une impossibilité d''intervenir : ' || COALESCE(p_notes, 'Sans motif'),
        'ALERT_ESCALATED',
        '/dispatch/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'SECURITY_MANAGER', 'IN_APP', 'DELIVERED',
        jsonb_build_object('dedup_key', v_dedup_key),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;

      v_dedup_key := 'notif:' || v_intervention.id || ':ABORT:' || v_supervisor_rec.id || ':PUSH';
      INSERT INTO public.notifications (
        user_id, title, message, type, link, alert_id, intervention_id, agent_id, role, channel, status, metadata, is_read, created_at
      ) VALUES (
        v_supervisor_rec.id,
        '🚨 Impossibilité d''intervention - ' || v_alert.alert_number,
        'L''agent ' || v_agent.badge_number || ' a signalé une impossibilité : ' || COALESCE(p_notes, 'Sans motif'),
        'ALERT_ESCALATED',
        '/dispatch/alerts/' || v_alert.id,
        v_alert.id, v_intervention.id, v_agent.id, 'SECURITY_MANAGER', 'PUSH', 'PENDING',
        jsonb_build_object('dedup_key', v_dedup_key, 'retry_count', 0),
        false, now()
      ) ON CONFLICT ((metadata->>'dedup_key')) WHERE (metadata->>'dedup_key') IS NOT NULL DO NOTHING;
    END LOOP;
  END IF;

  -- ---------------------------------------------------------------------------
  -- ÉTAPE 10 : RETOUR ATOMIQUE ET CERTIFIÉ
  -- ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'action', v_normalized_action,
    'alert_id', v_alert.id,
    'alert_number', v_alert.alert_number,
    'alert_status', v_alert.status,
    'intervention_id', v_intervention.id,
    'intervention_status', v_intervention.status,
    'agent_id', v_agent.id,
    'agent_badge', v_agent.badge_number,
    'agent_duty_status', v_agent.duty_status,
    'actor_user_id', v_effective_actor_id,
    'actor_type', v_actor_type,
    'actor_role', v_actor_user.role,
    'message', 'Action ' || v_normalized_action || ' exécutée avec succès',
    'updated_at', now()
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. WRAPPER DE COMPATIBILITÉ POUR public.update_agent_intervention_status
-- -----------------------------------------------------------------------------
-- Préserve la signature historique tout en appliquant le refus sécurisé (fail-closed)
-- si un appel privilégié tente d'agir sans identité d'acteur vérifiable.

CREATE OR REPLACE FUNCTION public.update_agent_intervention_status(
  p_alert_id uuid,
  p_agent_id uuid,
  p_action text,
  p_notes text DEFAULT NULL::text,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_actor UUID;
  v_result JSONB;
BEGIN
  -- RÈGLE DE REFUS SÉCURISÉ :
  -- Si un utilisateur est authentifié via son token personnel, son identité est certifiée via auth.uid().
  -- Si l'appel utilise un rôle privilégié (service_role ou interne) sans session utilisateur,
  -- l'appel est formellement REFUSÉ car l'ancienne signature ne permet pas de tracer l'acteur avec certitude.
  IF auth.uid() IS NOT NULL THEN
    v_effective_actor := auth.uid();
  ELSIF (auth.role() = 'service_role') OR (session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'Refus d''exécution : tout appel privilégié de transition requiert une identité d''acteur certifiée. Utilisez public.transition_intervention_lifecycle avec le paramètre p_actor_user_id.'
      USING ERRCODE = 'P4003';
  ELSE
    RAISE EXCEPTION 'Accès refusé : session non authentifiée.' USING ERRCODE = 'P4001';
  END IF;

  -- Délégation vers la procédure unifiée atomique
  v_result := public.transition_intervention_lifecycle(
    p_alert_id       => p_alert_id,
    p_agent_id       => p_agent_id,
    p_action         => p_action,
    p_actor_user_id  => v_effective_actor,
    p_notes          => p_notes,
    p_latitude       => p_latitude,
    p_longitude      => p_longitude
  );

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PROPRIÉTAIRE ET DROITS D'EXÉCUTION
-- -----------------------------------------------------------------------------
-- Attribution explicite de la propriété au rôle de confiance 'postgres'
-- requis pour l'exécution sécurisée des procédures SECURITY DEFINER
ALTER FUNCTION public.transition_intervention_lifecycle(uuid, uuid, text, uuid, text, double precision, double precision, uuid) OWNER TO postgres;
ALTER FUNCTION public.update_agent_intervention_status(uuid, uuid, text, text, double precision, double precision) OWNER TO postgres;

-- Droits d'exécution restreints (révocation de tout accès public/anonyme)
REVOKE ALL ON FUNCTION public.transition_intervention_lifecycle(uuid, uuid, text, uuid, text, double precision, double precision, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_intervention_lifecycle(uuid, uuid, text, uuid, text, double precision, double precision, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_agent_intervention_status(uuid, uuid, text, text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_agent_intervention_status(uuid, uuid, text, text, double precision, double precision) TO authenticated, service_role;

COMMIT;

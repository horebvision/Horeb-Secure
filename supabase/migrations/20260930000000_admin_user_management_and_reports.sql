-- ==============================================================================
-- SECURIA - GESTION ADMINISTRATIVE DES COMPTES & PROCÉDURES DE PURGE SÉCURISÉES
-- Permet à l'administrateur de supprimer n'importe quel profil de test
-- dans public.users ET dans auth.users (libération immédiate pour réinscription)
-- ==============================================================================

-- 1. PROCÉDURE DE SUPPRESSION D'UN COMPTE INDIVIDUEL PAR L'ADMIN
CREATE OR REPLACE FUNCTION public.admin_delete_user_account(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_id UUID := auth.uid();
  v_target_email TEXT;
BEGIN
  -- Vérifier que l'appelant est authentifié et possède le rôle ADMIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Accès refusé : Seul un administrateur peut supprimer un compte utilisateur.';
  END IF;

  -- Interdiction formelle de supprimer son propre compte administrateur
  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Action impossible : Vous ne pouvez pas supprimer votre propre compte administrateur connecté.';
  END IF;

  -- Vérifier que l'utilisateur cible existe
  SELECT email INTO v_target_email FROM public.users WHERE id = p_target_user_id;

  -- 1. Nettoyage des notifications
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;

  -- 2. Nettoyage des événements d'alerte et interventions liés
  DELETE FROM public.alert_events 
  WHERE actor_id = p_target_user_id 
     OR alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id);

  DELETE FROM public.interventions 
  WHERE alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id)
     OR agent_id IN (SELECT id FROM public.security_agents WHERE user_id = p_target_user_id);

  -- 3. Nettoyage des alertes du compte
  DELETE FROM public.alerts WHERE user_id = p_target_user_id;

  -- 4. Nettoyage des sites protégés, contacts et membres
  DELETE FROM public.site_members WHERE user_id = p_target_user_id;
  DELETE FROM public.emergency_contacts WHERE user_id = p_target_user_id;
  DELETE FROM public.protected_sites WHERE owner_id = p_target_user_id;

  -- 5. Nettoyage des patrouilles agents
  DELETE FROM public.security_agents WHERE user_id = p_target_user_id;

  -- 6. Suppression du profil applicatif public.users
  DELETE FROM public.users WHERE id = p_target_user_id;

  -- 7. Suppression définitive du compte auth.users (libère l'email pour nouvelle inscription)
  DELETE FROM auth.users WHERE id = p_target_user_id;

  -- Journalisation d'audit
  INSERT INTO public.audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (
    gen_random_uuid()::text,
    v_caller_id::text,
    'ADMIN_DELETE_USER_ACCOUNT',
    'users',
    p_target_user_id::text,
    jsonb_build_object('deleted_email', v_target_email, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'email', v_target_email
  );
END;
$$;

-- 2. PROCÉDURE DE PURGE GLOBALE DE TOUS LES COMPTES DE TEST (CONSERVE L'ADMIN)
-- [SÉCURITÉ P0 : DÉPRÉCIÉ ET NEUTRALISÉ] : Supprimé définitivement par la migration additive 20261012000300.
CREATE OR REPLACE FUNCTION public.admin_purge_all_test_accounts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_id UUID := auth.uid();
  v_deleted_count INT := 0;
BEGIN
  -- Vérifier que l'appelant est authentifié et possède le rôle ADMIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = v_caller_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'ADMIN' THEN
    RAISE EXCEPTION 'Accès refusé : Seul un administrateur peut purger les comptes de test.';
  END IF;

  -- 1. Notifications des comptes de test
  DELETE FROM public.notifications WHERE user_id <> v_caller_id;

  -- 2. Événements et interventions liés aux comptes de test
  DELETE FROM public.alert_events 
  WHERE actor_id <> v_caller_id 
     OR alert_id IN (SELECT id FROM public.alerts WHERE user_id <> v_caller_id);

  DELETE FROM public.interventions 
  WHERE alert_id IN (SELECT id FROM public.alerts WHERE user_id <> v_caller_id)
     OR agent_id IN (SELECT id FROM public.security_agents WHERE user_id <> v_caller_id);

  -- 3. Alertes des utilisateurs de test
  DELETE FROM public.alerts WHERE user_id <> v_caller_id;

  -- 4. Sites et contacts
  DELETE FROM public.site_members WHERE user_id <> v_caller_id;
  DELETE FROM public.emergency_contacts WHERE user_id <> v_caller_id;
  DELETE FROM public.protected_sites WHERE owner_id <> v_caller_id;

  -- 5. Agents de test
  DELETE FROM public.security_agents WHERE user_id <> v_caller_id;

  -- Nombre d'utilisateurs purgés
  SELECT count(*) INTO v_deleted_count FROM public.users WHERE id <> v_caller_id;

  -- 6. Suppression dans public.users
  DELETE FROM public.users WHERE id <> v_caller_id;

  -- 7. Suppression dans auth.users pour réinscriptions immédiates
  DELETE FROM auth.users WHERE id <> v_caller_id;

  -- Journalisation d'audit
  INSERT INTO public.audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (
    gen_random_uuid()::text,
    v_caller_id::text,
    'ADMIN_PURGE_TEST_ACCOUNTS',
    'users',
    v_caller_id::text,
    jsonb_build_object('deleted_count', v_deleted_count, 'purged_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$$;

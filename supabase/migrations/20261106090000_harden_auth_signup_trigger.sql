-- =============================================================================
-- Durcissement de la création de comptes (auth.users → public.users)
-- =============================================================================
-- Faille corrigée : le trigger copiait dans public.users (source d'autorité des
-- rôles) le rôle et l'organisation fournis dans raw_user_meta_data, champ que
-- toute personne peut renseigner lors d'une inscription avec la clé publique.
-- Combiné à auto_confirm_user (e-mail validé d'office), n'importe qui pouvait
-- devenir ADMIN de l'organisation de son choix.
--
-- Désormais :
--  - seul raw_app_meta_data (modifiable uniquement avec la clé secrète) est lu ;
--  - l'organisation doit exister, sinon aucun rôle privilégié n'est accordé ;
--  - le profil existant n'est jamais écrasé (les API serveur écrivent ensuite
--    elles-mêmes le profil définitif) ;
--  - les e-mails ne sont plus confirmés d'office.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_securia_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_meta      jsonb := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
  v_role      securia_user_role := 'USER';
  v_org_id    uuid;
  v_center_id uuid;
BEGIN
  IF (v_meta ->> 'role') IN ('AGENT', 'SECURITY_MANAGER', 'ADMIN', 'SECRETARY') THEN
    v_role := (v_meta ->> 'role')::securia_user_role;
  END IF;

  IF (v_meta ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT o.id INTO v_org_id FROM public.organizations o WHERE o.id = (v_meta ->> 'organization_id')::uuid;
  END IF;

  -- Aucun rôle privilégié sans organisation vérifiée
  IF v_org_id IS NULL THEN
    v_role := 'USER';
  ELSE
    IF (v_meta ->> 'security_center_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT sc.id INTO v_center_id FROM public.security_centers sc
      WHERE sc.id = (v_meta ->> 'security_center_id')::uuid AND sc.organization_id = v_org_id;
    END IF;
    IF v_center_id IS NULL THEN
      SELECT sc.id INTO v_center_id FROM public.security_centers sc
      WHERE sc.organization_id = v_org_id AND sc.is_active ORDER BY sc.created_at LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.users (id, email, full_name, phone, role, organization_id, security_center_id, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'Utilisateur'),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'phone', ''), '+225 00 00 00 00'),
    v_role,
    v_org_id,
    v_center_id,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_role = 'AGENT' THEN
    INSERT INTO public.security_agents (user_id, organization_id, security_center_id, badge_number, duty_status, patrol_vehicle, is_active)
    VALUES (NEW.id, v_org_id, v_center_id, 'AGT-' || upper(substring(NEW.id::text, 1, 6)), 'AVAILABLE', NULL, true)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer la création du compte Auth ; le serveur écrit le profil ensuite.
  RAISE WARNING 'handle_new_securia_user: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_securia_user() FROM PUBLIC, anon, authenticated;

-- Les e-mails ne sont plus confirmés d'office : les comptes créés par le serveur
-- le sont explicitement (email_confirm: true) ; les autres doivent valider leur e-mail.
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_confirm_user() FROM PUBLIC, anon, authenticated;

COMMIT;

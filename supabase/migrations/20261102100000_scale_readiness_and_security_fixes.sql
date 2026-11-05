-- =============================================================================
-- Migration : 20261102100000_scale_readiness_and_security_fixes.sql
-- Objet     : Correctifs bloquants pour l'exploitation à grande échelle
--   1. Numéro d'alerte unique par séquence (fin des collisions SEC-AAAA-XXXX)
--   2. trigger_alert_engine : contrôle de propriété du site, aucun routage
--      inter-tenant, notifications limitées à l'organisation de l'alerte
--   3. Révocation de l'exécution publique des fonctions SECURITY DEFINER
--      recevant l'identité de l'acteur en paramètre (usurpation via clé anon)
--   4. Rate limiting distribué (partagé entre instances serverless)
--   5. audit_logs.organization_id (isolation multi-tenant des journaux)
--   6. Tables manquantes : clients, client_invitations, organization_memberships
--      + colonnes protected_sites.client_id et users.client_id
--   7. Buckets de stockage privés : documents, exports
-- Idempotente : peut être rejouée sans effet de bord.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. NUMÉRO D'ALERTE UNIQUE
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.alert_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_alert_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'SEC-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('public.alert_number_seq')::text, 6, '0');
$$;

-- -----------------------------------------------------------------------------
-- 2. MOTEUR D'ALERTE DURCI
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_alert_engine(
  p_user_id uuid,
  p_site_id uuid DEFAULT NULL::uuid,
  p_type text DEFAULT 'INTRUSION'::text,
  p_priority text DEFAULT NULL::text,
  p_latitude double precision DEFAULT NULL::double precision,
  p_longitude double precision DEFAULT NULL::double precision,
  p_location_address text DEFAULT NULL::text,
  p_is_silent boolean DEFAULT false,
  p_client_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_escalation_seconds integer DEFAULT 60
)
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

  -- Le site transmis n'est retenu que s'il appartient au déclencheur ou à son organisation
  IF p_site_id IS NOT NULL THEN
    SELECT * INTO v_site FROM protected_sites
    WHERE id = p_site_id
      AND (owner_id = p_user_id OR (v_user.organization_id IS NOT NULL AND organization_id = v_user.organization_id));
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
    p_location_address := COALESCE(
      v_site.address,
      CASE WHEN p_latitude IS NOT NULL THEN 'Position GPS en direct' ELSE 'Position inconnue — contacter le client' END
    );
  END IF;

  v_center_id := COALESCE(v_site.security_center_id, v_user.security_center_id);
  v_org_id := COALESCE(v_site.organization_id, v_user.organization_id);

  -- Centre de repli STRICTEMENT dans la même organisation (jamais celui d'un autre tenant)
  IF v_center_id IS NULL AND v_org_id IS NOT NULL THEN
    SELECT id INTO v_center_id
    FROM security_centers
    WHERE is_active = true AND organization_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_alert_id := gen_random_uuid();
  v_alert_number := public.next_alert_number();

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

  v_escalation_deadline := NOW() + (GREATEST(COALESCE(p_escalation_seconds, 60), 10) || ' seconds')::INTERVAL;

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

  -- Notifications in-app : uniquement les opérateurs actifs de l'organisation de l'alerte
  IF v_org_id IS NOT NULL THEN
    INSERT INTO notifications (
      id, user_id, title, message, type, link, is_read, created_at
    )
    SELECT
      gen_random_uuid(), u.id, 'ALERTE ' || v_priority || ' : ' || p_type,
      'Alerte ' || v_alert_number || ' à ' || p_location_address || ' par ' || v_user.full_name,
      'ALERT_TRIGGERED', '/dispatch/alerts/' || v_alert_id, false, NOW()
    FROM users u
    WHERE u.role IN ('SECURITY_MANAGER', 'ADMIN')
      AND u.organization_id = v_org_id
      AND u.is_active = true;
  END IF;

  SELECT * INTO v_existing_alert FROM alerts WHERE id = v_alert_id;

  RETURN jsonb_build_object(
    'success', true, 'is_duplicate', false, 'message', 'Alerte transmise avec succès au centre de sécurité',
    'alert', row_to_json(v_existing_alert), 'security_center_id', v_center_id, 'alert_number', v_alert_number
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. EXÉCUTION DES FONCTIONS PRIVILÉGIÉES RÉSERVÉE AU SERVEUR
--    → appliquée en fin de migration (section 8) afin de couvrir aussi les
--      fonctions créées ci-dessous.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. RATE LIMITING DISTRIBUÉ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at ON public.api_rate_limits (reset_at);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès exclusif via service_role / fonction ci-dessous.

CREATE OR REPLACE FUNCTION public.securia_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, remaining integer, reset_in_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_reset TIMESTAMPTZ;
BEGIN
  INSERT INTO api_rate_limits AS rl (key, count, reset_at)
  VALUES (p_key, 1, NOW() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rl.reset_at <= NOW() THEN 1 ELSE rl.count + 1 END,
    reset_at = CASE WHEN rl.reset_at <= NOW() THEN NOW() + make_interval(secs => p_window_seconds) ELSE rl.reset_at END
  RETURNING rl.count, rl.reset_at INTO v_count, v_reset;

  RETURN QUERY SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    GREATEST(CEIL(EXTRACT(EPOCH FROM (v_reset - NOW())))::integer, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.securia_rate_limit_hit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.securia_rate_limit_hit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.securia_rate_limit_hit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.securia_rate_limit_hit(text, integer, integer) TO service_role;

-- Purge horaire des compteurs expirés (si pg_cron est disponible)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'securia_purge_rate_limits';
    PERFORM cron.schedule(
      'securia_purge_rate_limits',
      '17 * * * *',
      $cron$DELETE FROM public.api_rate_limits WHERE reset_at < NOW() - INTERVAL '1 hour';$cron$
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. ISOLATION MULTI-TENANT DES JOURNAUX D'AUDIT
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS organization_id UUID;

CREATE OR REPLACE FUNCTION public.trg_fn_audit_logs_set_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF (NEW.details ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      NEW.organization_id := (NEW.details ->> 'organization_id')::uuid;
    ELSIF NEW.user_id IS NOT NULL THEN
      SELECT u.organization_id INTO NEW.organization_id FROM users u WHERE u.id::text = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_set_organization ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_set_organization
  BEFORE INSERT OR UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_audit_logs_set_organization();

UPDATE public.audit_logs a
SET organization_id = (a.details ->> 'organization_id')::uuid
WHERE a.organization_id IS NULL
  AND (a.details ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.audit_logs a
SET organization_id = u.organization_id
FROM public.users u
WHERE a.organization_id IS NULL AND u.id::text = a.user_id;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs (organization_id, created_at DESC);

-- Accès direct (PostgREST) : lecture limitée à l'organisation, écriture réservée
-- au serveur. L'application lit et écrit exclusivement via ses API (clé secrète).
-- Avant : tout ADMIN/SECURITY_MANAGER lisait les journaux de toutes les entreprises
-- et tout utilisateur connecté pouvait insérer des entrées falsifiées.
DROP POLICY IF EXISTS "Lecture securisee audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Insertion securisee audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select_scoped ON public.audit_logs;
CREATE POLICY audit_logs_select_scoped ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.app_is_platform_admin()
  OR (
    organization_id IS NOT NULL
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- -----------------------------------------------------------------------------
-- 6. TABLES MANQUANTES (référencées par le code applicatif)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'PARTICULIER',
  primary_contact_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Côte d''Ivoire',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_org_status ON public.clients (organization_id, status);

CREATE TABLE IF NOT EXISTS public.client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role = 'USER'),
  token TEXT NOT NULL UNIQUE,
  allowed_site_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- En production, la table existait déjà sans updated_at (utilisée lors des révocations)
ALTER TABLE public.client_invitations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_client_invitations_org ON public.client_invitations (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_client_invitations_client ON public.client_invitations (client_id);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_membership UNIQUE (user_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON public.organization_memberships (organization_id, status);

-- Adhésion principale de chaque utilisateur existant
INSERT INTO public.organization_memberships (user_id, organization_id, role, status)
SELECT u.id, u.organization_id, u.role::text, CASE WHEN u.is_active THEN 'ACTIVE' ELSE 'SUSPENDED' END
FROM public.users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

ALTER TABLE public.protected_sites ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_protected_sites_client ON public.protected_sites (client_id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_client ON public.users (client_id);

-- Reprise des clients et invitations déjà stockés de façon provisoire dans audit_logs
INSERT INTO public.clients (id, organization_id, name, client_type, primary_contact_name, email, phone, whatsapp, address, city, country, status, notes, created_at, updated_at)
SELECT
  (a.details ->> 'id')::uuid,
  (a.details ->> 'organization_id')::uuid,
  COALESCE(a.details ->> 'name', 'Client'),
  COALESCE(a.details ->> 'client_type', 'PARTICULIER'),
  a.details ->> 'primary_contact_name',
  a.details ->> 'email',
  a.details ->> 'phone',
  a.details ->> 'whatsapp',
  a.details ->> 'address',
  a.details ->> 'city',
  a.details ->> 'country',
  CASE WHEN a.details ->> 'status' IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED') THEN a.details ->> 'status' ELSE 'ACTIVE' END,
  a.details ->> 'notes',
  COALESCE((a.details ->> 'created_at')::timestamptz, a.created_at),
  NOW()
FROM public.audit_logs a
JOIN public.organizations o ON o.id::text = a.details ->> 'organization_id'
WHERE a.entity_type = 'client'
  AND (a.details ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_invitations (id, organization_id, client_id, email, full_name, phone, token, status, expires_at, invited_by, used_at, created_at)
SELECT
  (a.details ->> 'id')::uuid,
  (a.details ->> 'organization_id')::uuid,
  c.id,
  a.details ->> 'email',
  a.details ->> 'full_name',
  a.details ->> 'phone',
  a.details ->> 'token',
  CASE WHEN a.details ->> 'status' IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED') THEN a.details ->> 'status' ELSE 'PENDING' END,
  COALESCE((a.details ->> 'expires_at')::timestamptz, NOW()),
  CASE WHEN (a.details ->> 'invited_by') ~* '^[0-9a-f-]{36}$' THEN (a.details ->> 'invited_by')::uuid END,
  (a.details ->> 'used_at')::timestamptz,
  COALESCE((a.details ->> 'created_at')::timestamptz, a.created_at)
FROM public.audit_logs a
JOIN public.organizations o ON o.id::text = a.details ->> 'organization_id'
LEFT JOIN public.clients c ON c.id::text = a.details ->> 'client_id'
WHERE a.entity_type = 'client_invitation'
  AND (a.details ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND a.details ->> 'token' IS NOT NULL
  AND a.details ->> 'email' IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS : lecture limitée à l'organisation ; écritures via les API serveur (service_role)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_select_org ON public.clients;
CREATE POLICY clients_select_org ON public.clients FOR SELECT
USING (public.app_is_platform_admin() OR organization_id = public.app_current_org());

-- client_invitations : aucune policy (contient des jetons) -> service_role uniquement

DROP POLICY IF EXISTS org_memberships_select_self_or_org ON public.organization_memberships;
CREATE POLICY org_memberships_select_self_or_org ON public.organization_memberships FOR SELECT
USING (
  user_id = auth.uid()
  OR public.app_is_platform_admin()
  OR organization_id = public.app_current_org()
);

-- -----------------------------------------------------------------------------
-- 7. BUCKETS DE STOCKAGE PRIVÉS
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documents', 'documents', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('exports', 'exports', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false;

-- -----------------------------------------------------------------------------
-- 7 bis. SUPER ADMIN PLATEFORME
--    La RLS v4.2 reconnaît le Super Admin via public.platform_admins. On y inscrit
--    le compte déjà reconnu par l'application (SUPER_ADMIN_EMAIL, src/modules/users/types.ts)
--    afin qu'il conserve sa supervision transverse ; aucun autre droit n'est accordé.
-- -----------------------------------------------------------------------------
INSERT INTO public.platform_admins (user_id, notes)
SELECT u.id, 'Super Admin plateforme (SUPER_ADMIN_EMAIL)'
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE lower(u.email) = lower('ahossancedric22@gmail.com')
  AND u.role = 'ADMIN'
  AND u.is_active = true
ON CONFLICT (user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. FONCTIONS SECURITY DEFINER : EXÉCUTION RÉSERVÉE AU SERVEUR (service_role)
--    Ces fonctions contournent la RLS et, pour la plupart, reçoivent l'identité
--    de l'acteur en paramètre sans vérifier auth.uid() : exécutables avec la clé
--    publique, elles permettaient d'agir au nom de n'importe qui (créer une
--    alerte, réinitialiser des mots de passe, réinitialiser le pilote…).
--    L'application ne les appelle que depuis ses API serveur (clé secrète) et
--    pg_cron. Les fonctions de trigger n'ont pas besoin du droit EXECUTE.
--    Exceptions : les assistants utilisés par les policies RLS, qui doivent
--    rester exécutables par les rôles qui interrogent les tables.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prokind = 'f'
      -- Assistants d'identité (dérivent l'acteur de auth.uid()) utilisés par la RLS
      AND p.proname NOT IN (
        'get_current_user_org_id', 'get_current_user_role', 'is_admin', 'is_site_member', 'is_site_owner',
        'app_is_admin_context', 'app_is_platform_admin', 'app_current_org', 'app_current_role',
        'app_current_agent_ids', 'is_platform_admin'
      )
      -- Toute autre fonction référencée par une policy reste exécutable
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies pol
        WHERE coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\s*\(')
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;

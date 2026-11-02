-- ==============================================================================
-- PROJET SECURIA - MIGRATION INITIALE (POSTGRESQL & SUPABASE)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TYPES ENUMÉRÉS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_duty_status AS ENUM ('OFF_DUTY', 'AVAILABLE', 'BUSY', 'DISPATCHED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM ('INTRUSION', 'MENACE', 'AGRESSION', 'PERSONNE_SUSPECTE', 'URGENCE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM (
    'CREATED',
    'SENT',
    'RECEIVED',
    'ACKNOWLEDGED',
    'ASSIGNED',
    'EN_ROUTE',
    'ARRIVED',
    'RESOLVED',
    'CANCELLED',
    'FALSE_ALARM',
    'ESCALATED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES PRINCIPALES

-- 3.1 ORGANISATIONS (Centres de télésurveillance et sécurité partenaires)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 PROFILS UTILISATEURS (Étendant auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  agent_status agent_duty_status DEFAULT 'OFF_DUTY',
  avatar_url TEXT,
  emergency_contacts JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 SITES PROTÉGÉS (Domiciles, commerces, entreprises des résidents)
CREATE TABLE IF NOT EXISTS public.protected_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  site_type TEXT NOT NULL DEFAULT 'RESIDENCE',
  address TEXT NOT NULL,
  city TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  access_instructions TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 ALERTES DE SÉCURITÉ
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.protected_sites(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  type alert_type NOT NULL,
  priority alert_priority NOT NULL DEFAULT 'HIGH',
  status alert_status NOT NULL DEFAULT 'CREATED',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_address TEXT,
  is_silent BOOLEAN NOT NULL DEFAULT false,
  client_notes TEXT,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_report TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 HISTORIQUE & JOURNALISATION DES ÉVÉNEMENTS D'ALERTE (Audit Trail immuable)
CREATE TABLE IF NOT EXISTS public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_status alert_status,
  to_status alert_status,
  event_type TEXT NOT NULL,
  comment TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6 LOGS D'AUDIT SYSTÈME
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. INDEX POUR LES PERFORMANCES
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_organization_id ON public.alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_agent_id ON public.alerts(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_id ON public.alert_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_protected_sites_user_id ON public.protected_sites(user_id);

-- 5. TRIGGERS AUTOMATIQUES
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_protected_sites_updated_at ON public.protected_sites;
CREATE TRIGGER set_protected_sites_updated_at BEFORE UPDATE ON public.protected_sites
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_alerts_updated_at ON public.alerts;
CREATE TRIGGER set_alerts_updated_at BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger automatique de journalisation des changements de statut d'alerte
CREATE OR REPLACE FUNCTION public.handle_alert_status_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO public.alert_events (
        alert_id,
        actor_id,
        from_status,
        to_status,
        event_type,
        comment,
        metadata
      ) VALUES (
        NEW.id,
        NEW.assigned_agent_id,
        OLD.status,
        NEW.status,
        'STATUS_CHANGE',
        'Transition d''état automatique: ' || OLD.status || ' -> ' || NEW.status,
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'assigned_agent_id', NEW.assigned_agent_id
        )
      );
    END IF;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.alert_events (
      alert_id,
      actor_id,
      from_status,
      to_status,
      event_type,
      comment,
      metadata
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NULL,
      NEW.status,
      'ALERT_CREATED',
      'Déclenchement initial de l''alerte ' || NEW.alert_number,
      jsonb_build_object(
        'type', NEW.type,
        'priority', NEW.priority,
        'is_silent', NEW.is_silent
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alert_audit_trigger ON public.alerts;
CREATE TRIGGER alert_audit_trigger
AFTER INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.handle_alert_status_audit();

-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.1 Politiques Profiles
DROP POLICY IF EXISTS "Les utilisateurs peuvent lire leur profil" ON public.profiles;
CREATE POLICY "Les utilisateurs peuvent lire leur profil"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('SECURITY_MANAGER', 'ADMIN')
));

DROP POLICY IF EXISTS "Les utilisateurs peuvent modifier leur profil" ON public.profiles;
CREATE POLICY "Les utilisateurs peuvent modifier leur profil"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- 6.2 Politiques Sites protégés
DROP POLICY IF EXISTS "Clients gèrent leurs propres sites" ON public.protected_sites;
CREATE POLICY "Clients gèrent leurs propres sites"
ON public.protected_sites FOR ALL
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('SECURITY_MANAGER', 'AGENT', 'ADMIN')
));

-- 6.3 Politiques Alertes
DROP POLICY IF EXISTS "Clients créent et voient leurs alertes" ON public.alerts;
CREATE POLICY "Clients créent et voient leurs alertes"
ON public.alerts FOR SELECT
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND (
    p.role IN ('SECURITY_MANAGER', 'ADMIN')
    OR (p.role = 'AGENT' AND (public.alerts.assigned_agent_id = auth.uid() OR public.alerts.assigned_agent_id IS NULL))
  )
));

DROP POLICY IF EXISTS "Clients insèrent leurs alertes" ON public.alerts;
CREATE POLICY "Clients insèrent leurs alertes"
ON public.alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Opérateurs et agents mettent à jour les alertes" ON public.alerts;
CREATE POLICY "Opérateurs et agents mettent à jour les alertes"
ON public.alerts FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (
      p.role IN ('SECURITY_MANAGER', 'ADMIN')
      OR (p.role = 'AGENT' AND public.alerts.assigned_agent_id = auth.uid())
    )
  )
);

-- 6.4 Politiques Alert Events
DROP POLICY IF EXISTS "Lecture des événements d'alerte autorisés" ON public.alert_events;
CREATE POLICY "Lecture des événements d'alerte autorisés"
ON public.alert_events FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.alerts a WHERE a.id = public.alert_events.alert_id
));

-- 7. ACTIVATION TEMPS RÉEL SUR LES TABLES
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_events;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

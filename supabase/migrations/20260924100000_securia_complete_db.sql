-- ==============================================================================
-- PROJET SECURIA - MIGRATION COMPLÈTE BASE DE DONNÉES SUPABASE
-- Tables : users, organizations, security_centers, security_agents,
--          protected_sites, site_members, alerts, alert_events,
--          interventions, notifications, emergency_contacts, audit_logs
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TYPES ET ÉNUMÉRATIONS (Prefixés pour isolation totale)
DO $$ BEGIN
  CREATE TYPE securia_user_role AS ENUM ('USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_agent_duty_status AS ENUM ('OFF_DUTY', 'AVAILABLE', 'BUSY', 'DISPATCHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_alert_type AS ENUM ('INTRUSION', 'MENACE', 'AGRESSION', 'PERSONNE_SUSPECTE', 'URGENCE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_alert_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_alert_status AS ENUM (
    'CREATED', 'SENT', 'RECEIVED', 'ACKNOWLEDGED',
    'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED',
    'CANCELLED', 'FALSE_ALARM', 'ESCALATED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_intervention_status AS ENUM ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'ABORTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_site_type AS ENUM ('RESIDENCE', 'COMMERCE', 'ENTREPRISE', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_site_member_role AS ENUM ('OWNER', 'FAMILY', 'EMPLOYEE', 'SECURITY_CONTACT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABLES PRINCIPALES

-- 3.1 ORGANISATIONS
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

-- 3.2 CENTRES DE SÉCURITÉ
CREATE TABLE IF NOT EXISTS public.security_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 UTILISATEURS
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role securia_user_role NOT NULL DEFAULT 'USER',
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  security_center_id UUID REFERENCES public.security_centers(id) ON DELETE SET NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 AGENTS DE SÉCURITÉ
CREATE TABLE IF NOT EXISTS public.security_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  security_center_id UUID REFERENCES public.security_centers(id) ON DELETE SET NULL,
  badge_number TEXT UNIQUE NOT NULL,
  duty_status securia_agent_duty_status NOT NULL DEFAULT 'OFF_DUTY',
  patrol_vehicle TEXT,
  current_latitude DOUBLE PRECISION,
  current_longitude DOUBLE PRECISION,
  last_location_update TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 SITES PROTÉGÉS
CREATE TABLE IF NOT EXISTS public.protected_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  security_center_id UUID REFERENCES public.security_centers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  site_type securia_site_type NOT NULL DEFAULT 'RESIDENCE',
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

-- 3.6 MEMBRES DU SITE
CREATE TABLE IF NOT EXISTS public.site_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_role securia_site_member_role NOT NULL DEFAULT 'FAMILY',
  can_trigger_alert BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(site_id, user_id)
);

-- 3.7 INTERVENTIONS
CREATE TABLE IF NOT EXISTS public.interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID,
  security_center_id UUID REFERENCES public.security_centers(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.security_agents(id) ON DELETE SET NULL,
  status securia_intervention_status NOT NULL DEFAULT 'PENDING',
  assigned_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  report TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8 ALERTES
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.protected_sites(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  security_center_id UUID REFERENCES public.security_centers(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.security_agents(id) ON DELETE SET NULL,
  intervention_id UUID REFERENCES public.interventions(id) ON DELETE SET NULL,
  type securia_alert_type NOT NULL,
  priority securia_alert_priority NOT NULL DEFAULT 'HIGH',
  status securia_alert_status NOT NULL DEFAULT 'CREATED',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_address TEXT,
  is_silent BOOLEAN NOT NULL DEFAULT false,
  client_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.interventions
  ADD CONSTRAINT fk_interventions_alert
  FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3.9 ÉVÉNEMENTS D'ALERTE
CREATE TABLE IF NOT EXISTS public.alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  from_status securia_alert_status,
  to_status securia_alert_status,
  event_type TEXT NOT NULL,
  comment TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 CONTACTS D'URGENCE
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  phone TEXT NOT NULL,
  priority_order INTEGER DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. INDEX DE RECHERCHE ET PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_alerts_alert_number ON public.alerts(alert_number);
CREATE INDEX IF NOT EXISTS idx_alerts_security_center ON public.alerts(security_center_id);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_agent ON public.alerts(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_alert_id ON public.interventions(alert_id);
CREATE INDEX IF NOT EXISTS idx_interventions_agent_id ON public.interventions(agent_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON public.interventions(status);
CREATE INDEX IF NOT EXISTS idx_protected_sites_owner ON public.protected_sites(owner_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON public.alert_events(alert_id);

-- 5. TRIGGERS AUTOMATIQUES
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orgs_updated_at ON public.organizations;
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_centers_updated_at ON public.security_centers;
CREATE TRIGGER trg_centers_updated_at BEFORE UPDATE ON public.security_centers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_agents_updated_at ON public.security_agents;
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON public.security_agents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_sites_updated_at ON public.protected_sites;
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON public.protected_sites
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_alerts_updated_at ON public.alerts;
CREATE TRIGGER trg_alerts_updated_at BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_interventions_updated_at ON public.interventions;
CREATE TRIGGER trg_interventions_updated_at BEFORE UPDATE ON public.interventions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

-- POLICIES
DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
CREATE POLICY "Lecture profil utilisateur" ON public.users FOR SELECT
USING (
  auth.uid() = id
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'ADMIN'))
);

DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
CREATE POLICY "Modification propre profil" ON public.users FOR UPDATE
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Gestion contacts d'urgence" ON public.emergency_contacts;
CREATE POLICY "Gestion contacts d'urgence" ON public.emergency_contacts FOR ALL
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Gestion des sites protégés" ON public.protected_sites;
CREATE POLICY "Gestion des sites protégés" ON public.protected_sites FOR ALL
USING (
  auth.uid() = owner_id
  OR EXISTS (SELECT 1 FROM public.site_members sm WHERE sm.site_id = public.protected_sites.id AND sm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'AGENT', 'ADMIN'))
);

DROP POLICY IF EXISTS "Lecture des alertes" ON public.alerts;
CREATE POLICY "Lecture des alertes" ON public.alerts FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND (
      u.role IN ('SECURITY_MANAGER', 'ADMIN')
      OR (u.role = 'AGENT' AND (
        public.alerts.assigned_agent_id IN (SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid())
        OR public.alerts.assigned_agent_id IS NULL
      ))
    )
  )
);

DROP POLICY IF EXISTS "Insertion alerte par résident" ON public.alerts;
CREATE POLICY "Insertion alerte par résident" ON public.alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Mise a jour alerte autorisée" ON public.alerts;
CREATE POLICY "Mise a jour alerte autorisée" ON public.alerts FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND (
      u.role IN ('SECURITY_MANAGER', 'ADMIN')
      OR (u.role = 'AGENT' AND public.alerts.assigned_agent_id IN (SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
CREATE POLICY "Lecture des interventions" ON public.interventions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.alerts a WHERE a.id = public.interventions.alert_id AND a.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'ADMIN')
  )
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = public.interventions.agent_id
  )
);

DROP POLICY IF EXISTS "Mise a jour intervention par agent ou centre" ON public.interventions;
CREATE POLICY "Mise a jour intervention par agent ou centre" ON public.interventions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('SECURITY_MANAGER', 'ADMIN')
  )
  OR EXISTS (
    SELECT 1 FROM public.security_agents sa WHERE sa.user_id = auth.uid() AND sa.id = public.interventions.agent_id
  )
);

DROP POLICY IF EXISTS "Lecture des événements d'alerte" ON public.alert_events;
CREATE POLICY "Lecture des événements d'alerte" ON public.alert_events FOR SELECT
USING (EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = public.alert_events.alert_id));

-- 7. TEMPS RÉEL (SUPABASE REALTIME)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_events;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.interventions;
EXCEPTION WHEN duplicate_object THEN null; END $$;

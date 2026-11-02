-- ========================================================
-- SECURIA — CONSOLIDATED STAGING MIGRATIONS (PHASE 1 À 12)
-- ========================================================

-- >>>>> MIGRATION: 20260924100000_securia_complete_db.sql <<<<<
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


-- >>>>> MIGRATION: 20260924102500_securia_triggers_and_policies.sql <<<<<
-- ==============================================================================
-- SECURIA - POLICIES REFINEMENT, LIFECYCLE TRIGGER & RLS HELPER FUNCTIONS
-- ==============================================================================

-- 1. HELPER FUNCTIONS (SECURITY DEFINER to prevent RLS recursion)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS securia_user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_current_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_site_member(p_site_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_members
    WHERE site_id = p_site_id AND user_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_site_owner(p_site_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.protected_sites
    WHERE id = p_site_id AND owner_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. LIFECYCLE TRIGGER FOR IMMUTABLE ALERT AUDIT TRAIL
CREATE OR REPLACE FUNCTION public.log_alert_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
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
      'Alerte initiale créée',
      jsonb_build_object('type', NEW.type, 'priority', NEW.priority, 'is_silent', NEW.is_silent)
    );
  ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
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
      COALESCE(auth.uid(), NEW.user_id),
      OLD.status,
      NEW.status,
      'STATUS_CHANGED',
      concat('Statut changé de ', OLD.status, ' vers ', NEW.status),
      jsonb_build_object('assigned_agent_id', NEW.assigned_agent_id, 'intervention_id', NEW.intervention_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_alert_lifecycle_events ON public.alerts;
CREATE TRIGGER trg_alert_lifecycle_events
  AFTER INSERT OR UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.log_alert_status_transition();

-- 3. POLICIES REFINEMENT

-- USERS
DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
DROP POLICY IF EXISTS "Création profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Suppression profil admin" ON public.users;

CREATE POLICY "Lecture profil utilisateur" ON public.users FOR SELECT
USING (
  auth.uid() = id
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
  OR EXISTS (
    SELECT 1 FROM public.interventions i
    JOIN public.alerts a ON a.id = i.alert_id
    JOIN public.security_agents sa ON sa.id = i.agent_id
    WHERE sa.user_id = auth.uid() AND a.user_id = public.users.id
  )
);

CREATE POLICY "Création profil utilisateur" ON public.users FOR INSERT
WITH CHECK (auth.uid() = id OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Modification propre profil" ON public.users FOR UPDATE
USING (auth.uid() = id OR public.get_current_user_role() = 'ADMIN');

-- ORGANIZATIONS
DROP POLICY IF EXISTS "Lecture organisations autorisées" ON public.organizations;
DROP POLICY IF EXISTS "Gestion organisations admin" ON public.organizations;

CREATE POLICY "Lecture organisations autorisées" ON public.organizations FOR SELECT
USING (id = public.get_current_user_org_id() OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Gestion organisations admin" ON public.organizations FOR ALL
USING (public.get_current_user_role() = 'ADMIN');

-- SECURITY CENTERS
DROP POLICY IF EXISTS "Lecture centres autorisés" ON public.security_centers;
DROP POLICY IF EXISTS "Gestion centres responsable ou admin" ON public.security_centers;

CREATE POLICY "Lecture centres autorisés" ON public.security_centers FOR SELECT
USING (
  organization_id = public.get_current_user_org_id()
  OR public.get_current_user_role() IN ('ADMIN', 'USER')
);

CREATE POLICY "Gestion centres responsable ou admin" ON public.security_centers FOR ALL
USING (
  public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
);

-- SECURITY AGENTS
DROP POLICY IF EXISTS "Lecture agents autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Mise a jour agent autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Gestion agents manager admin" ON public.security_agents;

CREATE POLICY "Lecture agents autorisée" ON public.security_agents FOR SELECT
USING (
  user_id = auth.uid()
  OR organization_id = public.get_current_user_org_id()
  OR public.get_current_user_role() = 'ADMIN'
);

CREATE POLICY "Mise a jour agent autorisée" ON public.security_agents FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
);

CREATE POLICY "Gestion agents manager admin" ON public.security_agents FOR ALL
USING (public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN'));

-- PROTECTED SITES
DROP POLICY IF EXISTS "Gestion des sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Lecture des sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Insertion sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Modification sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Suppression sites protégés" ON public.protected_sites;

CREATE POLICY "Lecture des sites protégés" ON public.protected_sites FOR SELECT
USING (
  owner_id = auth.uid()
  OR public.is_site_member(public.protected_sites.id, auth.uid())
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
  OR (public.get_current_user_role() = 'AGENT' AND EXISTS (
    SELECT 1 FROM public.alerts a
    JOIN public.security_agents sa ON sa.id = a.assigned_agent_id
    WHERE a.site_id = public.protected_sites.id AND sa.user_id = auth.uid()
  ))
);

CREATE POLICY "Insertion sites protégés" ON public.protected_sites FOR INSERT
WITH CHECK (owner_id = auth.uid() OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Modification sites protégés" ON public.protected_sites FOR UPDATE
USING (owner_id = auth.uid() OR public.get_current_user_role() = 'ADMIN');

CREATE POLICY "Suppression sites protégés" ON public.protected_sites FOR DELETE
USING (owner_id = auth.uid() OR public.get_current_user_role() = 'ADMIN');

-- SITE MEMBERS
ALTER TABLE public.site_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture membres site" ON public.site_members;
DROP POLICY IF EXISTS "Gestion membres site" ON public.site_members;

CREATE POLICY "Lecture membres site" ON public.site_members FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_site_owner(site_id, auth.uid())
  OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN')
);

CREATE POLICY "Gestion membres site" ON public.site_members FOR ALL
USING (
  public.is_site_owner(site_id, auth.uid())
  OR public.get_current_user_role() = 'ADMIN'
);

-- ALERTS
DROP POLICY IF EXISTS "Lecture des alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alertes" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alertes" ON public.alerts;

CREATE POLICY "Lecture des alertes" ON public.alerts FOR SELECT
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND (organization_id = public.get_current_user_org_id() OR organization_id IS NULL))
  OR (public.get_current_user_role() = 'AGENT' AND (
    assigned_agent_id IN (SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid())
    OR assigned_agent_id IS NULL
  ))
);

CREATE POLICY "Insertion alertes" ON public.alerts FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.get_current_user_role() IN ('SECURITY_MANAGER', 'ADMIN'));

CREATE POLICY "Mise a jour alertes" ON public.alerts FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND (organization_id = public.get_current_user_org_id() OR organization_id IS NULL))
  OR (public.get_current_user_role() = 'AGENT' AND assigned_agent_id IN (
    SELECT sa.id FROM public.security_agents sa WHERE sa.user_id = auth.uid()
  ))
);

-- INTERVENTIONS
DROP POLICY IF EXISTS "Lecture des interventions" ON public.interventions;
DROP POLICY IF EXISTS "Mise a jour interventions" ON public.interventions;
DROP POLICY IF EXISTS "Insertion interventions" ON public.interventions;

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


-- >>>>> MIGRATION: 20260924120000_securia_rpc_functions.sql <<<<<
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


-- >>>>> MIGRATION: 20260924140000_escalation_hardening.sql <<<<<
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


-- >>>>> MIGRATION: 20260927130000_sites_dispatch_rls_hardening.sql <<<<<
-- ==============================================================================
-- SECURIA - DISPATCH & SITES RLS HARDENING AND MAP SYNCHRONIZATION
-- ==============================================================================

-- 1. HARDEN RLS POLICIES FOR PROTECTED_SITES
ALTER TABLE public.protected_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestion des sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Lecture des sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Insertion sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Modification sites protégés" ON public.protected_sites;
DROP POLICY IF EXISTS "Suppression sites protégés" ON public.protected_sites;

-- A. SELECT: Users see their own sites, Security Managers see their org sites, Admins see all
CREATE POLICY "Lecture des sites protégés" ON public.protected_sites FOR SELECT
USING (
  owner_id = auth.uid()
  OR public.is_site_member(public.protected_sites.id, auth.uid())
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
  OR (public.get_current_user_role() = 'AGENT' AND EXISTS (
    SELECT 1 FROM public.alerts a
    JOIN public.security_agents sa ON sa.id = a.assigned_agent_id
    WHERE a.site_id = public.protected_sites.id AND sa.user_id = auth.uid()
  ))
);

-- B. INSERT: Clients can add their own sites; Security Managers can add sites to their org; Admins can add any
CREATE POLICY "Insertion sites protégés" ON public.protected_sites FOR INSERT
WITH CHECK (
  owner_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
);

-- C. UPDATE: Clients can edit their own sites; Security Managers can edit their org sites; Admins can edit any
CREATE POLICY "Modification sites protégés" ON public.protected_sites FOR UPDATE
USING (
  owner_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
);

-- D. DELETE: Clients can delete their own sites; Security Managers can delete their org sites; Admins can delete any
CREATE POLICY "Suppression sites protégés" ON public.protected_sites FOR DELETE
USING (
  owner_id = auth.uid()
  OR public.get_current_user_role() = 'ADMIN'
  OR (public.get_current_user_role() = 'SECURITY_MANAGER' AND organization_id = public.get_current_user_org_id())
);

-- 2. CREATE_PROTECTED_SITE STORED PROCEDURE (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_protected_site(
  p_owner_id uuid,
  p_organization_id uuid,
  p_security_center_id uuid,
  p_name text,
  p_site_type text,
  p_address text,
  p_city text,
  p_postal_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_access_instructions text,
  p_is_default boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_site protected_sites%ROWTYPE;
  v_site_id uuid := gen_random_uuid();
  v_resolved_org uuid := p_organization_id;
  v_resolved_center uuid := p_security_center_id;
BEGIN
  -- Si l'organisation n'est pas fournie, tenter de résoudre depuis le profil du propriétaire
  IF v_resolved_org IS NULL AND p_owner_id IS NOT NULL THEN
    SELECT organization_id, security_center_id INTO v_resolved_org, v_resolved_center
    FROM public.users WHERE id = p_owner_id;
  END IF;

  -- Si toujours NULL, rattacher au centre opérationnel par défaut
  IF v_resolved_org IS NULL THEN
    SELECT id INTO v_resolved_org FROM public.organizations WHERE is_active = true LIMIT 1;
  END IF;

  IF p_is_default THEN
    UPDATE protected_sites SET is_default = false WHERE owner_id = p_owner_id;
  END IF;

  INSERT INTO protected_sites (
    id, owner_id, organization_id, security_center_id, name,
    site_type, address, city, postal_code, latitude, longitude,
    access_instructions, is_default, created_at, updated_at
  ) VALUES (
    v_site_id,
    p_owner_id,
    v_resolved_org,
    v_resolved_center,
    p_name,
    COALESCE(p_site_type, 'RESIDENCE')::securia_site_type,
    p_address,
    COALESCE(p_city, 'Abidjan'),
    COALESCE(p_postal_code, 'BP 01'),
    p_latitude,
    p_longitude,
    p_access_instructions,
    COALESCE(p_is_default, false),
    now(),
    now()
  )
  RETURNING * INTO v_site;

  RETURN jsonb_build_object('success', true, 'site', row_to_json(v_site));
END;
$function$;

-- 3. GET_DISPATCH_MAP_DATA PROCEDURE (SECURITY DEFINER)
-- Garantit le retour de TOUS les sites réels de l'organisation avec coordonnées GPS numériques valides
CREATE OR REPLACE FUNCTION public.get_dispatch_map_data(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sites jsonb;
  v_agents jsonb;
  v_interventions jsonb;
  v_target_org uuid := p_org_id;
BEGIN
  -- Si l'org n'est pas précisée, utiliser celle de l'utilisateur appelant
  IF v_target_org IS NULL THEN
    v_target_org := public.get_current_user_org_id();
  END IF;

  -- 1. Sites protégés rattachés à l'organisation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'name', ps.name,
      'site_type', ps.site_type,
      'address', ps.address,
      'city', COALESCE(ps.city, 'Abidjan'),
      'postal_code', ps.postal_code,
      'latitude', ps.latitude,
      'longitude', ps.longitude,
      'access_instructions', ps.access_instructions,
      'is_default', ps.is_default,
      'created_at', ps.created_at,
      'organization_id', ps.organization_id,
      'owner', jsonb_build_object(
        'id', u.id,
        'full_name', COALESCE(u.full_name, 'Client Sécuria'),
        'phone', u.phone,
        'email', u.email
      ),
      'has_active_alert', EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
      ),
      'active_alert', (
        SELECT jsonb_build_object(
          'id', a.id,
          'alert_number', a.alert_number,
          'type', a.type,
          'priority', a.priority,
          'status', a.status,
          'created_at', a.created_at
        )
        FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
        ORDER BY a.created_at DESC
        LIMIT 1
      )
    )
  ), '[]'::jsonb)
  INTO v_sites
  FROM public.protected_sites ps
  LEFT JOIN public.users u ON u.id = ps.owner_id
  WHERE (v_target_org IS NULL OR ps.organization_id = v_target_org)
    AND ps.latitude IS NOT NULL
    AND ps.longitude IS NOT NULL;

  -- 2. Agents actifs en patrouille
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'agent_name', COALESCE(u.full_name, 'Agent Patrouille'),
      'badge_number', sa.badge_number,
      'duty_status', sa.duty_status,
      'latitude', sa.latitude,
      'longitude', sa.longitude,
      'phone', u.phone,
      'patrol_vehicle', COALESCE(sa.patrol_vehicle, 'Patrouille Alpha Securia'),
      'last_update', sa.updated_at
    )
  ), '[]'::jsonb)
  INTO v_agents
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE (v_target_org IS NULL OR sa.organization_id = v_target_org)
    AND sa.latitude IS NOT NULL
    AND sa.longitude IS NOT NULL;

  -- 3. Interventions actives
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'alert_id', i.alert_id,
      'alert_number', a.alert_number,
      'status', i.status,
      'type', a.type,
      'priority', a.priority,
      'created_at', i.created_at,
      'site', jsonb_build_object(
        'id', ps.id,
        'name', ps.name,
        'address', ps.address,
        'latitude', ps.latitude,
        'longitude', ps.longitude
      ),
      'agent', jsonb_build_object(
        'id', sa.id,
        'name', u.full_name,
        'badge_number', sa.badge_number,
        'latitude', sa.latitude,
        'longitude', sa.longitude
      )
    )
  ), '[]'::jsonb)
  INTO v_interventions
  FROM public.interventions i
  JOIN public.alerts a ON a.id = i.alert_id
  LEFT JOIN public.protected_sites ps ON ps.id = a.site_id
  LEFT JOIN public.security_agents sa ON sa.id = i.agent_id
  LEFT JOIN public.users u ON u.id = sa.user_id
  WHERE (v_target_org IS NULL OR a.organization_id = v_target_org)
    AND i.status NOT IN ('COMPLETED', 'ABORTED');

  RETURN jsonb_build_object(
    'sites', v_sites,
    'agents', v_agents,
    'active_interventions', v_interventions
  );
END;
$function$;


-- >>>>> MIGRATION: 20260930000000_admin_user_management_and_reports.sql <<<<<
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


-- >>>>> MIGRATION: 20260930100000_phase3_proof_of_intervention.sql <<<<<
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


-- >>>>> MIGRATION: 20260930200000_phase4_export_signature_webhooks.sql <<<<<
-- ==============================================================================
-- SECURIA V2 — PHASE 4 : EXPORT CENTER, SIGNATURE ÉLECTRONIQUE & WEBHOOKS
-- Schéma et politiques de sécurité (RLS) pour :
-- 1. Les exports massifs multi-interventions (CSV / ZIP)
-- 2. La signature tactile/électronique avec consentement et empreinte SHA-256
-- 3. La configuration des partenaires tiers (Assurances, Systèmes Métier)
-- 4. La livraison fiable des webhooks avec HMAC, idempotence et retries
-- ==============================================================================

-- 1. TABLE DES JOBS D'EXPORTATION (EXPORT CENTER)
CREATE TABLE IF NOT EXISTS public.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  file_path TEXT,
  download_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_org_status ON public.export_jobs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_requested_by ON public.export_jobs(requested_by);
CREATE INDEX IF NOT EXISTS idx_export_jobs_expires_at ON public.export_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_token ON public.export_jobs(download_token);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Export jobs org isolation" ON public.export_jobs;
CREATE POLICY "Export jobs org isolation" ON public.export_jobs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 2. TABLE DES SIGNATURES ÉLECTRONIQUES D'INTERVENTION
CREATE TABLE IF NOT EXISTS public.intervention_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  report_version INTEGER NOT NULL DEFAULT 1,
  signer_name TEXT NOT NULL,
  signer_role TEXT NOT NULL DEFAULT 'CLIENT' CHECK (signer_role IN ('CLIENT', 'ON_SITE_REPRESENTATIVE', 'WITNESS', 'SECURITY_MANAGER')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_image TEXT NOT NULL, -- Data URI ou chemin de stockage
  signature_hash TEXT NOT NULL, -- SHA-256 du contenu signé
  consent_text TEXT NOT NULL,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'SIGNED' CHECK (status IN ('NOT_SIGNED', 'PENDING', 'SIGNED', 'REVOKED')),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_intervention ON public.intervention_signatures(intervention_id, report_version);
CREATE INDEX IF NOT EXISTS idx_signatures_org ON public.intervention_signatures(organization_id);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON public.intervention_signatures(status);

ALTER TABLE public.intervention_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signatures intervention access" ON public.intervention_signatures;
CREATE POLICY "Signatures intervention access" ON public.intervention_signatures
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'USER')
    )
  );

-- 3. TABLE DES PARTENAIRES D'INTÉGRATION (WEBHOOKS)
CREATE TABLE IF NOT EXISTS public.integration_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'INSURER' CHECK (type IN ('INSURER', 'CLIENT_SYSTEM', 'SECURITY_PARTNER', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  endpoint_url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '["REPORT_VALIDATED"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partners_org_status ON public.integration_partners(organization_id, status);

ALTER TABLE public.integration_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners org managers only" ON public.integration_partners;
CREATE POLICY "Partners org managers only" ON public.integration_partners
  FOR ALL
  USING (
    (organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('SECURITY_MANAGER', 'ADMIN')
    )) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 4. TABLE DES LIVRAISONS DE WEBHOOKS (IDEMPOTENCE ET HISTORIQUE)
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.integration_partners(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'RETRYING', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  response_code INTEGER,
  last_error TEXT,
  payload JSONB NOT NULL,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_partner_event_idempotency UNIQUE(partner_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_partner ON public.webhook_deliveries(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON public.webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON public.webhook_deliveries(status, next_retry_at) WHERE status = 'RETRYING';

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Webhook deliveries org isolation" ON public.webhook_deliveries;
CREATE POLICY "Webhook deliveries org isolation" ON public.webhook_deliveries
  FOR ALL
  USING (
    (organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('SECURITY_MANAGER', 'ADMIN')
    )) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );


-- >>>>> MIGRATION: 20260930300000_phase5_security_business_os.sql <<<<<
-- =============================================================================
-- SECURIA V2 — PHASE 5 : SECURITY BUSINESS OS SCHEMA & MIGRATION
-- Analytics, Rentabilité, API Keys & Business Reporting
-- =============================================================================

-- 1. Table des clés d'accès API publique (api_keys)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL, -- e.g. sec_live_9a8b
  key_hash VARCHAR(128) NOT NULL,  -- SHA-256 de la clé complète
  scopes TEXT[] NOT NULL DEFAULT ARRAY['alerts:read', 'interventions:read'],
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id);

-- 2. Table des paramètres financiers d'organisation (organization_financial_settings)
CREATE TABLE IF NOT EXISTS public.organization_financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL DEFAULT 'XOF',
  agent_hourly_cost NUMERIC(12,2),       -- Coût horaire chargé agent (e.g. 2500 FCFA/h)
  vehicle_hourly_cost NUMERIC(12,2),     -- Coût horaire véhicule/moto (e.g. 1500 FCFA/h)
  fixed_intervention_cost NUMERIC(12,2), -- Forfait frais fixes par déploiement (e.g. 5000 FCFA)
  cost_per_kilometer NUMERIC(12,2),      -- Coût estimé au km (e.g. 350 FCFA/km)
  default_billing_rate NUMERIC(12,2),    -- Forfait moyen facturé client par intervention (e.g. 25000 FCFA)
  target_gross_margin_pct NUMERIC(5,2),  -- Cible de marge brute en % (e.g. 40.00%)
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_org_financial_settings_org ON public.organization_financial_settings(organization_id);

-- 3. Table des rapports planifiés (scheduled_reports)
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  report_type VARCHAR(50) NOT NULL, -- EXECUTIVE_SUMMARY, OPERATIONS, SLA, AGENT_PERFORMANCE, FINANCIAL
  frequency VARCHAR(20) NOT NULL DEFAULT 'WEEKLY', -- DAILY, WEEKLY, MONTHLY
  format VARCHAR(10) NOT NULL DEFAULT 'PDF', -- PDF, CSV
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  last_sent_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_org ON public.scheduled_reports(organization_id);

-- 4. Politiques RLS (Row Level Security)
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour api_keys : Seuls les admins et security managers de l'organisation accèdent aux clés
CREATE POLICY "api_keys_org_isolation" ON public.api_keys
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- Politiques RLS pour organization_financial_settings : Restreint à l'organisation
CREATE POLICY "org_financial_settings_isolation" ON public.organization_financial_settings
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- Politiques RLS pour scheduled_reports : Restreint à l'organisation
CREATE POLICY "scheduled_reports_isolation" ON public.scheduled_reports
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );


-- >>>>> MIGRATION: 20260930400000_phase6_saas_billing.sql <<<<<
-- ============================================================================
-- SECURIA V2 — PHASE 6 : ENTERPRISE SaaS & BILLING MIGRATION
-- Plans, Subscriptions, Invoices, Payments, Commercial Leads & Quotas
-- ============================================================================

-- 1. TABLE DES PLANS COMMERCIAUX SaaS
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- 'STARTER', 'PROFESSIONNEL', 'BUSINESS', 'ENTERPRISE'
    name TEXT NOT NULL,
    description TEXT,
    monthly_price INTEGER NOT NULL DEFAULT 0, -- Montant entier en FCFA (XOF)
    yearly_price INTEGER NOT NULL DEFAULT 0,  -- Montant entier en FCFA (XOF)
    currency TEXT NOT NULL DEFAULT 'XOF',
    is_active BOOLEAN NOT NULL DEFAULT true,
    trial_days INTEGER NOT NULL DEFAULT 14,
    quotas JSONB NOT NULL DEFAULT '{
        "maxUsers": 5,
        "maxAgents": 10,
        "maxSites": 15,
        "maxClients": 10,
        "maxInterventionsMonth": 100,
        "maxApiKeys": 0,
        "maxWebhooks": 0,
        "maxStorageMb": 1000,
        "maxExportsMonth": 20,
        "maxReportsMonth": 5
    }'::jsonb,
    features TEXT[] NOT NULL DEFAULT ARRAY['CORE_SECURITY', 'SOC_COMMAND_CENTER', 'SMART_DISPATCH', 'SLA_ENGINE', 'PROOF_OF_INTERVENTION'],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_plans_code ON public.plans (code);
CREATE INDEX IF NOT EXISTS idx_plans_is_active ON public.plans (is_active);

-- 2. TABLE DES ABONNEMENTS DES ORGANISATIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.plans(id),
    status TEXT NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED')),
    billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
    currency TEXT NOT NULL DEFAULT 'XOF',
    amount INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    trial_start TIMESTAMPTZ DEFAULT NOW(),
    trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    cancelled_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    custom_quotas JSONB, -- Surcharge éventuelle des quotas du plan pour sur-mesure
    custom_features TEXT[], -- Modules additionnels activés spécifiquement
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_subscriptions_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions (organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);

-- 3. TABLE DES FACTURES (INVOICES)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL UNIQUE, -- 'SEC-2026-000001'
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT', 'ISSUED', 'PENDING', 'PAID', 'OVERDUE', 'VOID', 'CANCELLED')),
    currency TEXT NOT NULL DEFAULT 'XOF',
    subtotal INTEGER NOT NULL DEFAULT 0,
    tax INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    due_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 days'),
    paid_at TIMESTAMPTZ,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    payment_method TEXT DEFAULT 'OFFLINE_BANK_TRANSFER',
    payment_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);

-- 4. TABLE DES PAIEMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'XOF',
    provider TEXT NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'WAVE', 'ORANGE_MONEY', 'MTN_MOMO', 'STRIPE'
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED')),
    reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments (organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);

-- 5. TABLE DES LEADS COMMERCIAUX & DEMANDES DE DÉMONSTRATION
CREATE TABLE IF NOT EXISTS public.commercial_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    agents_count INTEGER DEFAULT 0,
    sites_count INTEGER DEFAULT 0,
    clients_count INTEGER DEFAULT 0,
    needs TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
    assigned_to TEXT,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_leads_status ON public.commercial_leads (status);
CREATE INDEX IF NOT EXISTS idx_commercial_leads_created_at ON public.commercial_leads (created_at DESC);

-- ============================================================================
-- SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;

-- 1. Plans : lecture publique / utilisateurs connectés, modification réservée aux PLATFORM_ADMIN
CREATE POLICY "plans_read_policy" ON public.plans
    FOR SELECT
    USING (true);

-- 2. Subscriptions : lecture et gestion isolées par organisation
CREATE POLICY "subscriptions_org_isolation" ON public.subscriptions
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- 3. Invoices : lecture et consultation isolées par organisation
CREATE POLICY "invoices_org_isolation" ON public.invoices
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- 4. Payments : isolation stricte par organisation
CREATE POLICY "payments_org_isolation" ON public.payments
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- 5. Commercial Leads : création autorisée pour tout le monde (formulaire public de démo), lecture réservée à l'administration
CREATE POLICY "leads_insert_public" ON public.commercial_leads
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "leads_admin_read" ON public.commercial_leads
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
        )
    );

-- ============================================================================
-- SEED INITIAL DES PLANS COMMERCIAUX DE RÉFÉRENCE (IDEMPOTENT)
-- ============================================================================

INSERT INTO public.plans (code, name, description, monthly_price, yearly_price, currency, is_active, trial_days, quotas, features)
VALUES 
(
    'STARTER',
    'Securia Starter',
    'Idéal pour les petites structures de gardiennage et agences de sécurité locales.',
    49000,
    490000,
    'XOF',
    true,
    14,
    '{
        "maxUsers": 5,
        "maxAgents": 10,
        "maxSites": 15,
        "maxClients": 10,
        "maxInterventionsMonth": 100,
        "maxApiKeys": 0,
        "maxWebhooks": 0,
        "maxStorageMb": 1000,
        "maxExportsMonth": 20,
        "maxReportsMonth": 5
    }'::jsonb,
    ARRAY['CORE_SECURITY', 'SOC_COMMAND_CENTER', 'SMART_DISPATCH', 'SLA_ENGINE', 'PROOF_OF_INTERVENTION', 'EXPORTS']
),
(
    'PROFESSIONNEL',
    'Securia Professionnel',
    'Pour les sociétés de sécurité privée en expansion et centres de surveillance régionaux.',
    129000,
    1290000,
    'XOF',
    true,
    14,
    '{
        "maxUsers": 15,
        "maxAgents": 35,
        "maxSites": 50,
        "maxClients": 40,
        "maxInterventionsMonth": 500,
        "maxApiKeys": 2,
        "maxWebhooks": 3,
        "maxStorageMb": 5000,
        "maxExportsMonth": 100,
        "maxReportsMonth": 25
    }'::jsonb,
    ARRAY['CORE_SECURITY', 'SOC_COMMAND_CENTER', 'SMART_DISPATCH', 'SLA_ENGINE', 'CLIENT_PORTAL', 'PROOF_OF_INTERVENTION', 'EXPORTS', 'SIGNATURES', 'WEBHOOKS', 'ANALYTICS', 'PUBLIC_API', 'API_KEYS', 'ADVANCED_REPORTS']
),
(
    'BUSINESS',
    'Securia Business OS',
    'La solution complète pour les grands opérateurs de sécurité, télésurveillance et patrouilles 24/7.',
    299000,
    2990000,
    'XOF',
    true,
    14,
    '{
        "maxUsers": 50,
        "maxAgents": 100,
        "maxSites": 200,
        "maxClients": 150,
        "maxInterventionsMonth": 2500,
        "maxApiKeys": 10,
        "maxWebhooks": 15,
        "maxStorageMb": 25000,
        "maxExportsMonth": 500,
        "maxReportsMonth": 100
    }'::jsonb,
    ARRAY['CORE_SECURITY', 'SOC_COMMAND_CENTER', 'SMART_DISPATCH', 'SLA_ENGINE', 'CLIENT_PORTAL', 'PROOF_OF_INTERVENTION', 'EXPORTS', 'SIGNATURES', 'WEBHOOKS', 'ANALYTICS', 'FINANCE', 'PUBLIC_API', 'API_KEYS', 'PARTNER_CONNECTORS', 'ADVANCED_REPORTS', 'SCHEDULED_REPORTS', 'RFC3161']
),
(
    'ENTERPRISE',
    'Securia Enterprise',
    'Déploiement sur-mesure pour institutions, centres SOC nationaux et grands comptes multisites.',
    0, -- Sur devis
    0, -- Sur devis
    'XOF',
    true,
    30,
    '{
        "maxUsers": 999999,
        "maxAgents": 999999,
        "maxSites": 999999,
        "maxClients": 999999,
        "maxInterventionsMonth": 999999,
        "maxApiKeys": 999999,
        "maxWebhooks": 999999,
        "maxStorageMb": 999999,
        "maxExportsMonth": 999999,
        "maxReportsMonth": 999999
    }'::jsonb,
    ARRAY['CORE_SECURITY', 'SOC_COMMAND_CENTER', 'SMART_DISPATCH', 'SLA_ENGINE', 'CLIENT_PORTAL', 'PROOF_OF_INTERVENTION', 'EXPORTS', 'SIGNATURES', 'WEBHOOKS', 'ANALYTICS', 'FINANCE', 'PUBLIC_API', 'API_KEYS', 'PARTNER_CONNECTORS', 'ADVANCED_REPORTS', 'SCHEDULED_REPORTS', 'RFC3161', 'ADVANCED_SUPPORT']
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_price = EXCLUDED.monthly_price,
    yearly_price = EXCLUDED.yearly_price,
    quotas = EXCLUDED.quotas,
    features = EXCLUDED.features,
    updated_at = NOW();


-- >>>>> MIGRATION: 20260930500000_phase7_payments_fiscal_offline.sql <<<<<
-- ============================================================================
-- SECURIA V2 — PHASE 7 : PAYMENTS CI/UEMOA, FISCAL & OFFLINE-FIRST MIGRATION
-- Compléments sans rupture : Paiements réels, Webhooks, Fiscalité & Sync Outbox
-- ============================================================================

-- 1. EXTENSION DE LA TABLE INVOICES POUR LA FISCALITÉ & IMMUABILITÉ
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'INVOICE' 
    CHECK (invoice_type IN ('PROFORMA', 'INVOICE', 'CREDIT_NOTE', 'ANNULLED')),
ADD COLUMN IF NOT EXISTS is_immutable BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC NOT NULL DEFAULT 0.18,
ADD COLUMN IF NOT EXISTS tax_name TEXT NOT NULL DEFAULT 'TVA',
ADD COLUMN IF NOT EXISTS company_rccm TEXT,
ADD COLUMN IF NOT EXISTS company_ncc TEXT,
ADD COLUMN IF NOT EXISTS legal_mentions TEXT,
ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_invoices_type ON public.invoices (invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_original ON public.invoices (original_invoice_id);

-- 2. TABLE DES TRANSACTIONS DE PAIEMENT ÉTENDUES
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    provider TEXT NOT NULL, -- 'OFFLINE_TRANSFER', 'WAVE_CI', 'ORANGE_MONEY_CI', 'MTN_MOMO_CI', 'CINETPAY'
    provider_transaction_id TEXT,
    amount INTEGER NOT NULL, -- Entier en FCFA
    currency TEXT NOT NULL DEFAULT 'XOF',
    status TEXT NOT NULL DEFAULT 'CREATED' 
        CHECK (status IN ('CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    webhook_event_id TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_org ON public.payment_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_invoice ON public.payment_transactions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_ref ON public.payment_transactions (provider, provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON public.payment_transactions (status);

-- 3. TABLE DES ÉVÉNEMENTS WEBHOOK DE PAIEMENT (REPLAY PROTECTION & AUDIT)
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    signature TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed BOOLEAN NOT NULL DEFAULT false,
    processing_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_provider_event ON public.payment_webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_processed ON public.payment_webhook_events (processed);

-- 4. TABLE DU PROTOCOLE DE SYNCHRONISATION OFFLINE (IDEMPOTENCE SERVEUR)
CREATE TABLE IF NOT EXISTS public.offline_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_event_id TEXT NOT NULL UNIQUE, -- Identifiant unique généré côté agent (UUID v4)
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- 'INTERVENTION_STATUS', 'INTERVENTION_REPORT', 'GPS_POINT', 'CHECKLIST_ITEM', 'PHOTO'
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL, -- 'STATUS_CHANGE', 'REPORT_SUBMIT', 'GPS_LOG', 'PHOTO_ATTACH'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'SYNCED' CHECK (status IN ('SYNCED', 'ALREADY_PROCESSED', 'CONFLICT', 'FAILED')),
    conflict_details JSONB,
    server_processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_events_client_id ON public.offline_sync_events (client_event_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_org ON public.offline_sync_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON public.offline_sync_events (entity_type, entity_id);

-- 5. TABLE DES CONFIGURATIONS FISCALES PAR ORGANISATION
CREATE TABLE IF NOT EXISTS public.fiscal_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    country TEXT NOT NULL DEFAULT 'CI',
    currency TEXT NOT NULL DEFAULT 'XOF',
    tax_name TEXT NOT NULL DEFAULT 'TVA',
    tax_rate NUMERIC NOT NULL DEFAULT 0.18,
    company_legal_name TEXT,
    company_trade_name TEXT,
    rccm TEXT,
    ncc TEXT, -- Numéro Compte Contribuable
    tax_regime TEXT DEFAULT 'RÉEL NORMAL',
    legal_mentions TEXT DEFAULT 'Exonération ou mentions légales applicables selon les textes DGI en vigueur.',
    validation_status TEXT NOT NULL DEFAULT 'PENDING_REGULATORY_APPROVAL' 
        CHECK (validation_status IN ('PENDING_REGULATORY_APPROVAL', 'CONFIGURED', 'CERTIFIED')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fiscal_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_config_org ON public.fiscal_configurations (organization_id);

-- ============================================================================
-- SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_configurations ENABLE ROW LEVEL SECURITY;

-- 1. Transactions : isolation par organisation
CREATE POLICY "payment_tx_org_isolation" ON public.payment_transactions
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- 2. Webhooks : accessible uniquement par service_role côté serveur
CREATE POLICY "webhook_events_service_access" ON public.payment_webhook_events
    FOR ALL
    USING (
        auth.role() = 'service_role' OR EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- 3. Événements de synchronisation offline : isolation par organisation
CREATE POLICY "offline_sync_org_isolation" ON public.offline_sync_events
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );

-- 4. Configuration fiscale : isolation par organisation
CREATE POLICY "fiscal_config_org_isolation" ON public.fiscal_configurations
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users WHERE id = auth.uid()
        )
    );


-- >>>>> MIGRATION: 20261001000000_phase8_video_surveillance_integration.sql <<<<<
-- ==============================================================================
-- SECURIA V2 — PHASE 8 : INTÉGRATION VIDÉO / CAMÉRAS / NVR-VMS (v2.8.0)
-- Couche d'orchestration entre équipements vidéo (caméras IP, NVR, DVR, VMS,
-- passerelles, ONVIF) et le SOC / Command Center SECURIA.
-- Isolation stricte multi-tenant, RLS, audit sans secrets et corrélation d'alerte.
-- ==============================================================================

-- 1. EXTENSION DE TYPES
DO $$ BEGIN
  CREATE TYPE securia_video_system_type AS ENUM (
    'NVR', 'DVR', 'VMS', 'GATEWAY', 'CLOUD_VMS', 'DIRECT_CAMERA'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_video_protocol AS ENUM (
    'ONVIF', 'RTSP_INTERNAL', 'HTTP_API', 'PROPRIETARY_GATEWAY', 'TEST_SIMULATOR'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_camera_status AS ENUM (
    'ONLINE', 'OFFLINE', 'UNKNOWN', 'DEGRADED', 'DISABLED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE securia_video_rule_action AS ENUM (
    'CREATE_ALERT', 'NOTIFY_SOC_ONLY', 'LOG_ONLY', 'IGNORE'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. TABLE DES SYSTÈMES VIDÉO (NVR / DVR / VMS / PASSERELLES)
CREATE TABLE IF NOT EXISTS public.video_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protected_site_id UUID REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type securia_video_system_type NOT NULL DEFAULT 'NVR',
  protocol securia_video_protocol NOT NULL DEFAULT 'ONVIF',
  host_address TEXT,
  port INTEGER,
  status securia_camera_status NOT NULL DEFAULT 'UNKNOWN',
  credentials_encrypted JSONB DEFAULT '{}'::jsonb, -- Conservé côté serveur uniquement
  capabilities JSONB DEFAULT '[]'::jsonb,          -- ['AI_DETECTION', 'PTZ', 'RECORDING']
  last_seen_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_systems_org ON public.video_systems(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_systems_site ON public.video_systems(protected_site_id);
CREATE INDEX IF NOT EXISTS idx_video_systems_status ON public.video_systems(status);

ALTER TABLE public.video_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video systems org isolation" ON public.video_systems;
CREATE POLICY "Video systems org isolation" ON public.video_systems
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- 3. REGISTRE DES CAMÉRAS (EQUIPEMENTS VIDÉO ASSOCIÉS AUX SITES)
CREATE TABLE IF NOT EXISTS public.video_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protected_site_id UUID NOT NULL REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  video_system_id UUID REFERENCES public.video_systems(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  internal_id TEXT NOT NULL,                     -- e.g. CAM-01, Channel_02
  manufacturer TEXT,                             -- Dahua, Hikvision, Axis, Hanwha, Uniview
  model TEXT,                                    -- Référence constructeur
  camera_type TEXT DEFAULT 'FIXED',              -- FIXED, PTZ, DOME, BULLET, THERMAL
  protocol securia_video_protocol DEFAULT 'ONVIF',
  stream_internal_url TEXT,                      -- Flux interne ou flux passerelle (JAMAIS exposé au navigateur)
  status securia_camera_status NOT NULL DEFAULT 'UNKNOWN',
  is_primary BOOLEAN NOT NULL DEFAULT false,     -- Caméra principale du site pour aperçu SOC
  capabilities JSONB DEFAULT '["MOTION"]'::jsonb, -- ['MOTION', 'PERSON_DETECTION', 'INTRUSION_DETECTION', 'LINE_CROSSING']
  latitude DOUBLE PRECISION,                     -- Coordonnées géographiques propres
  longitude DOUBLE PRECISION,
  location_description TEXT,                     -- e.g. "Entrée principale - Portail Ouest"
  installation_notes TEXT,
  last_seen_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_cameras_org ON public.video_cameras(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_cameras_site ON public.video_cameras(protected_site_id);
CREATE INDEX IF NOT EXISTS idx_video_cameras_system ON public.video_cameras(video_system_id);
CREATE INDEX IF NOT EXISTS idx_video_cameras_status ON public.video_cameras(status);

ALTER TABLE public.video_cameras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video cameras org isolation" ON public.video_cameras;
CREATE POLICY "Video cameras org isolation" ON public.video_cameras
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- 4. RÈGLES DE CONVERSION ÉVÉNEMENT VIDÉO -> ALERTE (CONFIGURABLES PAR SITE / CAMÉRA)
CREATE TABLE IF NOT EXISTS public.video_event_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protected_site_id UUID REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES public.video_cameras(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                     -- INTRUSION_DETECTED, PERSON_DETECTED, LINE_CROSSING, CAMERA_OFFLINE...
  action securia_video_rule_action NOT NULL DEFAULT 'CREATE_ALERT',
  target_alert_type securia_alert_type NOT NULL DEFAULT 'INTRUSION',
  target_priority securia_alert_priority NOT NULL DEFAULT 'HIGH',
  cooldown_seconds INTEGER NOT NULL DEFAULT 180, -- Période anti-rebond (anti-flapping)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_rules_org ON public.video_event_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_rules_site ON public.video_event_rules(protected_site_id);
CREATE INDEX IF NOT EXISTS idx_video_rules_camera ON public.video_event_rules(camera_id);

ALTER TABLE public.video_event_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video rules org isolation" ON public.video_event_rules;
CREATE POLICY "Video rules org isolation" ON public.video_event_rules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- 5. TABLE DES ÉVÉNEMENTS VIDÉO INGESTÉS & CORRÉLÉS (IDEMPOTENCE ET JOURNALISATION)
CREATE TABLE IF NOT EXISTS public.video_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protected_site_id UUID NOT NULL REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  camera_id UUID REFERENCES public.video_cameras(id) ON DELETE SET NULL,
  video_system_id UUID REFERENCES public.video_systems(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,                        -- ONVIF, DAHUA, HIKVISION, MILESTONE, AXIS, TEST_VIDEO_PROVIDER
  event_id TEXT NOT NULL,                        -- Identifiant unique émis par le système source
  event_type TEXT NOT NULL,                      -- MOTION_DETECTED, INTRUSION_DETECTED, PERSON_DETECTED...
  confidence NUMERIC(5,2),                       -- Taux de confiance analytique (0.00 à 100.00%)
  snapshot_url TEXT,                             -- Capture sécurisée si autorisée et transmise
  raw_metadata JSONB DEFAULT '{}'::jsonb,        -- Bounding boxes, zone d'intrusion, voie...
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'CORRELATED', 'ALERT_CREATED', 'IGNORED', 'DUPLICATE')),
  correlated_alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_video_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_video_events_org ON public.video_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_events_site ON public.video_events(protected_site_id);
CREATE INDEX IF NOT EXISTS idx_video_events_camera ON public.video_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_video_events_alert ON public.video_events(correlated_alert_id);
CREATE INDEX IF NOT EXISTS idx_video_events_detected ON public.video_events(detected_at DESC);

ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video events org isolation" ON public.video_events;
CREATE POLICY "Video events org isolation" ON public.video_events
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- 6. TRIGGERS AUTOMATIQUES UPDATED_AT
DROP TRIGGER IF EXISTS trg_video_systems_updated_at ON public.video_systems;
CREATE TRIGGER trg_video_systems_updated_at BEFORE UPDATE ON public.video_systems
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_video_cameras_updated_at ON public.video_cameras;
CREATE TRIGGER trg_video_cameras_updated_at BEFORE UPDATE ON public.video_cameras
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_video_event_rules_updated_at ON public.video_event_rules;
CREATE TRIGGER trg_video_event_rules_updated_at BEFORE UPDATE ON public.video_event_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7. TEMPS RÉEL (SUPABASE REALTIME)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_cameras;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_events;
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- >>>>> MIGRATION: 20261001010000_phase9_edge_video_gateway.sql <<<<<
-- ==============================================================================
-- SECURIA V2 — PHASE 9 : SECURIA EDGE VIDEO GATEWAY (v2.9.0)
-- Table de gestion des passerelles matérielles locales (Edge Gateways)
-- Appairage sécurisé, battements de cœur (Heartbeats), découverte ONVIF et
-- tampon d'événements hors-ligne (Offline Buffer).
-- ==============================================================================

-- 1. TABLE DES PASSERELLES EDGE
CREATE TABLE IF NOT EXISTS public.video_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protected_site_id UUID NOT NULL REFERENCES public.protected_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gateway_code TEXT UNIQUE NOT NULL,                          -- e.g. "GW-COCODY-01"
  pairing_code TEXT,                                         -- Code temporaire à usage unique (ex: "SEC-GW-849201")
  pairing_expires_at TIMESTAMPTZ,                            -- Expiration du code (15 à 30 min)
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAIRING', 'ONLINE', 'OFFLINE', 'REVOKED', 'ERROR')),
  hardware_id TEXT,                                          -- Identifiant matériel unique (MAC ou UUID hôte)
  version TEXT NOT NULL DEFAULT '0.1.0',                     -- Version du logiciel Edge Gateway
  last_heartbeat_at TIMESTAMPTZ,
  heartbeat_data JSONB DEFAULT '{}'::jsonb,                  -- Métriques : cpu_pct, mem_mb, cameras_online, etc.
  secret_token_hash TEXT,                                    -- Hash SHA-256 du jeton d'authentification permanent
  ip_address_local TEXT,                                     -- IP locale sur le LAN client (ex: 192.168.1.50)
  capabilities JSONB DEFAULT '["ONVIF_DISCOVERY", "RTSP_RELAY", "OFFLINE_BUFFER"]'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour requêtes performantes
CREATE INDEX IF NOT EXISTS idx_video_gateways_org ON public.video_gateways(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_gateways_site ON public.video_gateways(protected_site_id);
CREATE INDEX IF NOT EXISTS idx_video_gateways_code ON public.video_gateways(gateway_code);
CREATE INDEX IF NOT EXISTS idx_video_gateways_status ON public.video_gateways(status);
CREATE INDEX IF NOT EXISTS idx_video_gateways_pairing ON public.video_gateways(pairing_code) WHERE pairing_code IS NOT NULL;

-- 2. LIENS AVEC LES TABLES VIDÉO EXISTANTES
ALTER TABLE public.video_cameras ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES public.video_gateways(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_video_cameras_gateway ON public.video_cameras(gateway_id);

ALTER TABLE public.video_events ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES public.video_gateways(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_video_events_gateway ON public.video_events(gateway_id);

-- 3. SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT
ALTER TABLE public.video_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Video gateways org isolation" ON public.video_gateways;
CREATE POLICY "Video gateways org isolation" ON public.video_gateways
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('ADMIN', 'SECURITY_MANAGER')
    )
  );

-- 4. TRIGGER AUTOMATIQUE UPDATED_AT
DROP TRIGGER IF EXISTS trg_video_gateways_updated_at ON public.video_gateways;
CREATE TRIGGER trg_video_gateways_updated_at BEFORE UPDATE ON public.video_gateways
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. PUBLICATION TEMPS RÉEL (SUPABASE REALTIME)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_gateways;
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- >>>>> MIGRATION: 20261009130000_phase12_secretariat_visitor_registry.sql <<<<<
-- ==============================================================================
-- SECURIA V2.12.0 — PHASE 12 : SECRÉTARIAT INTERNE & REGISTRE NUMÉRIQUE DES VISITEURS
-- Module de secrétariat pour la gestion des visiteurs à l'accueil interne de la société.
-- Isolation multi-tenant stricte, non-destructif, RLS et traçabilité d'audit.
-- ==============================================================================

-- 0. EXTENSION DU TYPE ENUM DES RÔLES UTILISATEURS
ALTER TYPE public.securia_user_role ADD VALUE IF NOT EXISTS 'SECRETARY';

-- 1. TABLE DES VISITES (Dossier d'accueil)
CREATE TABLE IF NOT EXISTS public.visitor_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.protected_sites(id) ON DELETE SET NULL,
  visit_reference TEXT NOT NULL,
  visit_reason TEXT NOT NULL DEFAULT 'RENDEZ_VOUS',
  host_name TEXT,
  host_department TEXT,
  visitor_company TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'CHECKED_OUT', 'CANCELLED'
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexation de performance pour visitor_visits
CREATE INDEX IF NOT EXISTS idx_visitor_visits_org ON public.visitor_visits(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_site ON public.visitor_visits(site_id);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_status ON public.visitor_visits(status);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_created ON public.visitor_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visits_ref ON public.visitor_visits(visit_reference);

-- 2. TABLE DES PERSONNES VISITEUSES ASSOCIÉES (Gestion individuelle des visiteurs)
CREATE TABLE IF NOT EXISTS public.visitor_visit_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.visitor_visits(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  identity_document_type TEXT NOT NULL DEFAULT 'CNI', -- 'CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'BADGE_PRO', 'AUTRE'
  identity_number_last4 TEXT, -- 4 derniers caractères pour affichage sécurisé
  identity_number_encrypted TEXT, -- Numéro protégé
  identity_expiry_date DATE,
  arrival_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  departure_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  signature_storage_path TEXT,
  signature_data_url TEXT,
  signed_at TIMESTAMPTZ,
  signature_consent BOOLEAN DEFAULT false,
  signature_status TEXT NOT NULL DEFAULT 'UNSIGNED', -- 'SIGNED', 'REFUSED', 'UNAVAILABLE', 'UNSIGNED'
  signature_refusal_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'CHECKED_OUT', 'CANCELLED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexation de performance pour visitor_visit_people
CREATE INDEX IF NOT EXISTS idx_visitor_people_org ON public.visitor_visit_people(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_people_visit ON public.visitor_visit_people(visit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_people_status ON public.visitor_visit_people(status);
CREATE INDEX IF NOT EXISTS idx_visitor_people_arrival ON public.visitor_visit_people(arrival_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_people_name ON public.visitor_visit_people(full_name);

-- 3. TABLE DES PIÈCES D'IDENTITÉ NUMÉRISÉES (Stockage sécurisé privé)
CREATE TABLE IF NOT EXISTS public.visitor_identity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  visitor_person_id UUID NOT NULL REFERENCES public.visitor_visit_people(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'RECTO', -- 'RECTO', 'VERSO'
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  retention_until TIMESTAMPTZ DEFAULT (now() + INTERVAL '90 days'),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_docs_org ON public.visitor_identity_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitor_docs_person ON public.visitor_identity_documents(visitor_person_id);
CREATE INDEX IF NOT EXISTS idx_visitor_docs_retention ON public.visitor_identity_documents(retention_until);

-- 4. POLITIQUES DE SÉCURITÉ RLS (Row Level Security)
ALTER TABLE public.visitor_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_visit_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_identity_documents ENABLE ROW LEVEL SECURITY;

-- Politique d'accès par organisation pour visitor_visits
DROP POLICY IF EXISTS p_visitor_visits_org_access ON public.visitor_visits;
CREATE POLICY p_visitor_visits_org_access ON public.visitor_visits
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Politique d'accès par organisation pour visitor_visit_people
DROP POLICY IF EXISTS p_visitor_people_org_access ON public.visitor_visit_people;
CREATE POLICY p_visitor_people_org_access ON public.visitor_visit_people
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- Politique d'accès par organisation pour visitor_identity_documents
DROP POLICY IF EXISTS p_visitor_docs_org_access ON public.visitor_identity_documents;
CREATE POLICY p_visitor_docs_org_access ON public.visitor_identity_documents
  FOR ALL
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN')
  );

-- 5. FONCTION RPC DE CHECKOUT ATOMIQUE POUR UN VISITEUR (Anti double-checkout & Concurrence)
CREATE OR REPLACE FUNCTION public.checkout_visitor_person(
  p_person_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_person RECORD;
  v_visit RECORD;
  v_now TIMESTAMPTZ := now();
  v_duration INTEGER;
  v_all_checked_out BOOLEAN;
BEGIN
  -- 1. Récupération avec verrouillage pessimiste
  SELECT * INTO v_person
  FROM public.visitor_visit_people
  WHERE id = p_person_id
  FOR UPDATE;

  IF v_person.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Visiteur introuvable');
  END IF;

  IF v_person.status = 'CHECKED_OUT' OR v_person.departure_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Ce visiteur a déjà été enregistré en sortie',
      'departure_at', v_person.departure_at
    );
  END IF;

  -- 2. Calcul durée en minutes
  v_duration := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_now - v_person.arrival_at)) / 60)::integer);

  -- 3. Mise à jour de la personne
  UPDATE public.visitor_visit_people
  SET
    status = 'CHECKED_OUT',
    departure_at = v_now,
    duration_minutes = v_duration,
    updated_at = v_now
  WHERE id = p_person_id;

  -- 4. Vérifier si toutes les personnes de la visite sont sorties
  SELECT NOT EXISTS (
    SELECT 1 FROM public.visitor_visit_people
    WHERE visit_id = v_person.visit_id AND status = 'PRESENT'
  ) INTO v_all_checked_out;

  IF v_all_checked_out THEN
    UPDATE public.visitor_visits
    SET status = 'CHECKED_OUT', updated_at = v_now
    WHERE id = v_person.visit_id;
  END IF;

  -- 5. Audit log
  INSERT INTO public.audit_logs (
    id, user_id, action, entity_type, entity_id, details, created_at
  ) VALUES (
    gen_random_uuid(),
    COALESCE(p_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'VISITOR_CHECKED_OUT',
    'secretariat',
    p_person_id,
    jsonb_build_object(
      'organization_id', v_person.organization_id,
      'visit_id', v_person.visit_id,
      'duration_minutes', v_duration,
      'departure_at', v_now
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', p_person_id,
    'visit_id', v_person.visit_id,
    'departure_at', v_now,
    'duration_minutes', v_duration,
    'all_checked_out', v_all_checked_out
  );
END;
$$;


-- >>>>> MIGRATION: 20261012000100_securia_security_hardening_v4_2.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION ARCHITECTURE MULTI-TENANT & RLS GLOBALE (VERSION 4.2)
-- Fichier : supabase/migrations/20261012000100_securia_security_hardening_v4_2.sql
-- Date : 12 Octobre 2026
-- Phase : 2.5 Corrections Ciblées Avant Validation
--
-- REMÉDIATIONS AUDIT PHASE 2.1 :
-- 1. Élimination totale des récursions RLS (42P17) via fonctions auxiliaires dédiées
--    (app_current_org, app_current_role, app_current_agent_ids, app_is_admin_context).
-- 2. Détection fiable des contextes privilégiés (service_role, postgres, platform_admins)
--    sans dépendre de GUC obsolètes ni bloquer l'onboarding applicatif.
-- 3. Verrouillage strict des factures, abonnements et clés d'API (SQL GRANTs + RLS).
-- 4. Protection des preuves : alert_id et provider_organization_id en ON DELETE RESTRICT
--    (fin du CASCADE destructeur de preuves historiques).
-- 5. Immuabilité des rattachements clients et prestataires lors des mises à jour.
-- 6. Verrouillage des alertes : le résident ne peut ni assigner ni forger d'agent/centre.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. VÉRIFICATION D'INTÉGRITÉ DU SCHÉMA
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'interventions') THEN
    RAISE EXCEPTION 'Table public.interventions absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organizations') THEN
    RAISE EXCEPTION 'Table public.organizations absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    RAISE EXCEPTION 'Table public.users absente : prérequis non satisfait.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alerts') THEN
    RAISE EXCEPTION 'Table public.alerts absente : prérequis non satisfait.';
  END IF;
END $$;

-- =============================================================================
-- 0.1 NEUTRALISATION CONTRÔLÉE DE TOUTE ANCIENNE POLITIQUE SUR LES TABLES SENSIBLES
-- Garantit qu'aucune politique permissive historique (OR) ne subsiste sur ces tables.
-- =============================================================================
DO $$
DECLARE
  v_tbl TEXT;
  v_pol RECORD;
  v_targets TEXT[] := ARRAY[
    'users', 'organizations', 'platform_admins', 'security_centers',
    'security_agents', 'alerts', 'interventions', 'invoices',
    'subscriptions', 'api_keys'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_targets LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tbl) THEN
      FOR v_pol IN (
        SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tbl
      ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_pol.policyname, v_tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 1. TABLE SÉCURISÉE : public.platform_admins
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_admins TO authenticated, service_role;
GRANT ALL ON TABLE public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_read_v4_2" ON public.platform_admins;
DROP POLICY IF EXISTS "platform_admins_write_v4_2" ON public.platform_admins;

CREATE POLICY "platform_admins_read_v4_2" ON public.platform_admins FOR SELECT
USING (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
  OR user_id = auth.uid()
);

CREATE POLICY "platform_admins_write_v4_2" ON public.platform_admins FOR ALL
USING (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
)
WITH CHECK (
  (session_user IN ('postgres', 'supabase_admin'))
  OR (auth.role() = 'service_role')
);

-- =============================================================================
-- 2. FONCTIONS AUXILIAIRES SÉCURISÉES SANS RÉCURSION (SECURITY DEFINER STABLE)
-- =============================================================================

-- 2.1 Contexte privilégié (migrations, service_role, ou platform_admin certifié)
CREATE OR REPLACE FUNCTION public.app_is_admin_context()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_claims JSONB;
BEGIN
  -- Superusers et rôles administratifs internes PostgreSQL (session physique directe)
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;

  -- Rôle système service_role via PostgREST / Supabase Auth
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  BEGIN
    v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    IF v_jwt_claims IS NOT NULL AND (v_jwt_claims ->> 'role') = 'service_role' THEN
      RETURN TRUE;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- Super-administrateur de plateforme authentifié (doit être actif dans public.users)
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 
      FROM public.platform_admins pa
      JOIN public.users u ON u.id = pa.user_id
      WHERE pa.user_id = auth.uid()
        AND u.is_active = true
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_is_admin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_admin_context() TO authenticated, service_role;

-- 2.2 Super-administrateur de plateforme
CREATE OR REPLACE FUNCTION public.app_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.app_is_admin_context();
$$;

REVOKE EXECUTE ON FUNCTION public.app_is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_platform_admin() TO authenticated, service_role;

-- 2.3 Organisation de l'utilisateur courant (accès direct sans déclencher RLS externe, compte actif obligatoire)
CREATE OR REPLACE FUNCTION public.app_current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.organization_id 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_org() TO authenticated, service_role;

-- 2.4 Rôle de l'utilisateur courant (compte actif obligatoire)
CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS securia_user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.role 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_role() TO authenticated, service_role;

-- 2.5 Identifiants d'agents associés à l'utilisateur courant (agents et utilisateurs actifs uniquement)
CREATE OR REPLACE FUNCTION public.app_current_agent_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT sa.id 
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE sa.user_id = auth.uid()
    AND sa.is_active = true
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_agent_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_agent_ids() TO authenticated, service_role;

-- Compatibilité ascendante avec l'ancienne signature
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.app_is_platform_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- =============================================================================
-- 3. PROTECTION DE LA TABLE public.users CONTRE L'AUTO-ÉLÉVATION
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Opérations administratives et serveur autorisées sans restriction
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  -- 1. Auto-inscription standard (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'USER'::securia_user_role THEN
      RAISE EXCEPTION 'Action interdite : auto-inscription autorisée uniquement avec le rôle USER.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas vous auto-assigner à une organisation lors de l''inscription.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- 2. Modification de profil (UPDATE)
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_users_privileges ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4 ON public.users;
DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4_2 ON public.users;
CREATE TRIGGER trg_protect_users_privileges_v4_2
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges_v4_2();

-- Politiques RLS sur public.users sans récursion
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Création profil utilisateur" ON public.users;
DROP POLICY IF EXISTS "Modification propre profil" ON public.users;
DROP POLICY IF EXISTS "Suppression profil admin" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4" ON public.users;
DROP POLICY IF EXISTS "users_select_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_insert_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_update_scoped_v4_2" ON public.users;
DROP POLICY IF EXISTS "users_delete_scoped_v4_2" ON public.users;

CREATE POLICY "users_select_scoped_v4_2" ON public.users FOR SELECT
USING (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

CREATE POLICY "users_insert_scoped_v4_2" ON public.users FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    auth.uid() = id 
    AND role = 'USER'::securia_user_role
    AND organization_id IS NULL
  )
);

CREATE POLICY "users_update_scoped_v4_2" ON public.users FOR UPDATE
USING (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR auth.uid() = id
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
);

CREATE POLICY "users_delete_scoped_v4_2" ON public.users FOR DELETE
USING (public.app_is_admin_context());

-- 3.1 PRÉREQUIS STRUCTUREL : COLONNES MULTI-TENANT SUR public.interventions
-- Requis en amont des politiques RLS dépendantes (organizations, alerts)
ALTER TABLE public.interventions 
ADD COLUMN IF NOT EXISTS client_organization_id UUID,
ADD COLUMN IF NOT EXISTS provider_organization_id UUID,
ADD COLUMN IF NOT EXISTS organization_id UUID,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ALERT_RESPONSE';

-- =============================================================================
-- 4. RLS SUR public.organizations
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture organisations autorisées" ON public.organizations;
DROP POLICY IF EXISTS "Gestion organisations admin" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_scoped" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped_v4" ON public.organizations;
DROP POLICY IF EXISTS "organizations_write_scoped_v4" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_scoped_v4_2" ON public.organizations;
DROP POLICY IF EXISTS "organizations_write_scoped_v4_2" ON public.organizations;

CREATE POLICY "organizations_select_scoped_v4_2" ON public.organizations FOR SELECT
USING (
  public.app_is_admin_context()
  OR id = public.app_current_org()
  OR id IN (
    SELECT i.provider_organization_id FROM public.interventions i
    WHERE i.client_organization_id = public.app_current_org()
  )
  OR id IN (
    SELECT i.client_organization_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org()
  )
);

CREATE POLICY "organizations_write_scoped_v4_2" ON public.organizations FOR ALL
USING (public.app_is_admin_context())
WITH CHECK (public.app_is_admin_context());

-- =============================================================================
-- 5. VERROUILLAGE SÉCURISÉ : FACTURES, ABONNEMENTS ET CLÉS D'API
-- =============================================================================
DO $$ BEGIN
  -- 5.1 Factures (invoices)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.invoices TO authenticated;
    GRANT ALL ON TABLE public.invoices TO service_role;

    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "invoices_org_isolation" ON public.invoices;
    DROP POLICY IF EXISTS "invoices_org_isolation_v4" ON public.invoices;
    DROP POLICY IF EXISTS "invoices_select_scoped_v4_2" ON public.invoices;

    CREATE POLICY "invoices_select_scoped_v4_2" ON public.invoices FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 5.2 Abonnements (subscriptions)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscriptions') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.subscriptions TO authenticated;
    GRANT ALL ON TABLE public.subscriptions TO service_role;

    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "subscriptions_org_isolation" ON public.subscriptions;
    DROP POLICY IF EXISTS "subscriptions_org_isolation_v4" ON public.subscriptions;
    DROP POLICY IF EXISTS "subscriptions_select_scoped_v4_2" ON public.subscriptions;

    CREATE POLICY "subscriptions_select_scoped_v4_2" ON public.subscriptions FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 5.3 Clés d'API (api_keys)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
    REVOKE ALL ON TABLE public.api_keys FROM PUBLIC, anon, authenticated;
    -- Révocation de key_hash pour le rôle authenticated : projection restreinte obligatoire
    GRANT SELECT (
      id, organization_id, name, key_prefix, scopes, rate_limit_per_minute,
      last_used_at, expires_at, revoked_at, created_by, created_at, updated_at
    ) ON TABLE public.api_keys TO authenticated;
    GRANT ALL ON TABLE public.api_keys TO service_role;

    ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "api_keys_org_isolation" ON public.api_keys;
    DROP POLICY IF EXISTS "api_keys_org_isolation_v4" ON public.api_keys;
    DROP POLICY IF EXISTS "api_keys_select_scoped_v4_2" ON public.api_keys;

    CREATE POLICY "api_keys_select_scoped_v4_2" ON public.api_keys FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() = 'ADMIN'::securia_user_role
      )
    );
  END IF;
END $$;

-- =============================================================================
-- 6. CENTRES DE SÉCURITÉ & AGENTS (RLS SANS CYCLE)
-- =============================================================================

-- 6.1 Centres de sécurité (public.security_centers)
ALTER TABLE public.security_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture centres autorisés" ON public.security_centers;
DROP POLICY IF EXISTS "Gestion centres responsable ou admin" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped_v4" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped_v4" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_select_scoped_v4_2" ON public.security_centers;
DROP POLICY IF EXISTS "security_centers_write_scoped_v4_2" ON public.security_centers;

CREATE POLICY "security_centers_select_scoped_v4_2" ON public.security_centers FOR SELECT
USING (
  public.app_is_admin_context()
  OR organization_id = public.app_current_org()
  OR id IN (
    SELECT a.security_center_id FROM public.alerts a
    WHERE a.organization_id = public.app_current_org() AND a.security_center_id IS NOT NULL
  )
);

CREATE POLICY "security_centers_write_scoped_v4_2" ON public.security_centers FOR ALL
USING (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- 6.2 Agents de sécurité (public.security_agents)
ALTER TABLE public.security_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture agents autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Mise a jour agent autorisée" ON public.security_agents;
DROP POLICY IF EXISTS "Gestion agents manager admin" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_update_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_insert_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_delete_scoped" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped_v4" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_write_scoped_v4" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_select_scoped_v4_2" ON public.security_agents;
DROP POLICY IF EXISTS "security_agents_write_scoped_v4_2" ON public.security_agents;

CREATE POLICY "security_agents_select_scoped_v4_2" ON public.security_agents FOR SELECT
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR organization_id = public.app_current_org()
);

CREATE POLICY "security_agents_write_scoped_v4_2" ON public.security_agents FOR ALL
USING (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (
    organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
);

-- =============================================================================
-- 7. ALERTES : TRIGGER DE VALIDATION TENANT & RLS ÉTANCHE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_org UUID;
  v_caller_role securia_user_role;
  v_agent_org UUID;
  v_center_org UUID;
BEGIN
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  v_user_org := public.app_current_org();
  v_caller_role := public.app_current_role();

  IF TG_OP = 'INSERT' THEN
    -- Forcer user_id sur le contexte authentifié
    NEW.user_id := auth.uid();
    
    -- Résolution sécurisée de l'organisation cliente légitime
    IF v_user_org IS NOT NULL THEN
      -- Utilisateur affilié : forcer l'organisation cliente sur son organisation
      NEW.organization_id := v_user_org;
    ELSIF NEW.site_id IS NOT NULL THEN
      -- Utilisateur sans organisation explicite mais site déclaré : dériver depuis le site de l'appelant
      SELECT ps.organization_id INTO NEW.organization_id 
      FROM public.protected_sites ps 
      WHERE ps.id = NEW.site_id AND ps.owner_id = auth.uid();
    ELSE
      -- Résident indépendant sans organisation : organisation_id doit rester NULL
      NEW.organization_id := NULL;
    END IF;

    -- Un résident ne peut assigner ni centre de sécurité ni agent de son propre chef à la création
    IF v_caller_role = 'USER'::securia_user_role THEN
      NEW.assigned_agent_id := NULL;
      NEW.security_center_id := NULL;
    END IF;
  END IF;

  -- Vérification de cohérence agent / centre prestataire
  IF NEW.assigned_agent_id IS NOT NULL THEN
    SELECT organization_id INTO v_agent_org FROM public.security_agents WHERE id = NEW.assigned_agent_id;
    IF NEW.security_center_id IS NOT NULL THEN
      SELECT organization_id INTO v_center_org FROM public.security_centers WHERE id = NEW.security_center_id;
      IF v_agent_org IS DISTINCT FROM v_center_org THEN
        RAISE EXCEPTION 'Incohérence prestataire : l''agent assigné (%) n''appartient pas au prestataire du centre (%).',
          NEW.assigned_agent_id, NEW.security_center_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Contrôles d'intégrité et immuabilité à la mise à jour
  IF TG_OP = 'UPDATE' THEN
    -- L'organisation cliente d'une alerte est strictement immuable pour tout utilisateur non-admin
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''organisation de l''alerte.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Un résident ne peut modifier ni l'agent assigné ni le centre de sécurité
    IF v_caller_role = 'USER'::securia_user_role THEN
      IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''agent assigné à l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.security_center_id IS DISTINCT FROM OLD.security_center_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier le centre de sécurité de l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_alert_tenancy ON public.alerts;
DROP TRIGGER IF EXISTS trg_validate_alert_tenancy_v4_2 ON public.alerts;
CREATE TRIGGER trg_validate_alert_tenancy_v4_2
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2();

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture des alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alertes" ON public.alerts;
DROP POLICY IF EXISTS "Insertion alerte par résident" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alertes" ON public.alerts;
DROP POLICY IF EXISTS "Mise a jour alerte autorisée" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4" ON public.alerts;
DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_insert_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_scoped_v4_2" ON public.alerts;
DROP POLICY IF EXISTS "alerts_delete_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_select_scoped_v4_2" ON public.alerts FOR SELECT
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (organization_id IS NOT NULL AND organization_id = public.app_current_org())
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

CREATE POLICY "alerts_insert_scoped_v4_2" ON public.alerts FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    user_id = auth.uid()
    AND (organization_id IS NULL OR organization_id = public.app_current_org())
  )
);

CREATE POLICY "alerts_update_scoped_v4_2" ON public.alerts FOR UPDATE
USING (
  public.app_is_admin_context()
  OR user_id = auth.uid()
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

CREATE POLICY "alerts_delete_scoped_v4_2" ON public.alerts FOR DELETE
USING (public.app_is_admin_context());

-- =============================================================================
-- 8. INTERVENTIONS : STRUCTURE DUAL-TENANT, CONTRAINTES & PREUVES HISTORIQUES
-- =============================================================================
-- Note : L'ajout des colonnes client_organization_id, provider_organization_id,
-- organization_id, created_by et mission_type a été positionné en amont (section 3.1)
-- pour satisfaire les politiques RLS interdépendantes (organizations et alerts).

-- Rétro-remplissage sécurisé
UPDATE public.interventions i
SET client_organization_id = a.organization_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.client_organization_id IS NULL;

UPDATE public.interventions i
SET provider_organization_id = sc.organization_id
FROM public.security_centers sc
WHERE i.security_center_id = sc.id
  AND i.provider_organization_id IS NULL;

UPDATE public.interventions i
SET provider_organization_id = sa.organization_id
FROM public.security_agents sa
WHERE i.agent_id = sa.id
  AND i.provider_organization_id IS NULL;

UPDATE public.interventions
SET organization_id = COALESCE(client_organization_id, provider_organization_id)
WHERE organization_id IS NULL;

UPDATE public.interventions i
SET created_by = a.user_id
FROM public.alerts a
WHERE i.alert_id = a.id
  AND i.created_by IS NULL;

-- Assainissement des orphelins avant pose de contrainte
UPDATE public.interventions
SET client_organization_id = NULL
WHERE client_organization_id IS NOT NULL 
  AND client_organization_id NOT IN (SELECT id FROM public.organizations);

UPDATE public.interventions
SET provider_organization_id = NULL
WHERE provider_organization_id IS NOT NULL 
  AND provider_organization_id NOT IN (SELECT id FROM public.organizations);

-- Suppression dynamique ciblée uniquement des FK unicolonnes obsolètes
-- Protection stricte : les contraintes composites (conkey > 1) et les contraintes métier non concernées sont strictement préservées
DO $$ 
DECLARE
  r RECORD;
  v_composite_count INT := 0;
BEGIN
  -- 1. Détection et préservation explicite de toute contrainte composite éventuelle
  SELECT COUNT(DISTINCT con.conname) INTO v_composite_count
  FROM pg_constraint con
  WHERE con.conrelid = 'public.interventions'::regclass
    AND con.contype = 'f'
    AND array_length(con.conkey, 1) > 1
    AND EXISTS (
      SELECT 1 FROM pg_attribute att 
      WHERE att.attrelid = con.conrelid 
        AND att.attnum = ANY(con.conkey)
        AND att.attname IN ('client_organization_id', 'provider_organization_id', 'alert_id')
    );

  IF v_composite_count > 0 THEN
    RAISE NOTICE 'SÉCURITÉ : Préservation de % contrainte(s) composite(s) métier sur public.interventions.', v_composite_count;
  END IF;

  -- 2. Suppression uniquement des FK unicolonnes strictes sur les colonnes et tables cibles
  FOR r IN (
    SELECT DISTINCT con.conname 
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.interventions'::regclass
      AND con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND (
        (att.attname = 'alert_id' AND con.confrelid = 'public.alerts'::regclass)
        OR (att.attname = 'client_organization_id' AND con.confrelid = 'public.organizations'::regclass)
        OR (att.attname = 'provider_organization_id' AND con.confrelid = 'public.organizations'::regclass)
      )
  ) LOOP
    EXECUTE format('ALTER TABLE public.interventions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- Pose explicite des contraintes : PROTECTION ABSOLUE DES PREUVES
-- 1. alert_id en ON DELETE RESTRICT (la suppression d'une alerte ne doit pas détruire l'intervention)
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_alert
FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE RESTRICT;

-- 2. client_organization_id en ON DELETE RESTRICT
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_client_organization
FOREIGN KEY (client_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- 3. provider_organization_id en ON DELETE RESTRICT (préserve la trace légale du prestataire)
ALTER TABLE public.interventions 
ADD CONSTRAINT fk_interventions_provider_organization
FOREIGN KEY (provider_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Trigger Dual-Tenant v4.2 avec IMMUABILITÉ RENFORCÉE (DIRECTE ET INDIRECTE) lors des mises à jour
CREATE OR REPLACE FUNCTION public.trg_fn_sync_intervention_tenants_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert_org UUID;
  v_alert_center UUID;
  v_alert_agent UUID;
  v_center_org UUID;
  v_agent_org UUID;
  v_alert_center_org UUID;
  v_alert_agent_org UUID;
BEGIN
  -- 1. CONTRÔLE D'IMMUABILITÉ DES CHAMPS SOURCES DIRECTS ET HISTORIQUES (UPDATE non-admin)
  IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Action interdite : le créateur (created_by) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de rattachement (organization_id) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_organization_id IS DISTINCT FROM OLD.client_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation cliente d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.provider_organization_id IS DISTINCT FROM OLD.provider_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation prestataire d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.alert_id IS DISTINCT FROM OLD.alert_id THEN
      RAISE EXCEPTION 'Action interdite : l''alerte rattachée à une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 1.bis CONTRÔLE D'AUTHENTICITÉ DE L'AUTEUR (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF NOT public.app_is_admin_context() THEN
      IF auth.uid() IS NOT NULL THEN
        IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
          RAISE EXCEPTION 'Action interdite : usurpation d''identité interdite sur created_by.'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.created_by := auth.uid();
      ELSE
        RAISE EXCEPTION 'Action interdite : création d''intervention non authentifiée.'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- Contexte admin : préserver NEW.created_by si renseigné, sinon assigner auth.uid() si disponible
      IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
        NEW.created_by := auth.uid();
      END IF;
    END IF;
  END IF;

  -- 2. RÉSOLUTION ET VALIDATION DE L'ALERTE (CHAMP SOURCE CLIENT ET PRESTATAIRE DE BASE)
  IF NEW.alert_id IS NOT NULL THEN
    SELECT a.organization_id, a.security_center_id, a.assigned_agent_id
    INTO v_alert_org, v_alert_center, v_alert_agent
    FROM public.alerts a WHERE a.id = NEW.alert_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Alerte inexistante (%) liée à l''intervention.', NEW.alert_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence alerte <-> organisation cliente
    IF v_alert_org IS NOT NULL THEN
      IF NEW.client_organization_id IS NOT NULL AND NEW.client_organization_id IS DISTINCT FROM v_alert_org THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''organisation cliente fournie (%) ne correspond pas à celle de l''alerte (%).',
          NEW.client_organization_id, v_alert_org
          USING ERRCODE = 'P0001';
      END IF;
      NEW.client_organization_id := v_alert_org;
    END IF;
  END IF;

  -- 3. RÉSOLUTION ET VALIDATION DU CENTRE DE SÉCURITÉ
  IF NEW.security_center_id IS NOT NULL THEN
    SELECT sc.organization_id INTO v_center_org
    FROM public.security_centers sc WHERE sc.id = NEW.security_center_id;

    IF NOT FOUND OR v_center_org IS NULL THEN
      RAISE EXCEPTION 'Centre de sécurité invalide ou introuvable (%).', NEW.security_center_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence centre <-> prestataire fourni
    IF NEW.provider_organization_id IS NOT NULL AND NEW.provider_organization_id IS DISTINCT FROM v_center_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : le centre de sécurité (%) appartient au prestataire (%) et non au prestataire spécifié (%).',
        NEW.security_center_id, v_center_org, NEW.provider_organization_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Interdiction de détournement indirect du prestataire via le centre de sécurité (UPDATE non-admin)
    IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
      IF OLD.provider_organization_id IS NOT NULL AND v_center_org IS DISTINCT FROM OLD.provider_organization_id THEN
        RAISE EXCEPTION 'Action interdite : modification indirecte interdite. Le centre de sécurité (%) appartient au prestataire (%) différent du prestataire immuable (%).',
          NEW.security_center_id, v_center_org, OLD.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    NEW.provider_organization_id := v_center_org;
  END IF;

  -- 4. RÉSOLUTION ET VALIDATION DE L'AGENT ASSIGNÉ
  IF NEW.agent_id IS NOT NULL THEN
    SELECT sa.organization_id INTO v_agent_org
    FROM public.security_agents sa WHERE sa.id = NEW.agent_id;

    IF NOT FOUND OR v_agent_org IS NULL THEN
      RAISE EXCEPTION 'Agent de sécurité invalide ou introuvable (%).', NEW.agent_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence agent <-> centre de sécurité
    IF v_center_org IS NOT NULL AND v_agent_org IS DISTINCT FROM v_center_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) relève du prestataire (%) tandis que le centre (%) relève de (%).',
        NEW.agent_id, v_agent_org, NEW.security_center_id, v_center_org
        USING ERRCODE = 'P0001';
    END IF;

    -- Cohérence agent <-> prestataire
    IF NEW.provider_organization_id IS NOT NULL AND NEW.provider_organization_id IS DISTINCT FROM v_agent_org THEN
      RAISE EXCEPTION 'Incohérence multi-tenant : l''agent assigné (%) n''appartient pas au prestataire opérant (%).',
        NEW.agent_id, NEW.provider_organization_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Interdiction de détournement indirect du prestataire via l'agent (UPDATE non-admin)
    IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
      IF OLD.provider_organization_id IS NOT NULL AND v_agent_org IS DISTINCT FROM OLD.provider_organization_id THEN
        RAISE EXCEPTION 'Action interdite : modification indirecte interdite. L''agent assigné (%) appartient au prestataire (%) différent du prestataire immuable (%).',
          NEW.agent_id, v_agent_org, OLD.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    NEW.provider_organization_id := v_agent_org;
  END IF;

  -- 5. COHÉRENCE CROISÉE ALERTE <-> PRESTATAIRE / CENTRE / AGENT
  IF NEW.alert_id IS NOT NULL THEN
    IF v_alert_center IS NOT NULL THEN
      SELECT sc.organization_id INTO v_alert_center_org
      FROM public.security_centers sc WHERE sc.id = v_alert_center;

      IF v_alert_center_org IS NOT NULL AND NEW.provider_organization_id IS NOT NULL AND v_alert_center_org IS DISTINCT FROM NEW.provider_organization_id THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''alerte (%) est rattachée au centre (%) du prestataire (%) différent du prestataire d''intervention (%).',
          NEW.alert_id, v_alert_center, v_alert_center_org, NEW.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF v_alert_agent IS NOT NULL THEN
      SELECT sa.organization_id INTO v_alert_agent_org
      FROM public.security_agents sa WHERE sa.id = v_alert_agent;

      IF v_alert_agent_org IS NOT NULL AND NEW.provider_organization_id IS NOT NULL AND v_alert_agent_org IS DISTINCT FROM NEW.provider_organization_id THEN
        RAISE EXCEPTION 'Incohérence multi-tenant : l''alerte (%) est assignée à l''agent (%) du prestataire (%) différent du prestataire d''intervention (%).',
          NEW.alert_id, v_alert_agent, v_alert_agent_org, NEW.provider_organization_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 6. VALIDATION D'IMMUABILITÉ DES VALEURS FINALES CALCULÉES (UPDATE non-admin)
  IF TG_OP = 'UPDATE' AND NOT public.app_is_admin_context() THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Action interdite : le créateur (created_by) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation de rattachement (organization_id) d''une intervention est strictement immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.client_organization_id IS DISTINCT FROM OLD.client_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation cliente d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.provider_organization_id IS DISTINCT FROM OLD.provider_organization_id THEN
      RAISE EXCEPTION 'Action interdite : l''organisation prestataire d''une intervention est immuable.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 7. OBLIGATION D'UN ANCRAGE TENANT MINIMAL
  IF NEW.client_organization_id IS NULL AND NEW.provider_organization_id IS NULL THEN
    RAISE EXCEPTION 'Intervention invalide : une intervention doit obligatoirement être rattachée à une organisation cliente ou prestataire.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. VÉRIFICATION D'HABILITATION TENANT À LA CRÉATION POUR NON-ADMIN
  IF TG_OP = 'INSERT' AND NOT public.app_is_admin_context() THEN
    IF public.app_current_org() IS NULL OR (
      public.app_current_org() IS DISTINCT FROM NEW.provider_organization_id
      AND public.app_current_org() IS DISTINCT FROM NEW.client_organization_id
    ) THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez créer une intervention que pour votre propre organisation cliente ou prestataire.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 9. GESTION ET VALIDATION DE COHÉRENCE DE organization_id
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := COALESCE(NEW.client_organization_id, NEW.provider_organization_id);
  ELSIF NEW.organization_id IS DISTINCT FROM NEW.client_organization_id 
    AND NEW.organization_id IS DISTINCT FROM NEW.provider_organization_id THEN
    RAISE EXCEPTION 'Incohérence multi-tenant : l''organisation de rattachement (%) ne correspond ni au client (%) ni au prestataire (%).',
      NEW.organization_id, NEW.client_organization_id, NEW.provider_organization_id
      USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intervention_tenants ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v3 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4 ON public.interventions;
DROP TRIGGER IF EXISTS trg_sync_intervention_tenants_v4_2 ON public.interventions;
CREATE TRIGGER trg_sync_intervention_tenants_v4_2
BEFORE INSERT OR UPDATE ON public.interventions
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_intervention_tenants_v4_2();

-- RLS sur public.interventions sans récursion
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interventions_select_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v3" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4" ON public.interventions;
DROP POLICY IF EXISTS "interventions_select_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_insert_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_update_scoped_v4_2" ON public.interventions;
DROP POLICY IF EXISTS "interventions_delete_scoped_v4_2" ON public.interventions;

CREATE POLICY "interventions_select_scoped_v4_2" ON public.interventions FOR SELECT
USING (
  public.app_is_admin_context()
  OR (
    client_organization_id IS NOT NULL 
    AND client_organization_id = public.app_current_org()
    AND public.app_current_role() != 'AGENT'
  )
  OR (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

CREATE POLICY "interventions_insert_scoped_v4_2" ON public.interventions FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    public.app_current_role() IN ('SECURITY_MANAGER', 'ADMIN')
    AND (
      provider_organization_id = public.app_current_org()
      OR client_organization_id = public.app_current_org()
    )
  )
);

CREATE POLICY "interventions_update_scoped_v4_2" ON public.interventions FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (
    provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

CREATE POLICY "interventions_delete_scoped_v4_2" ON public.interventions FOR DELETE
USING (public.app_is_admin_context());

-- =============================================================================
-- 9. PROCÉDURE RPC SÉCURISÉE : public.get_scoped_interventions_feed()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed(
  p_org_id UUID,
  p_facet TEXT DEFAULT 'ANY',
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  alert_id UUID,
  security_center_id UUID,
  agent_id UUID,
  status securia_intervention_status,
  report TEXT,
  client_organization_id UUID,
  provider_organization_id UUID,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validation stricte de la facette (valeurs admises : CLIENT, PROVIDER, ANY)
  IF p_facet IS NULL OR p_facet NOT IN ('CLIENT', 'PROVIDER', 'ANY') THEN
    RAISE EXCEPTION 'Paramètre p_facet invalide (%). Les valeurs autorisées sont CLIENT, PROVIDER ou ANY.', p_facet
      USING ERRCODE = 'P0001';
  END IF;

  -- Vérification d'isolation : l'appelant doit être admin de plateforme ou appartenir à l'org demandée
  IF NOT (public.app_is_admin_context() OR public.app_current_org() = p_org_id) THEN
    RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.alert_id,
    i.security_center_id,
    i.agent_id,
    i.status,
    i.report,
    i.client_organization_id,
    i.provider_organization_id,
    i.assigned_at,
    i.accepted_at,
    i.en_route_at,
    i.arrived_at,
    i.resolved_at,
    i.created_at,
    i.updated_at
  FROM public.interventions i
  WHERE (
    (p_facet = 'CLIENT' AND i.client_organization_id = p_org_id)
    OR (p_facet = 'PROVIDER' AND i.provider_organization_id = p_org_id)
    OR (p_facet = 'ANY' AND (i.client_organization_id = p_org_id OR i.provider_organization_id = p_org_id))
  )
  AND (p_status IS NULL OR i.status::text = p_status)
  AND (
    public.app_is_admin_context()
    OR (
      i.client_organization_id IS NOT NULL 
      AND i.client_organization_id = public.app_current_org()
      AND public.app_current_role() != 'AGENT'
    )
    OR (
      i.provider_organization_id IS NOT NULL 
      AND i.provider_organization_id = public.app_current_org()
      AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
    )
    OR i.agent_id IN (SELECT public.app_current_agent_ids())
  )
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;

COMMIT;


-- >>>>> MIGRATION: 20261012000200_securia_security_hardening_v4_3.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.3)
-- Fichier : supabase/migrations/20261012000200_securia_security_hardening_v4_3.sql
-- Date : 12 Octobre 2026
-- Phase : 2.7C Remédiation consolidée de sécurité
--
-- MOTIVATION :
-- Pour les environnements où la migration 20261012000100_securia_security_hardening_v4_2.sql
-- a déjà été appliquée et enregistrée dans la table supabase_migrations, cette migration
-- incrémentale applique sans rupture les durcissements identifiés lors de l'audit 2.7B :
-- 1. Intégration de la clause is_active = true dans app_current_org(), app_current_role(),
--    app_current_agent_ids() et app_is_admin_context() (neutralisation des JWT orphelins).
-- 2. Validation stricte du paramètre p_facet ('CLIENT', 'PROVIDER', 'ANY') dans get_scoped_interventions_feed().
-- 3. Isolation absolue des agents rattachés à une organisation cliente (restreints à leurs interventions assignées).
-- =============================================================================

BEGIN;

-- 1. FONCTIONS AUXILIAIRES DE SÉCURITÉ AVEC CONTRÔLE is_active = true

CREATE OR REPLACE FUNCTION public.app_is_admin_context()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_jwt_claims JSONB;
BEGIN
  -- Superusers et rôles administratifs internes PostgreSQL (session physique directe)
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;

  -- Rôle système service_role via PostgREST / Supabase Auth
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  BEGIN
    v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    IF v_jwt_claims IS NOT NULL AND (v_jwt_claims ->> 'role') = 'service_role' THEN
      RETURN TRUE;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- Super-administrateur de plateforme authentifié (compte actif obligatoire)
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 
      FROM public.platform_admins pa
      JOIN public.users u ON u.id = pa.user_id
      WHERE pa.user_id = auth.uid()
        AND u.is_active = true
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_is_admin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_is_admin_context() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_current_org()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.organization_id 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_org() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS securia_user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.role 
  FROM public.users u 
  WHERE u.id = auth.uid()
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_current_agent_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT sa.id 
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE sa.user_id = auth.uid()
    AND sa.is_active = true
    AND u.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.app_current_agent_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_agent_ids() TO authenticated, service_role;

-- 2. POLITIQUE RLS SELECT SUR public.interventions

DROP POLICY IF EXISTS "interventions_select_scoped_v4_2" ON public.interventions;
CREATE POLICY "interventions_select_scoped_v4_2" ON public.interventions FOR SELECT
USING (
  public.app_is_admin_context()
  OR (
    client_organization_id IS NOT NULL 
    AND client_organization_id = public.app_current_org()
    AND public.app_current_role() != 'AGENT'
  )
  OR (
    provider_organization_id IS NOT NULL 
    AND provider_organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR agent_id IN (SELECT public.app_current_agent_ids())
);

-- 3. PROCÉDURE RPC SÉCURISÉE : public.get_scoped_interventions_feed()

CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed(
  p_org_id UUID,
  p_facet TEXT DEFAULT 'ANY',
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  alert_id UUID,
  security_center_id UUID,
  agent_id UUID,
  status securia_intervention_status,
  report TEXT,
  client_organization_id UUID,
  provider_organization_id UUID,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validation stricte de la facette (valeurs admises : CLIENT, PROVIDER, ANY)
  IF p_facet IS NULL OR p_facet NOT IN ('CLIENT', 'PROVIDER', 'ANY') THEN
    RAISE EXCEPTION 'Paramètre p_facet invalide (%). Les valeurs autorisées sont CLIENT, PROVIDER ou ANY.', p_facet
      USING ERRCODE = 'P0001';
  END IF;

  -- Vérification d'isolation : l'appelant doit être admin de plateforme ou appartenir à l'org demandée
  IF NOT (public.app_is_admin_context() OR public.app_current_org() = p_org_id) THEN
    RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.alert_id,
    i.security_center_id,
    i.agent_id,
    i.status,
    i.report,
    i.client_organization_id,
    i.provider_organization_id,
    i.assigned_at,
    i.accepted_at,
    i.en_route_at,
    i.arrived_at,
    i.resolved_at,
    i.created_at,
    i.updated_at
  FROM public.interventions i
  WHERE (
    (p_facet = 'CLIENT' AND i.client_organization_id = p_org_id)
    OR (p_facet = 'PROVIDER' AND i.provider_organization_id = p_org_id)
    OR (p_facet = 'ANY' AND (i.client_organization_id = p_org_id OR i.provider_organization_id = p_org_id))
  )
  AND (p_status IS NULL OR i.status::text = p_status)
  AND (
    public.app_is_admin_context()
    OR (
      i.client_organization_id IS NOT NULL 
      AND i.client_organization_id = public.app_current_org()
      AND public.app_current_role() != 'AGENT'
    )
    OR (
      i.provider_organization_id IS NOT NULL 
      AND i.provider_organization_id = public.app_current_org()
      AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
    )
    OR i.agent_id IN (SELECT public.app_current_agent_ids())
  )
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;

COMMIT;


-- >>>>> MIGRATION: 20261012000300_remediate_admin_purge_all_test_accounts.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION ADDITIVE DE REMÉDIATION CONSOLIDÉE P0 / P1
-- Fichier : supabase/migrations/20261012000300_remediate_admin_purge_all_test_accounts.sql
-- Date : 12 Octobre 2026
-- Phase : Remédiation globale P0 / P1
--
-- RÈGLE DEVSECOPS ABSOLUE :
-- Ce script est une proposition corrective additive STRICTEMENT NON APPLIQUÉE.
-- Il neutralise de manière étanche et réversible les vulnérabilités identifiées :
-- 1. P0 : Suppression définitive de la fonction destructrice admin_purge_all_test_accounts()
-- 2. P0 : Cloisonnement strict multi-tenant de admin_delete_user_account()
-- 3. P0 : Cloisonnement multi-tenant, RBAC et masquage d'accès dans get_dispatch_map_data()
-- 4. P1 : Révocation des mutations directes sur les tables financières payments,
--         payment_transactions et fiscal_configurations avec RLS SELECT borné.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1 (P0) : SUPPRESSION DÉFINITIVE DE ADMIN_PURGE_ALL_TEST_ACCOUNTS
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname = 'admin_purge_all_test_accounts'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_purge_all_test_accounts() FROM PUBLIC, anon, authenticated';
    RAISE NOTICE 'Privilèges révoqués avec succès pour public.admin_purge_all_test_accounts()';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_purge_all_test_accounts();

-- =============================================================================
-- SECTION 2 (P0) : CLOISONNEMENT MULTI-TENANT DE ADMIN_DELETE_USER_ACCOUNT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_user_account(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE
  v_caller_role securia_user_role;
  v_caller_id UUID := auth.uid();
  v_caller_org UUID;
  v_target_org UUID;
  v_target_email TEXT;
  v_is_platform_admin BOOLEAN := false;
BEGIN
  -- 1. Résolution autoritaire du contexte d'exécution (Platform Admin / service_role vs Administrateur d'organisation)
  v_is_platform_admin := public.app_is_admin_context();

  IF NOT v_is_platform_admin THEN
    -- Appelant utilisateur authentifié obligatoire
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Accès refusé : Session utilisateur non authentifiée.';
    END IF;

    -- Vérifier que l'appelant possède le rôle ADMIN actif
    SELECT role, organization_id INTO v_caller_role, v_caller_org 
    FROM public.users 
    WHERE id = v_caller_id AND is_active = true;

    IF v_caller_role IS NULL OR v_caller_role <> 'ADMIN' THEN
      RAISE EXCEPTION 'Accès refusé : Seul un administrateur actif peut supprimer un compte utilisateur.';
    END IF;

    -- Interdiction formelle de supprimer son propre compte administrateur
    IF p_target_user_id = v_caller_id THEN
      RAISE EXCEPTION 'Action impossible : Vous ne pouvez pas supprimer votre propre compte administrateur connecté.';
    END IF;
  ELSE
    -- Contexte administrateur plateforme ou service_role
    IF v_caller_id IS NOT NULL THEN
      SELECT role, organization_id INTO v_caller_role, v_caller_org 
      FROM public.users 
      WHERE id = v_caller_id AND is_active = true;

      IF p_target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Action impossible : Vous ne pouvez pas supprimer votre propre compte administrateur connecté.';
      END IF;
    END IF;
  END IF;

  -- 2. Vérifier que l'utilisateur cible existe et récupérer son organisation
  SELECT email, organization_id INTO v_target_email, v_target_org 
  FROM public.users 
  WHERE id = p_target_user_id;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Utilisateur cible introuvable.';
  END IF;

  -- 3. ÉTANCHÉITÉ MULTI-TENANT : Vérifier l'appartenance à la même organisation (sauf Platform Admin)
  IF NOT v_is_platform_admin AND (v_target_org IS NULL OR v_caller_org IS NULL OR v_target_org <> v_caller_org) THEN
    RAISE EXCEPTION 'Accès refusé : Vous ne pouvez pas supprimer un utilisateur appartenant à une autre organisation.';
  END IF;

  -- 4. Nettoyage en cascade strictement borné à p_target_user_id
  DELETE FROM public.notifications WHERE user_id = p_target_user_id;

  DELETE FROM public.alert_events 
  WHERE actor_id = p_target_user_id 
     OR alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id);

  DELETE FROM public.interventions 
  WHERE alert_id IN (SELECT id FROM public.alerts WHERE user_id = p_target_user_id)
     OR agent_id IN (SELECT id FROM public.security_agents WHERE user_id = p_target_user_id);

  DELETE FROM public.alerts WHERE user_id = p_target_user_id;
  DELETE FROM public.site_members WHERE user_id = p_target_user_id;
  DELETE FROM public.emergency_contacts WHERE user_id = p_target_user_id;
  DELETE FROM public.protected_sites WHERE owner_id = p_target_user_id;
  DELETE FROM public.security_agents WHERE user_id = p_target_user_id;
  DELETE FROM public.users WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  -- 5. Journalisation d'audit
  INSERT INTO public.audit_logs (id, user_id, action, entity_type, entity_id, details)
  VALUES (
    gen_random_uuid()::text,
    COALESCE(v_caller_id::text, 'service_role'),
    'ADMIN_DELETE_USER_ACCOUNT',
    'users',
    p_target_user_id::text,
    jsonb_build_object('deleted_email', v_target_email, 'organization_id', v_target_org, 'deleted_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', p_target_user_id,
    'email', v_target_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(UUID) TO authenticated, service_role;

-- =============================================================================
-- SECTION 3 (P0) : SÉCURISATION TACTIQUE DE GET_DISPATCH_MAP_DATA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_dispatch_map_data(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sites jsonb;
  v_agents jsonb;
  v_interventions jsonb;
  v_caller_id uuid := auth.uid();
  v_caller_org uuid;
  v_caller_role securia_user_role;
  v_target_org uuid := p_org_id;
  v_is_platform_admin boolean := false;
BEGIN
  -- 1. Résolution de l'organisation et contexte d'habilitation
  v_is_platform_admin := public.app_is_admin_context();
  v_caller_org := public.app_current_org();

  IF v_is_platform_admin THEN
    IF v_target_org IS NULL THEN
      v_target_org := v_caller_org;
    END IF;
  ELSE
    -- Contrôle d'authentification obligatoire pour les sessions utilisateurs standard
    IF v_caller_id IS NULL THEN
      RAISE EXCEPTION 'Accès refusé : Authentification obligatoire pour consulter les données cartographiques.';
    END IF;

    -- Contrôle du rôle de l'appelant (Superviseurs, Admins et Agents uniquement)
    v_caller_role := public.app_current_role();
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('ADMIN', 'SECURITY_MANAGER', 'AGENT') THEN
      RAISE EXCEPTION 'Accès refusé : Habilitation insuffisante pour la console tactique de dispatching.';
    END IF;

    -- Cloisonnement strict multi-tenant
    IF v_target_org IS NOT NULL AND v_target_org <> v_caller_org THEN
      RAISE EXCEPTION 'Accès refusé : Il est strictement interdit d''accéder aux coordonnées cartographiques d''une autre organisation.';
    END IF;
    v_target_org := v_caller_org;
  END IF;

  -- FAIL-CLOSED : Si aucune organisation n'est rattachée, refuser catégoriquement le déversement global
  IF v_target_org IS NULL THEN
    RETURN jsonb_build_object(
      'sites', '[]'::jsonb,
      'agents', '[]'::jsonb,
      'active_interventions', '[]'::jsonb,
      'notice', 'Aucune organisation associée au compte'
    );
  END IF;

  -- 4. Sites protégés rattachés STRICTEMENT à l'organisation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ps.id,
      'name', ps.name,
      'site_type', ps.site_type,
      'address', ps.address,
      'city', COALESCE(ps.city, 'Abidjan'),
      'postal_code', ps.postal_code,
      'latitude', ps.latitude,
      'longitude', ps.longitude,
      'access_instructions', CASE 
        WHEN v_caller_role IN ('ADMIN', 'SECURITY_MANAGER') OR v_is_platform_admin THEN ps.access_instructions 
        ELSE NULL 
      END,
      'is_default', ps.is_default,
      'created_at', ps.created_at,
      'organization_id', ps.organization_id,
      'owner', jsonb_build_object(
        'id', u.id,
        'full_name', COALESCE(u.full_name, 'Client Sécuria'),
        'phone', u.phone,
        'email', u.email
      ),
      'has_active_alert', EXISTS (
        SELECT 1 FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
      ),
      'active_alert', (
        SELECT jsonb_build_object(
          'id', a.id,
          'alert_number', a.alert_number,
          'type', a.type,
          'priority', a.priority,
          'status', a.status,
          'created_at', a.created_at
        )
        FROM public.alerts a
        WHERE a.site_id = ps.id
          AND a.status NOT IN ('RESOLVED', 'CANCELLED', 'FALSE_ALARM')
          ORDER BY a.created_at DESC
          LIMIT 1
        )
      )
    ), '[]'::jsonb)
  INTO v_sites
  FROM public.protected_sites ps
  LEFT JOIN public.users u ON u.id = ps.owner_id
  WHERE ps.organization_id = v_target_org
    AND ps.latitude IS NOT NULL
    AND ps.longitude IS NOT NULL;

  -- 5. Agents actifs rattachés à l'organisation (colonnes réelles: current_latitude, current_longitude)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'agent_name', COALESCE(u.full_name, 'Agent Patrouille'),
      'badge_number', sa.badge_number,
      'duty_status', sa.duty_status,
      'latitude', sa.current_latitude,
      'longitude', sa.current_longitude,
      'phone', u.phone,
      'patrol_vehicle', COALESCE(sa.patrol_vehicle, 'Patrouille Securia'),
      'last_update', sa.updated_at
    )
  ), '[]'::jsonb)
  INTO v_agents
  FROM public.security_agents sa
  JOIN public.users u ON u.id = sa.user_id
  WHERE sa.organization_id = v_target_org
    AND sa.is_active = true
    AND u.is_active = true
    AND sa.current_latitude IS NOT NULL
    AND sa.current_longitude IS NOT NULL;

  -- 6. Interventions actives de l'organisation
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'alert_id', i.alert_id,
      'alert_number', a.alert_number,
      'status', i.status,
      'type', a.type,
      'priority', a.priority,
      'created_at', i.created_at,
      'site', jsonb_build_object(
        'id', ps.id,
        'name', ps.name,
        'address', ps.address,
        'latitude', ps.latitude,
        'longitude', ps.longitude
      ),
      'agent', jsonb_build_object(
        'id', sa.id,
        'name', u.full_name,
        'badge_number', sa.badge_number,
        'latitude', sa.current_latitude,
        'longitude', sa.current_longitude
      )
    )
  ), '[]'::jsonb)
  INTO v_interventions
  FROM public.interventions i
  JOIN public.alerts a ON a.id = i.alert_id
  LEFT JOIN public.protected_sites ps ON ps.id = a.site_id
  LEFT JOIN public.security_agents sa ON sa.id = i.agent_id
  LEFT JOIN public.users u ON u.id = sa.user_id
  WHERE (a.organization_id = v_target_org OR i.client_organization_id = v_target_org OR i.provider_organization_id = v_target_org)
    AND i.status NOT IN ('COMPLETED', 'ABORTED');

  RETURN jsonb_build_object(
    'sites', v_sites,
    'agents', v_agents,
    'active_interventions', v_interventions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dispatch_map_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dispatch_map_data(uuid) TO authenticated, service_role;

-- =============================================================================
-- SECTION 4 (P1) : SÉCURISATION ET VERROUILLAGE RLS DES TABLES FINANCIÈRES
-- =============================================================================

DO $$
BEGIN
  -- 4.1 Table public.payments
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.payments TO authenticated;
    GRANT ALL ON TABLE public.payments TO service_role;

    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "payments_org_isolation" ON public.payments;
    DROP POLICY IF EXISTS "payments_select_scoped_v4_4" ON public.payments;

    CREATE POLICY "payments_select_scoped_v4_4" ON public.payments FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 4.2 Table public.payment_transactions
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_transactions') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_transactions FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.payment_transactions TO authenticated;
    GRANT ALL ON TABLE public.payment_transactions TO service_role;

    ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "payment_tx_org_isolation" ON public.payment_transactions;
    DROP POLICY IF EXISTS "payment_tx_select_scoped_v4_4" ON public.payment_transactions;

    CREATE POLICY "payment_tx_select_scoped_v4_4" ON public.payment_transactions FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;

  -- 4.3 Table public.fiscal_configurations
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fiscal_configurations') THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.fiscal_configurations FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.fiscal_configurations TO authenticated;
    GRANT ALL ON TABLE public.fiscal_configurations TO service_role;

    ALTER TABLE public.fiscal_configurations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "fiscal_config_org_isolation" ON public.fiscal_configurations;
    DROP POLICY IF EXISTS "fiscal_config_select_scoped_v4_4" ON public.fiscal_configurations;

    CREATE POLICY "fiscal_config_select_scoped_v4_4" ON public.fiscal_configurations FOR SELECT
    USING (
      public.app_is_admin_context()
      OR (
        organization_id = public.app_current_org()
        AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
      )
    );
  END IF;
END $$;

-- =============================================================================
-- SECTION 5 : TRACE D'AUDIT SYSTÈME
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
    INSERT INTO public.audit_logs (id, action, entity_type, entity_id, details, created_at)
    VALUES (
      gen_random_uuid()::text,
      'SECURITY_REMEDIATION_CONSOLIDATED_P0_P1_READY',
      'system_migration',
      '20261012000300',
      jsonb_build_object(
        'version', '20261012000300',
        'remediated_items', jsonb_build_array(
          'admin_purge_all_test_accounts (DROPPED)',
          'admin_delete_user_account (TENANT HARDENED)',
          'get_dispatch_map_data (RBAC + TENANT SCOPED)',
          'payments (MUTATIONS REVOKED + RLS SELECT LOCKED)',
          'payment_transactions (MUTATIONS REVOKED + RLS SELECT LOCKED)',
          'fiscal_configurations (MUTATIONS REVOKED + RLS SELECT LOCKED)'
        )
      ),
      NOW()
    );
  END IF;
END $$;

COMMIT;


-- >>>>> MIGRATION: 20261012000400_harden_alerts_inactive_users_rls.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.4)
-- Fichier : supabase/migrations/20261012000400_harden_alerts_inactive_users_rls.sql
-- Date : 14 Octobre 2026
-- Phase : 2T Durcissement RLS des alertes pour les comptes inactifs
--
-- MOTIVATION :
-- Le test dynamique de durcissement (test A.3 de 01_security_hardening_phase2_8_transactional.sql)
-- a révélé qu'un utilisateur désactivé (public.users.is_active = false) conservant
-- un JWT valide pouvait encore accéder à ses propres alertes via la branche
-- permissive `user_id = auth.uid()` de la politique `alerts_select_scoped_v4_2`.
--
-- REMÉDIATION :
-- Remplacement de la politique SELECT sur `public.alerts` afin que la branche
-- propriétaire exige également un rôle actif non nul :
--   (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
--
-- Étant donné que `public.app_current_role()` filtre strictement sur `u.is_active = true`,
-- elle retourne NULL pour tout compte inactif. Cette condition ferme la faille
-- pour les JWT orphelins/désactivés tout en maintenant l'accès légitime des résidents
-- actifs à leurs alertes.
-- =============================================================================

BEGIN;

-- 1. Remplacement de la politique SELECT sur public.alerts
DROP POLICY IF EXISTS "alerts_select_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_select_scoped_v4_2" ON public.alerts FOR SELECT
USING (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
  OR (organization_id IS NOT NULL AND organization_id = public.app_current_org())
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

COMMIT;


-- >>>>> MIGRATION: 20261012000500_harden_rpc_interventions_feed_null_org.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.5)
-- Fichier : supabase/migrations/20261012000500_harden_rpc_interventions_feed_null_org.sql
-- Date : 14 Octobre 2026
-- Phase : 2Y Durcissement fail-closed de la RPC get_scoped_interventions_feed
--
-- MOTIVATION :
-- Le diagnostic de sécurité (Phase 2X) a révélé une vulnérabilité liée à la logique
-- ternaire SQL (3VL) dans la RPC `public.get_scoped_interventions_feed()` :
-- Lorsque l'appelant est un compte inactif (public.users.is_active = false),
-- la fonction auxiliaire `public.app_current_org()` retourne NULL.
-- La condition `IF NOT (public.app_is_admin_context() OR public.app_current_org() = p_org_id) THEN`
-- s'évaluait alors à `NOT (FALSE OR NULL)` => `NOT (NULL)` => NULL.
-- En PL/pgSQL, une condition IF qui s'évalue à NULL n'entre pas dans le bloc THEN,
-- sautant l'instruction RAISE EXCEPTION et retournant silencieusement 0 ligne au lieu de P0001.
--
-- REMÉDIATION :
-- Redéfinition autoritaire et fail-closed de la vérification d'isolation multi-tenant :
--   IF NOT public.app_is_admin_context() AND (public.app_current_org() IS NULL OR public.app_current_org() <> p_org_id) THEN
--     RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id
--       USING ERRCODE = 'P0001';
--   END IF;
--
-- Tout appelant non-administrateur dont l'organisation active est absente (NULL)
-- ou différente de p_org_id se voit ainsi systématiquement refuser l'accès avec P0001.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_scoped_interventions_feed(
  p_org_id UUID,
  p_facet TEXT DEFAULT 'ANY',
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  alert_id UUID,
  security_center_id UUID,
  agent_id UUID,
  status securia_intervention_status,
  report TEXT,
  client_organization_id UUID,
  provider_organization_id UUID,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  en_route_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Paramètre p_org_id obligatoire pour le cloisonnement multi-tenant.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validation stricte de la facette (valeurs admises : CLIENT, PROVIDER, ANY)
  IF p_facet IS NULL OR p_facet NOT IN ('CLIENT', 'PROVIDER', 'ANY') THEN
    RAISE EXCEPTION 'Paramètre p_facet invalide (%). Les valeurs autorisées sont CLIENT, PROVIDER ou ANY.', p_facet
      USING ERRCODE = 'P0001';
  END IF;

  -- Vérification d'isolation fail-closed : l'appelant doit être admin de plateforme ou appartenir activement à l'org demandée
  IF NOT public.app_is_admin_context() AND (public.app_current_org() IS NULL OR public.app_current_org() <> p_org_id) THEN
    RAISE EXCEPTION 'Accès refusé : violation d''isolation multi-tenant pour l''organisation %', p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.alert_id,
    i.security_center_id,
    i.agent_id,
    i.status,
    i.report,
    i.client_organization_id,
    i.provider_organization_id,
    i.assigned_at,
    i.accepted_at,
    i.en_route_at,
    i.arrived_at,
    i.resolved_at,
    i.created_at,
    i.updated_at
  FROM public.interventions i
  WHERE (
    (p_facet = 'CLIENT' AND i.client_organization_id = p_org_id)
    OR (p_facet = 'PROVIDER' AND i.provider_organization_id = p_org_id)
    OR (p_facet = 'ANY' AND (i.client_organization_id = p_org_id OR i.provider_organization_id = p_org_id))
  )
  AND (p_status IS NULL OR i.status::text = p_status)
  AND (
    public.app_is_admin_context()
    OR (
      i.client_organization_id IS NOT NULL 
      AND i.client_organization_id = public.app_current_org()
      AND public.app_current_role() != 'AGENT'
    )
    OR (
      i.provider_organization_id IS NOT NULL 
      AND i.provider_organization_id = public.app_current_org()
      AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
    )
    OR i.agent_id IN (SELECT public.app_current_agent_ids())
  )
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_interventions_feed(UUID, TEXT, TEXT, INT, INT) TO authenticated, service_role;

COMMIT;


-- >>>>> MIGRATION: 20261012000600_harden_users_self_reactivation_and_alerts_mutations.sql <<<<<
-- =============================================================================
-- SECURIA SaaS — MIGRATION CORRECTIVE INCRÉMENTALE (VERSION 4.6)
-- Fichier : supabase/migrations/20261012000600_harden_users_self_reactivation_and_alerts_mutations.sql
-- Date : 14 Octobre 2026
-- Phase : 2AC Durcissement de l'auto-réactivation dans public.users et des mutations sur public.alerts
--
-- MOTIVATIONS DE SÉCURITÉ (Audit Phase 2AB) :
-- 1. Risque 1 (public.users) :
--    Un compte utilisateur désactivé (is_active = false) conservant un JWT valide
--    pouvait exploiter la branche 'auth.uid() = id' de la politique RLS UPDATE pour
--    modifier sa propre ligne sans vérification d'état actif.
--    Le trigger 'trg_fn_protect_users_privileges_v4_2()' ne contrôlait pas 'is_active',
--    permettant à un utilisateur désactivé de s'auto-réactiver (is_active = true).
--
-- 2. Risque 2 (public.alerts) :
--    - INSERT : La politique 'alerts_insert_scoped_v4_2' permettait à un compte inactif
--      d'insérer une alerte avec 'organization_id = NULL' car 'user_id = auth.uid()'
--      ne vérifiait pas 'public.app_current_role() IS NOT NULL'.
--    - UPDATE : La politique 'alerts_update_scoped_v4_2' permettait à un compte inactif
--      de modifier ses alertes via 'user_id = auth.uid()'. Le trigger 'trg_fn_validate_alert_tenancy_v4_2'
--      contournait ses contrôles de résident car 'v_caller_role' était NULL.
--
-- REMÉDIATIONS APPORTÉES :
-- 1. Redéfinition de 'public.trg_fn_protect_users_privileges_v4_2()' :
--    - Interdit formellement à un utilisateur de modifier son propre statut d'activation (auth.uid() = OLD.id).
--    - Interdit la modification de 'is_active' pour tout appelant non-administrateur d'organisation actif.
--    - Restreint les modifications de statut d'un administrateur d'organisation à son propre tenant.
--    - Préserve l'accès des administrateurs de plateforme et contextes serveur (app_is_admin_context()).
-- 2. Redéfinition de la politique 'users_update_scoped_v4_2' sur public.users :
--    - Exige '(auth.uid() = id AND public.app_current_role() IS NOT NULL)' en USING et WITH CHECK.
-- 3. Redéfinition de la politique 'alerts_insert_scoped_v4_2' sur public.alerts :
--    - Exige 'public.app_current_role() IS NOT NULL' pour la branche propriétaire.
-- 4. Redéfinition de la politique 'alerts_update_scoped_v4_2' sur public.alerts :
--    - Exige 'public.app_current_role() IS NOT NULL' pour la branche propriétaire.
--    - Définit une clause WITH CHECK symétrique stricte.
-- 5. Redéfinition de 'public.trg_fn_validate_alert_tenancy_v4_2()' :
--    - Rejette immédiatement (fail-closed P0001) tout utilisateur authentifié dont le rôle actif est NULL.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DURCISSEMENT DU TRIGGER DE PRIVILÈGES UTILISATEUR (public.users)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_protect_users_privileges_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Opérations administratives plateforme et serveur autorisées sans restriction
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  -- 1. Auto-inscription standard (INSERT)
  IF TG_OP = 'INSERT' THEN
    IF NEW.role IS DISTINCT FROM 'USER'::securia_user_role THEN
      RAISE EXCEPTION 'Action interdite : auto-inscription autorisée uniquement avec le rôle USER.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas vous auto-assigner à une organisation lors de l''inscription.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- 2. Modification de profil (UPDATE)
  -- 2.1 Verrouillage strict de l'auto-réactivation et modifications de statut d'activation
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    -- Règle A : Un utilisateur ne peut jamais modifier son propre statut d'activation
    -- Règle B : Seul un administrateur d'organisation actif peut modifier le statut d'un tiers dans son propre tenant
    IF auth.uid() = OLD.id 
       OR public.app_current_role() IS DISTINCT FROM 'ADMIN'::securia_user_role
       OR public.app_current_org() IS NULL
       OR OLD.organization_id IS NULL
       OR OLD.organization_id IS DISTINCT FROM public.app_current_org() THEN
      RAISE EXCEPTION 'Action interdite : vous ne disposez pas des privilèges nécessaires pour modifier ce statut d''activation.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2.2 Immuabilité du rôle utilisateur pour tout non-superadmin
  IF (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre rôle utilisateur.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.3 Immuabilité de l'organisation de rattachement pour tout non-superadmin
  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre organisation de rattachement.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.4 Immuabilité du centre de sécurité pour tout non-superadmin
  IF (NEW.security_center_id IS DISTINCT FROM OLD.security_center_id) THEN
    RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier votre centre de sécurité.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2.5 Préservation des identifiants et horodatage
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_users_privileges_v4_2 ON public.users;
CREATE TRIGGER trg_protect_users_privileges_v4_2
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_users_privileges_v4_2();

-- -----------------------------------------------------------------------------
-- 2. DURCISSEMENT DE LA POLITIQUE RLS UPDATE SUR public.users
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_scoped_v4_2" ON public.users;

CREATE POLICY "users_update_scoped_v4_2" ON public.users FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (auth.uid() = id AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (auth.uid() = id AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() = 'ADMIN'::securia_user_role
  )
);

-- -----------------------------------------------------------------------------
-- 3. DURCISSEMENT DU TRIGGER DE VALIDATION TENANT DES ALERTES (public.alerts)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_org UUID;
  v_caller_role securia_user_role;
  v_agent_org UUID;
  v_center_org UUID;
BEGIN
  IF public.app_is_admin_context() THEN
    RETURN NEW;
  END IF;

  v_caller_role := public.app_current_role();
  v_user_org := public.app_current_org();

  -- Contrôle fail-closed : tout utilisateur authentifié dont le compte est inactif ou sans rôle actif est rejeté
  IF auth.uid() IS NOT NULL AND v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Accès refusé : compte utilisateur inactif ou non habilité pour la gestion des alertes.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Forcer user_id sur le contexte authentifié
    NEW.user_id := auth.uid();
    
    -- Résolution sécurisée de l'organisation cliente légitime
    IF v_user_org IS NOT NULL THEN
      -- Utilisateur affilié : forcer l'organisation cliente sur son organisation
      NEW.organization_id := v_user_org;
    ELSIF NEW.site_id IS NOT NULL THEN
      -- Utilisateur sans organisation explicite mais site déclaré : dériver depuis le site de l'appelant
      SELECT ps.organization_id INTO NEW.organization_id 
      FROM public.protected_sites ps 
      WHERE ps.id = NEW.site_id AND ps.owner_id = auth.uid();
    ELSE
      -- Résident indépendant sans organisation : organisation_id doit rester NULL
      NEW.organization_id := NULL;
    END IF;

    -- Un résident ne peut assigner ni centre de sécurité ni agent de son propre chef à la création
    IF v_caller_role = 'USER'::securia_user_role THEN
      NEW.assigned_agent_id := NULL;
      NEW.security_center_id := NULL;
    END IF;
  END IF;

  -- Vérification de cohérence agent / centre prestataire
  IF NEW.assigned_agent_id IS NOT NULL THEN
    SELECT organization_id INTO v_agent_org FROM public.security_agents WHERE id = NEW.assigned_agent_id;
    IF NEW.security_center_id IS NOT NULL THEN
      SELECT organization_id INTO v_center_org FROM public.security_centers WHERE id = NEW.security_center_id;
      IF v_agent_org IS DISTINCT FROM v_center_org THEN
        RAISE EXCEPTION 'Incohérence prestataire : l''agent assigné (%) n''appartient pas au prestataire du centre (%).',
          NEW.assigned_agent_id, NEW.security_center_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- Contrôles d'intégrité et immuabilité à la mise à jour
  IF TG_OP = 'UPDATE' THEN
    -- L'organisation cliente d'une alerte est strictement immuable pour tout utilisateur non-admin
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''organisation de l''alerte.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Un résident ne peut modifier ni l'agent assigné ni le centre de sécurité
    IF v_caller_role = 'USER'::securia_user_role THEN
      IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier l''agent assigné à l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.security_center_id IS DISTINCT FROM OLD.security_center_id THEN
        RAISE EXCEPTION 'Action interdite : vous ne pouvez pas modifier le centre de sécurité de l''alerte.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_alert_tenancy_v4_2 ON public.alerts;
CREATE TRIGGER trg_validate_alert_tenancy_v4_2
BEFORE INSERT OR UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_alert_tenancy_v4_2();

-- -----------------------------------------------------------------------------
-- 4. DURCISSEMENT DES POLITIQUES RLS DE MUTATION SUR public.alerts
-- -----------------------------------------------------------------------------

-- 4.1 INSERT sur public.alerts
DROP POLICY IF EXISTS "alerts_insert_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_insert_scoped_v4_2" ON public.alerts FOR INSERT
WITH CHECK (
  public.app_is_admin_context()
  OR (
    user_id = auth.uid()
    AND public.app_current_role() IS NOT NULL
    AND (organization_id IS NULL OR organization_id = public.app_current_org())
  )
);

-- 4.2 UPDATE sur public.alerts
DROP POLICY IF EXISTS "alerts_update_scoped_v4_2" ON public.alerts;

CREATE POLICY "alerts_update_scoped_v4_2" ON public.alerts FOR UPDATE
USING (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
)
WITH CHECK (
  public.app_is_admin_context()
  OR (user_id = auth.uid() AND public.app_current_role() IS NOT NULL)
  OR (
    organization_id IS NOT NULL 
    AND organization_id = public.app_current_org()
    AND public.app_current_role() IN ('ADMIN', 'SECURITY_MANAGER')
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.provider_organization_id = public.app_current_org() AND i.alert_id IS NOT NULL
  )
  OR id IN (
    SELECT i.alert_id FROM public.interventions i
    WHERE i.agent_id IN (SELECT public.app_current_agent_ids()) AND i.alert_id IS NOT NULL
  )
);

COMMIT;


-- >>>>> MIGRATION: 20261015140000_atomic_intervention_lifecycle_and_outbox.sql <<<<<
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



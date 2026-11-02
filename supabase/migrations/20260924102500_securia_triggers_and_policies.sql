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

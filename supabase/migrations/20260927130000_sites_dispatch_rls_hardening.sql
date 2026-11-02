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

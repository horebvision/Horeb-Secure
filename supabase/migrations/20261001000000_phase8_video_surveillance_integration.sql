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

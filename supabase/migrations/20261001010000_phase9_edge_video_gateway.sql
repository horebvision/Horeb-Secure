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

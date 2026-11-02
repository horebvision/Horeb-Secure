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

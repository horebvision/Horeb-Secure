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

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

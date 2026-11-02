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

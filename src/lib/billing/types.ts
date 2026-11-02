/**
 * SECURIA V2 — PHASE 6 : ENTERPRISE SaaS & BILLING TYPES
 * Définition des types pour les plans, abonnements, quotas, factures et entitlements
 */

export type PlanCode = 'STARTER' | 'PROFESSIONNEL' | 'BUSINESS' | 'BUSINESS_OS' | 'ENTERPRISE';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PENDING'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID'
  | 'CANCELLED';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'DEMO'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type FeatureCode =
  | 'CORE_SECURITY'
  | 'SOC_COMMAND_CENTER'
  | 'SMART_DISPATCH'
  | 'SLA_ENGINE'
  | 'CLIENT_PORTAL'
  | 'PROOF_OF_INTERVENTION'
  | 'EXPORTS'
  | 'SIGNATURES'
  | 'WEBHOOKS'
  | 'ANALYTICS'
  | 'FINANCE'
  | 'PUBLIC_API'
  | 'API_KEYS'
  | 'PARTNER_CONNECTORS'
  | 'ADVANCED_REPORTS'
  | 'SCHEDULED_REPORTS'
  | 'RFC3161'
  | 'ADVANCED_SUPPORT';

export interface PlanQuotas {
  maxUsers: number;
  maxAgents: number;
  maxSites: number;
  maxClients: number;
  maxInterventionsMonth: number;
  maxApiKeys: number;
  maxWebhooks: number;
  maxStorageMb: number;
  maxExportsMonth: number;
  maxReportsMonth: number;
}

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number; // En FCFA (XOF)
  yearlyPrice: number;  // En FCFA (XOF)
  priceMonthly?: number; // Alias
  priceYearly?: number;  // Alias
  currency: string;     // 'XOF'
  isActive: boolean;
  trialDays: number;
  quotas: PlanQuotas;
  features: FeatureCode[];
  createdAt?: string;
  updatedAt?: string;
}

export type SaaSPlan = Plan;

export interface Subscription {
  id: string;
  organizationId: string;
  organization_id?: string;
  planId: string;
  planCode: PlanCode;
  planName?: string;
  plan?: Plan;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currency: string;
  amount: number;
  startedAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart?: string | null;
  trialEnd?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  cancelledAt?: string | null;
  cancelAtPeriodEnd: boolean;
  cancel_at_period_end?: boolean;
  customQuotas?: Partial<PlanQuotas> | null;
  customFeatures?: FeatureCode[] | null;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionWithPlan = Subscription & { plan?: Plan };

export interface Invoice {
  id: string;
  organizationId: string;
  organization_id?: string;
  subscriptionId?: string | null;
  invoiceNumber: string; // Ex: SEC-2026-000001
  invoice_number?: string;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  dueDate: string;
  due_date?: string;
  paidAt?: string | null;
  paid_at?: string | null;
  periodStart: string;
  period_start?: string;
  periodEnd: string;
  period_end?: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  createdAt: string;
  created_at?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  provider: 'MANUAL' | 'WAVE' | 'ORANGE_MONEY' | 'MTN_MOMO' | 'STRIPE';
  status: PaymentStatus;
  reference?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface CommercialLead {
  id: string;
  companyName: string;
  contactName: string;
  jobTitle?: string;
  phone: string;
  email: string;
  city?: string;
  country?: string;
  requestedPlan?: string;
  agentsCount?: number;
  sitesCount?: number;
  clientsCount?: number;
  needs?: string;
  message?: string;
  status: LeadStatus;
  assignedTo?: string | null;
  organizationId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface UsageMetric {
  key: keyof PlanQuotas;
  label: string;
  current: number;
  max: number;
  percentage: number;
  isSoftLimit: boolean; // >= 80%
  isHardLimit: boolean; // >= 100%
}

export interface OrganizationUsageStats {
  organizationId: string;
  planCode: PlanCode;
  planName: string;
  status: SubscriptionStatus;
  periodStart: string;
  periodEnd: string;
  metrics: Record<keyof PlanQuotas, UsageMetric>;
  hasWarning: boolean;
  hasExceeded: boolean;
}

export interface UsageSummary {
  users: { used: number; limit: number; percentage: number };
  agents: { used: number; limit: number; percentage: number };
  sites: { used: number; limit: number; percentage: number };
  clients: { used: number; limit: number; percentage: number };
  interventions: { used: number; limit: number; percentage: number };
  apiKeys: { used: number; limit: number; percentage: number };
  webhooks: { used: number; limit: number; percentage: number };
}

export interface CommercialDashboardStats {
  activeOrganizationsCount: number;
  trialOrganizationsCount: number;
  expiredOrganizationsCount: number;
  suspendedOrganizationsCount: number;
  activeSubscriptionsCount: number;
  expiringSubscriptionsCount: number;
  unpaidInvoicesCount: number;
  contractualMrr: number; // Somme des abonnements mensualisés (FCFA)
  collectedMrr: number;   // Somme des factures réglées ce mois (FCFA)
  arr: number;            // MRR contractuel * 12 (FCFA)
  trialConversionRatePct: number | null;
  churnRatePct: number | null;
  currency: string;
}

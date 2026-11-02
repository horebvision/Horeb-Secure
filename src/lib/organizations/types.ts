/**
 * SECURIA V2 — PHASE 11 : TYPES MULTI-TENANT & GESTION D'ENTREPRISES
 * Définitions typées pour les Organisations, Abonnements, Membres et Rôles Multi-Tenant
 */

import type { UserRole } from '@/modules/users/types';
import type { PlanCode, BillingCycle } from '@/lib/billing/types';

export type OrganizationStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';

export type MembershipStatus =
  | 'ACTIVE'
  | 'INVITED'
  | 'SUSPENDED'
  | 'REMOVED';

export interface OrganizationDetails {
  id: string;
  name: string;
  trade_name?: string | null;
  commercialName?: string | null;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  postal_code?: string | null;
  rccm?: string | null;
  ncc?: string | null;
  currency?: string | null;
  timezone?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  status: OrganizationStatus;
  plan?: PlanCode | string | null;
  billingCycle?: BillingCycle | string | null;
  is_active: boolean;
  quota_warning_threshold?: number;
  grace_period_days?: number;
  created_at: string;
  updated_at: string;
  createdAt?: string;
  metrics?: {
    usersCount: number;
    agentsCount: number;
    sitesCount: number;
    clientsCount: number;
    interventionsCount: number;
    alertsCount: number;
  };
}

export interface OrganizationMembership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  status: MembershipStatus;
  invited_by?: string | null;
  email?: string;
  full_name?: string;
  created_at: string;
  updated_at: string;
  organization?: OrganizationDetails;
}

export interface CreateOrganizationInput {
  name: string;
  trade_name?: string;
  commercialName?: string;
  legalName?: string;
  country?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  rccm?: string;
  ncc?: string;
  currency?: string;
  timezone?: string;
  plan?: PlanCode | string;
  plan_code?: PlanCode;
  billingCycle?: BillingCycle | string;
  billing_cycle?: BillingCycle;
  trialDays?: number;
  trial_days?: number;
  adminFullName?: string;
  admin_name?: string;
  adminEmail?: string;
  admin_email?: string;
  adminPhone?: string;
  admin_phone?: string;
  adminPassword?: string;
}

export interface OrganizationCredentials {
  organizationId: string;
  organizationName: string;
  adminEmail: string;
  adminFullName: string;
  temporaryPassword: string;
  loginUrl: string;
  inviteLink?: string;
  createdAt: string;
}

export interface OrganizationMetrics {
  users_count: number;
  agents_count: number;
  sites_count: number;
  clients_count: number;
  interventions_count: number;
  cameras_count: number;
  active_alerts_count: number;
  plan_code: PlanCode;
  plan_name: string;
  status: OrganizationStatus;
  renewal_date?: string;
  mrr: number;
}


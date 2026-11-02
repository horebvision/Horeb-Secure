'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { isPlatformAdminUser } from '@/modules/users/types';
import {
  Building2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Users,
  Radio,
  MapPin,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Play,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Calendar,
  X,
  Building,
  Mail,
  Phone,
  Layers,
  ArrowLeft,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Crown,
} from 'lucide-react';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';
import { authFetch } from '@/lib/utils/api-client';
import type {
  OrganizationDetails,
  OrganizationStatus,
  CreateOrganizationInput,
  OrganizationCredentials,
} from '@/lib/organizations/types';

const PLANS_CATALOG_INFO = [
  {
    code: 'STARTER',
    name: 'Horeb Secure Starter',
    badge: 'Starter',
    monthlyPrice: 49000,
    yearlyPrice: 490000,
    accent: 'sky',
    description: 'Petites agences de gardiennage et sécurité locale',
    quotasDesc: '10 agents max • 15 sites • 10 clients',
    features: ['Dispatch central', 'Main courante temps réel', '5 comptes superviseurs', 'Exports PDF/Excel basiques'],
  },
  {
    code: 'PROFESSIONNEL',
    name: 'Horeb Secure Pro',
    badge: 'Professionnel',
    monthlyPrice: 129000,
    yearlyPrice: 1290000,
    accent: 'blue',
    description: 'Sociétés de sécurité en expansion, patrouilles mobiles',
    quotasDesc: '35 agents max • 50 sites • 40 clients',
    features: ['Portail client dédié', 'Signatures électroniques', 'Alertes WhatsApp & SMS', 'Clés API & Webhooks', '15 comptes superviseurs'],
  },
  {
    code: 'BUSINESS_OS',
    name: 'Horeb Secure Business OS',
    badge: 'Recommandé',
    monthlyPrice: 299000,
    yearlyPrice: 2990000,
    accent: 'indigo',
    description: 'Grands opérateurs de sécurité, télésurveillance et patrouilles 24/7',
    quotasDesc: '100 agents max • 200 sites • 150 clients',
    features: ['SOC Command Center 24/7', 'Cartographie live multi-zones', 'Horodatage certifié RFC 3161', '50 superviseurs', 'Connecteurs partenaires'],
  },
  {
    code: 'ENTERPRISE',
    name: 'Horeb Secure Enterprise',
    badge: 'Sur-mesure',
    monthlyPrice: 0,
    yearlyPrice: 0,
    accent: 'amber',
    description: 'Grands comptes multisites, institutions et réseaux nationaux',
    quotasDesc: 'Agents illimités • Sites illimités • Clients illimités',
    features: ['Multi-filiales & Tenants dédiés', 'SLA garanti 99.9%', 'Accompagnement & Setup sur site', 'Support prioritaire 24/7'],
  },
];

const ALLOWED_ROLES = ['ADMIN'] as const;

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);
  const { currentUser, authUser } = useSecuria();

  // Contrôle strict : Seul le Super Admin Plateforme accède à la gestion des tenants
  useEffect(() => {
    if (currentUser?.id || authUser?.id) {
      const isPlatform = isPlatformAdminUser({
        role: currentUser?.role || authUser?.role,
        email: currentUser?.email || authUser?.email,
        organizationId: currentUser?.organization_id || authUser?.organization_id,
        isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
      });
      if (!isPlatform) {
        router.replace('/dispatch');
      }
    }
  }, [currentUser, authUser, router]);

  const [organizations, setOrganizations] = useState<OrganizationDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres et recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal Nouvelle Entreprise
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOrganizationInput>({
    name: '',
    commercialName: '',
    legalName: '',
    rccm: '',
    ncc: '',
    country: 'Côte d\'Ivoire',
    city: 'Abidjan',
    phone: '',
    email: '',
    plan: 'BUSINESS_OS',
    billingCycle: 'MONTHLY',
    trialDays: 14,
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Identifiants générés (suite création ou réinitialisation)
  const [createdCredentials, setCreatedCredentials] = useState<OrganizationCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal Réinitialisation Identifiants d'une entreprise existante
  const [keyModalOrg, setKeyModalOrg] = useState<OrganizationDetails | null>(null);
  const [keyModalPassword, setKeyModalPassword] = useState('');
  const [keyModalLoading, setKeyModalLoading] = useState(false);

  // Modal Suspension / Réactivation
  const [selectedOrg, setSelectedOrg] = useState<OrganizationDetails | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'REACTIVATE' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal Modification du Plan SaaS d'une entreprise existante (Super Admin)
  const [planModalOrg, setPlanModalOrg] = useState<OrganizationDetails | null>(null);
  const [planModalForm, setPlanModalForm] = useState<{
    plan: string;
    billingCycle: string;
    status: OrganizationStatus;
    trialDays: number;
    reason: string;
  }>({
    plan: 'BUSINESS_OS',
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    trialDays: 0,
    reason: '',
  });
  const [planModalLoading, setPlanModalLoading] = useState(false);
  const [planModalSuccess, setPlanModalSuccess] = useState<string | null>(null);

  const handleOpenPlanModal = (org: OrganizationDetails) => {
    setPlanModalOrg(org);
    setPlanModalForm({
      plan: org.plan || 'BUSINESS_OS',
      billingCycle: org.billingCycle || 'MONTHLY',
      status: org.status || 'ACTIVE',
      trialDays: org.status === 'TRIAL' ? 14 : 0,
      reason: '',
    });
    setPlanModalSuccess(null);
  };

  const handlePlanModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planModalOrg) return;
    setPlanModalLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/organizations/${planModalOrg.id}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planModalForm),
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));
      if (data.success) {
        setPlanModalSuccess(`Le plan de "${planModalOrg.name}" a été basculé sur "${planModalForm.plan}" avec succès !`);
        fetchOrganizations();
        setTimeout(() => {
          setPlanModalOrg(null);
          setPlanModalSuccess(null);
        }, 1300);
      } else {
        setError(data.error || 'Erreur lors du changement de plan');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setPlanModalLoading(false);
    }
  };

  // Chargement des entreprises
  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/admin/organizations');
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));
      if (data.success) {
        setOrganizations(data.organizations || []);
      } else {
        if (data.requiredLevel === 'PLATFORM_ADMIN' || res.status === 403) {
          window.location.replace('/dispatch');
          return;
        }
        setError(data.error || 'Erreur lors du chargement des entreprises');
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  // Filtrage
  const filteredOrganizations = useMemo(() => {
    return organizations.filter((org) => {
      const matchesStatus =
        statusFilter === 'ALL' || org.status === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        org.name.toLowerCase().includes(q) ||
        (org.commercialName && org.commercialName.toLowerCase().includes(q)) ||
        (org.email && org.email.toLowerCase().includes(q)) ||
        (org.phone && org.phone.toLowerCase().includes(q)) ||
        (org.rccm && org.rccm.toLowerCase().includes(q)) ||
        org.id.toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [organizations, statusFilter, searchQuery]);

  // Statistiques calculées
  const stats = useMemo(() => {
    const total = organizations.length;
    const active = organizations.filter((o) => o.status === 'ACTIVE').length;
    const trial = organizations.filter((o) => o.status === 'TRIAL').length;
    const suspended = organizations.filter((o) => o.status === 'SUSPENDED').length;

    // Estimation MRR
    const planPrices: Record<string, number> = {
      STARTER: 99000,
      PROFESSIONNEL: 249000,
      BUSINESS_OS: 499000,
      ENTERPRISE: 990000,
    };
    const mrr = organizations
      .filter((o) => o.status === 'ACTIVE')
      .reduce((sum, o) => sum + (planPrices[o.plan || 'BUSINESS_OS'] || 0), 0);

    return { total, active, trial, suspended, mrr };
  }, [organizations]);

  // Gestion création
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setError(null);
    setCreateSuccess(null);

    try {
      const res = await authFetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));

      if (data.success) {
        fetchOrganizations();
        if (data.credentials) {
          setCreatedCredentials(data.credentials);
        } else {
          setCreateSuccess(`Entreprise "${data.organization.name}" créée avec succès !`);
          setTimeout(() => {
            setIsCreateModalOpen(false);
            setCreateSuccess(null);
            setCreateForm({
              name: '',
              commercialName: '',
              legalName: '',
              rccm: '',
              ncc: '',
              country: 'Côte d\'Ivoire',
              city: 'Abidjan',
              phone: '',
              email: '',
              plan: 'BUSINESS_OS',
              billingCycle: 'MONTHLY',
              trialDays: 14,
              adminFullName: '',
              adminEmail: '',
              adminPassword: '',
            });
          }, 1500);
        }
      } else {
        setError(data.error || 'Erreur lors de la création');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setCreateLoading(false);
    }
  };

  // Copier dans le presse-papier avec feedback
  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Réinitialiser les identifiants d'une organisation
  const handleResetCredentials = (org: OrganizationDetails) => {
    setKeyModalOrg(org);
    setKeyModalPassword('');
  };

  const submitResetCredentials = async () => {
    if (!keyModalOrg) return;
    setKeyModalLoading(true);
    try {
      const res = await authFetch(`/api/admin/organizations/${keyModalOrg.id}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPassword: keyModalPassword || undefined }),
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));
      if (data.success && data.credentials) {
        setCreatedCredentials(data.credentials);
        setIsCreateModalOpen(true);
        setKeyModalOrg(null);
      } else {
        alert(data.error || 'Erreur lors de la réinitialisation des accès');
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    } finally {
      setKeyModalLoading(false);
    }
  };

  // Action Suspension / Réactivation
  const handleStatusAction = async () => {
    if (!selectedOrg || !actionType) return;
    setActionLoading(true);
    setError(null);

    try {
      const endpoint =
        actionType === 'SUSPEND'
          ? `/api/admin/organizations/${selectedOrg.id}/suspend`
          : `/api/admin/organizations/${selectedOrg.id}/reactivate`;

      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionReason }),
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));

      if (data.success) {
        setSelectedOrg(null);
        setActionType(null);
        setActionReason('');
        fetchOrganizations();
      } else {
        setError(data.error || 'Action impossible');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de communication');
    } finally {
      setActionLoading(false);
    }
  };

  // Basculer vers l'organisation (Impersonation / switch pour Platform Admin)
  const handleSwitchToOrg = async (orgId: string) => {
    try {
      try {
        localStorage.setItem('securia_org_id', orgId);
        document.cookie = `securia_org_id=${encodeURIComponent(orgId)}; path=/; max-age=2592000; SameSite=Lax${typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''}`;
      } catch {}

      const res = await authFetch('/api/organization/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = '/dispatch';
      } else {
        alert(data.error || 'Erreur lors du basculement');
      }
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white p-4">
        <div className="text-center space-y-4 max-w-md">
          <Shield className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
          <h1 className="text-xl font-bold">Accès Réservé au Super Admin</h1>
          <p className="text-slate-400 text-sm">
            Cette console requiert les privilèges de Platform Admin de la plateforme SaaS HOREB SECURE.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
          >
            <ArrowLeft className="w-4 h-4" /> Retour à l'administration
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-white bg-clip-text text-transparent">
                Gestion des Entreprises (Tenants)
              </h1>
            </div>
            <p className="text-slate-400 text-sm mt-1 ml-11">
              Supervision SaaS multi-entreprises, quotas, abonnements et isolation des données.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchOrganizations}
              disabled={loading}
              className="p-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-300 transition"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-white shadow-lg shadow-blue-500/20 transition text-sm"
            >
              <Plus className="w-4 h-4" /> Nouvelle entreprise
            </button>
          </div>
        </div>

        {/* Message d'erreur global */}
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800/50 rounded-xl flex items-center justify-between text-red-300 text-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPIs SaaS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Entreprises</span>
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold mt-2 text-white">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-1">Plateforme HOREB SECURE</div>
          </div>

          <div className="bg-slate-900/60 border border-emerald-900/30 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-emerald-400 text-xs">
              <span>Actives</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold mt-2 text-emerald-300">{stats.active}</div>
            <div className="text-[11px] text-emerald-600 mt-1">Abonnements confirmés</div>
          </div>

          <div className="bg-slate-900/60 border border-amber-900/30 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-amber-400 text-xs">
              <span>En Essai (Trial)</span>
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold mt-2 text-amber-300">{stats.trial}</div>
            <div className="text-[11px] text-amber-600 mt-1">14 jours par défaut</div>
          </div>

          <div className="bg-slate-900/60 border border-red-900/30 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-red-400 text-xs">
              <span>Suspendues</span>
              <Ban className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold mt-2 text-red-300">{stats.suspended}</div>
            <div className="text-[11px] text-red-600 mt-1">Données préservées</div>
          </div>

          <div className="bg-slate-900/60 border border-blue-900/30 p-4 rounded-2xl col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-blue-400 text-xs">
              <span>MRR Contractuel</span>
              <DollarSign className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold mt-2 text-white">
              {stats.mrr.toLocaleString('fr-FR')} <span className="text-xs text-slate-400">FCFA</span>
            </div>
            <div className="text-[11px] text-blue-500 mt-1">Revenu récurrent mensuel</div>
          </div>
        </div>

        {/* Barre de Recherche et Filtres */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
            <input
              type="text"
              placeholder="Rechercher par nom, email, téléphone, RCCM ou UUID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {st === 'ALL' ? 'Toutes' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Tableau des Entreprises */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-4">Entreprise</th>
                  <th className="px-4 py-4">Plan SaaS</th>
                  <th className="px-4 py-4">Statut</th>
                  <th className="px-4 py-4">Consommation & Quotas</th>
                  <th className="px-4 py-4">Création</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrganizations.map((org) => {
                  const m = org.metrics;
                  const isCurrentMaster = org.id === '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517';

                  return (
                    <tr key={org.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 bg-blue-950/50 border border-blue-900/50 rounded-xl text-blue-400 shrink-0 mt-0.5">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                              {org.name}
                              {isCurrentMaster && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                                  MASTER
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {org.commercialName || org.city || 'Côte d\'Ivoire'}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 mt-1 select-all">
                              {org.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <button
                          onClick={() => handleOpenPlanModal(org)}
                          className="group text-left"
                          title="Cliquez pour changer le plan SaaS de cette entreprise"
                        >
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 border border-slate-700 text-blue-300 group-hover:border-purple-500 group-hover:bg-purple-950/40 group-hover:text-purple-300 transition">
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                            {org.plan || 'BUSINESS_OS'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 capitalize group-hover:text-purple-400 transition flex items-center gap-1">
                            {org.billingCycle?.toLowerCase() || 'mensuel'} • Changer
                          </div>
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            org.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : org.status === 'TRIAL'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : org.status === 'SUSPENDED'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              org.status === 'ACTIVE'
                                ? 'bg-emerald-400'
                                : org.status === 'TRIAL'
                                ? 'bg-amber-400'
                                : 'bg-red-400'
                            }`}
                          />
                          {org.status}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        {m ? (() => {
                          const totalUsers = m.usersCount || 0;
                          const agents = m.agentsCount || 0;
                          const admins = Math.max(0, totalUsers - agents);

                          return (
                            <div className="space-y-1.5 text-xs text-slate-300">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="flex items-center gap-1 text-blue-300 font-semibold" title={`${agents} agents de sécurité enregistrés`}>
                                  <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" /> {agents} agent{agents > 1 ? 's' : ''}
                                </span>
                                <span className="flex items-center gap-1 text-slate-400" title={`${admins} compte(s) administrateur / direction`}>
                                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {admins} admin{admins > 1 ? 's' : ''}
                                </span>
                                <Link
                                  href={`/admin?tab=SITES&org=${org.id}`}
                                  className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 hover:underline transition"
                                  title={`${m.sitesCount} sites protégés enregistrés en base de données`}
                                >
                                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> {m.sitesCount} site{m.sitesCount > 1 ? 's' : ''}
                                </Link>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span title="Total cumulé des comptes autorisés (agents + administrateur)">{totalUsers} compte{totalUsers > 1 ? 's' : ''} actif{totalUsers > 1 ? 's' : ''}</span>
                                <span>•</span>
                                <span>Alertes: {m.alertsCount}</span>
                                <span>•</span>
                                <span>Interventions: {m.interventionsCount}</span>
                              </div>
                            </div>
                          );
                        })() : (
                          <span className="text-xs text-slate-500">Non calculé</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-400">
                        {new Date(org.createdAt || org.created_at || Date.now()).toLocaleDateString('fr-FR')}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin?tab=SITES&org=${org.id}`}
                            className="p-1.5 hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-400 rounded-lg transition"
                            title="Consulter les sites protégés de cette entreprise"
                          >
                            <MapPin className="w-4 h-4" />
                          </Link>

                          <button
                            onClick={() => handleSwitchToOrg(org.id)}
                            className="p-1.5 hover:bg-blue-600/20 text-slate-400 hover:text-blue-400 rounded-lg transition"
                            title="Ouvrir l'espace de cette entreprise"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleOpenPlanModal(org)}
                            className="p-1.5 hover:bg-purple-600/20 text-slate-400 hover:text-purple-400 rounded-lg transition"
                            title="Modifier le plan SaaS & Quotas (Super Admin)"
                          >
                            <Crown className="w-4 h-4 text-amber-400/90" />
                          </button>

                          <button
                            onClick={() => handleResetCredentials(org)}
                            className="p-1.5 hover:bg-amber-600/20 text-slate-400 hover:text-amber-400 rounded-lg transition"
                            title="Générer ou réinitialiser les identifiants d'accès"
                          >
                            <Key className="w-4 h-4" />
                          </button>

                          {org.status === 'ACTIVE' || org.status === 'TRIAL' ? (
                            <button
                              onClick={() => {
                                setSelectedOrg(org);
                                setActionType('SUSPEND');
                              }}
                              className="p-1.5 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg transition"
                              title="Suspendre l'entreprise (sans perte de données)"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedOrg(org);
                                setActionType('REACTIVATE');
                              }}
                              className="p-1.5 hover:bg-emerald-600/20 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                              title="Réactiver l'entreprise"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredOrganizations.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-500">
                      Aucune entreprise trouvée avec ces critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Création Entreprise */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600/20 rounded-xl text-blue-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Nouvelle Entreprise Cliente</h2>
                    <p className="text-xs text-slate-400">
                      Provisionne un nouveau tenant, un administrateur initial et initialise les quotas SaaS.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {createdCredentials ? (
                <div className="space-y-6">
                  <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-bold text-emerald-200">
                        Entreprise & Espace Administrateur Activés !
                      </h3>
                      <p className="text-xs text-emerald-300/80 mt-1">
                        L'entreprise <strong className="text-white">{createdCredentials.organizationName}</strong> est configurée. Transmettez les identifiants ci-dessous à son dirigeant pour sa première connexion.
                      </p>
                    </div>
                  </div>

                  {/* Carte des identifiants */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-amber-400" /> Identifiants de Connexion
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                        Rôle : Administrateur Entreprise
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Lien d'accès (Portail Web)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={createdCredentials.loginUrl}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(createdCredentials.loginUrl, 'url')}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                          >
                            {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedField === 'url' ? 'Copié' : 'Copier'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Identifiant de connexion (Email)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={createdCredentials.adminEmail}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(createdCredentials.adminEmail, 'email')}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                          >
                            {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedField === 'email' ? 'Copié' : 'Copier'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          Mot de passe temporaire
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative w-full">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              readOnly
                              value={createdCredentials.temporaryPassword}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-300 font-mono tracking-wider"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(createdCredentials.temporaryPassword, 'password')}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                          >
                            {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedField === 'password' ? 'Copié' : 'Copier'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message prêt à envoyer pour WhatsApp / Email */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                      <span>Message d'accueil prêt à transmettre (WhatsApp / Email)</span>
                      {copiedField === 'message' && (
                        <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                          <Check className="w-3 h-3" /> Message complet copié !
                        </span>
                      )}
                    </label>
                    <textarea
                      readOnly
                      rows={5}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 font-sans focus:outline-none"
                      value={`Bonjour ${createdCredentials.adminFullName},\n\nVotre espace entreprise HOREB SECURE pour "${createdCredentials.organizationName}" a été activé avec succès.\n\nVoici vos accès administrateur :\n• Lien de connexion : ${createdCredentials.loginUrl}\n• Identifiant (Email) : ${createdCredentials.adminEmail}\n• Mot de passe temporaire : ${createdCredentials.temporaryPassword}\n\nVous pourrez personnaliser votre mot de passe et inviter vos équipes dès votre première connexion.\n\nL'équipe HOREB SECURE.`}
                    />
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `Bonjour ${createdCredentials.adminFullName},\n\nVotre espace entreprise HOREB SECURE pour "${createdCredentials.organizationName}" a été activé avec succès.\n\nVoici vos accès administrateur :\n• Lien de connexion : ${createdCredentials.loginUrl}\n• Identifiant (Email) : ${createdCredentials.adminEmail}\n• Mot de passe temporaire : ${createdCredentials.temporaryPassword}\n\nVous pourrez personnaliser votre mot de passe et inviter vos équipes dès votre première connexion.\n\nL'équipe HOREB SECURE.`,
                            'message'
                          )
                        }
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-900/30"
                      >
                        <Copy className="w-4 h-4" /> Copier le message complet pour le client
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setIsCreateModalOpen(false);
                        setCreateForm({
                          name: '',
                          commercialName: '',
                          legalName: '',
                          rccm: '',
                          ncc: '',
                          country: "Côte d'Ivoire",
                          city: 'Abidjan',
                          phone: '',
                          email: '',
                          plan: 'BUSINESS_OS',
                          billingCycle: 'MONTHLY',
                          trialDays: 14,
                          adminFullName: '',
                          adminEmail: '',
                          adminPassword: '',
                        });
                      }}
                      className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition"
                    >
                      Terminer & Fermer
                    </button>
                  </div>
                </div>
              ) : createSuccess ? (
                <div className="p-6 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-emerald-200 font-semibold">{createSuccess}</p>
                </div>
              ) : (
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Nom légal de l'entreprise *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: SECURITAS CÔTE D'IVOIRE SARL"
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Nom commercial
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: SECURITAS CI"
                        value={createForm.commercialName || ''}
                        onChange={(e) =>
                          setCreateForm({ ...createForm, commercialName: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Numéro RCCM
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: CI-ABJ-2026-B-12345"
                        value={createForm.rccm || ''}
                        onChange={(e) => setCreateForm({ ...createForm, rccm: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Ville & Pays
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Abidjan"
                          value={createForm.city || ''}
                          onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="text"
                          placeholder="Côte d'Ivoire"
                          value={createForm.country || ''}
                          onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-400" />
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Formule Commerciale & Quotas SaaS (Droits Super Admin)
                        </h3>
                      </div>
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Attribution discrétionnaire
                      </span>
                    </div>

                    <p className="text-xs text-slate-400">
                      Sélectionnez la formule d'abonnement que vous attribuez à cette société de sécurité. Les quotas opérationnels (agents max, sites, fonctionnalités) seront instantanément assignés.
                    </p>

                    {/* Grille des plans cliquables */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PLANS_CATALOG_INFO.map((plan) => {
                        const isSelected = createForm.plan === plan.code;
                        const isYearly = createForm.billingCycle === 'ANNUAL';
                        const displayPrice =
                          plan.monthlyPrice === 0
                            ? 'Sur mesure'
                            : isYearly
                            ? `${(plan.yearlyPrice / 12).toLocaleString('fr-FR')} FCFA/m (${plan.yearlyPrice.toLocaleString('fr-FR')} /an)`
                            : `${plan.monthlyPrice.toLocaleString('fr-FR')} FCFA/mois`;

                        return (
                          <div
                            key={plan.code}
                            onClick={() => setCreateForm({ ...createForm, plan: plan.code as any })}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition relative ${
                              isSelected
                                ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-white">{plan.name}</span>
                                  {plan.code === 'BUSINESS_OS' && (
                                    <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-500/30">
                                      Recommandé
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-blue-400 font-semibold mt-0.5">
                                  {displayPrice}
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-700 bg-slate-900'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>

                            <div className="text-[11px] text-emerald-400 font-medium mt-1.5 flex items-center gap-1">
                              <Shield className="w-3 h-3 shrink-0" />
                              <span>{plan.quotasDesc}</span>
                            </div>

                            <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                              {plan.features.join(' • ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Paramètres de facturation & activation */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Cycle de facturation
                        </label>
                        <select
                          value={createForm.billingCycle}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, billingCycle: e.target.value as any })
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="MONTHLY">Mensuel (Engagement standard)</option>
                          <option value="ANNUAL">Annuel (-15% de remise appliquée)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Mode d'activation du compte
                        </label>
                        <select
                          value={createForm.trialDays}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, trialDays: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value={0}>Actif direct (Aucun essai - Prêt à l'emploi)</option>
                          <option value={14}>Période d'essai de 14 jours (Standard)</option>
                          <option value={30}>Période d'essai étendue de 30 jours</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Administrateur Initial de l'Entreprise
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Nom Complet *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: Jean-Marc Kouassi"
                          value={createForm.adminFullName}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, adminFullName: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Email Professionnel *
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="admin@securitas.ci"
                          value={createForm.adminEmail}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, adminEmail: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Mot de passe initial (Optionnel)
                        </label>
                        <input
                          type="text"
                          placeholder="Auto si vide"
                          value={createForm.adminPassword || ''}
                          onChange={(e) =>
                            setCreateForm({ ...createForm, adminPassword: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={createLoading}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm shadow transition flex items-center gap-2"
                    >
                      {createLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Provisionnement...
                        </>
                      ) : (
                        'Créer l\'entreprise'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Modal Réinitialisation / Consultation des identifiants d'une entreprise */}
        {keyModalOrg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Identifiants Administrateur</h3>
                    <p className="text-xs text-slate-400">{keyModalOrg.name}</p>
                  </div>
                </div>
                <button onClick={() => setKeyModalOrg(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Vous pouvez générer un nouveau mot de passe temporaire pour l'administrateur de cette entreprise (<strong className="text-white">{keyModalOrg.email}</strong>).
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Nouveau mot de passe (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Laisser vide pour générer automatiquement"
                  value={keyModalPassword}
                  onChange={(e) => setKeyModalPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setKeyModalOrg(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={keyModalLoading}
                  onClick={submitResetCredentials}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs transition flex items-center gap-2"
                >
                  {keyModalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  Générer les accès
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Suspension / Réactivation */}
        {selectedOrg && actionType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    actionType === 'SUSPEND'
                      ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                      : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                  }`}
                >
                  {actionType === 'SUSPEND' ? (
                    <Ban className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    {actionType === 'SUSPEND'
                      ? `Suspendre ${selectedOrg.name}`
                      : `Réactiver ${selectedOrg.name}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {actionType === 'SUSPEND'
                      ? 'Les données sont conservées intactes. Les opérations métier seront bloquées.'
                      : 'Rétablit l\'accès complet aux fonctionnalités selon l\'abonnement.'}
                  </p>
                </div>
              </div>

              {actionType === 'SUSPEND' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Motif de la suspension
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Facture impayée depuis plus de 30 jours..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-red-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrg(null);
                    setActionType(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleStatusAction}
                  className={`px-5 py-2 font-semibold text-white rounded-xl text-sm transition flex items-center gap-2 ${
                    actionType === 'SUSPEND'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {actionLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : actionType === 'SUSPEND' ? (
                    'Confirmer la suspension'
                  ) : (
                    'Confirmer la réactivation'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Modification du Plan SaaS d'une entreprise (Super Admin) */}
        {planModalOrg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-600/20 text-purple-400 rounded-xl border border-purple-500/30">
                    <Crown className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Modifier le Plan SaaS — {planModalOrg.name}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Privilège Super Admin : Ajustez la formule commerciale, le cycle et les quotas opérationnels.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPlanModalOrg(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {planModalSuccess ? (
                <div className="p-6 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
                  <p className="text-emerald-200 font-semibold text-sm">{planModalSuccess}</p>
                </div>
              ) : (
                <form onSubmit={handlePlanModalSubmit} className="space-y-4">
                  {/* Informations de l'entreprise */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400">Plan actuel :</span>{' '}
                      <span className="font-bold text-blue-400 uppercase">
                        {planModalOrg.plan || 'BUSINESS_OS'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Statut :</span>{' '}
                      <span className="font-semibold text-emerald-400">{planModalOrg.status}</span>
                    </div>
                  </div>

                  {/* Choix de la formule */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Sélectionnez la nouvelle formule SaaS
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PLANS_CATALOG_INFO.map((plan) => {
                        const isSelected = planModalForm.plan === plan.code;
                        const isYearly = planModalForm.billingCycle === 'ANNUAL' || planModalForm.billingCycle === 'YEARLY';
                        const displayPrice =
                          plan.monthlyPrice === 0
                            ? 'Sur mesure'
                            : isYearly
                            ? `${(plan.yearlyPrice / 12).toLocaleString('fr-FR')} FCFA/m (${plan.yearlyPrice.toLocaleString('fr-FR')} /an)`
                            : `${plan.monthlyPrice.toLocaleString('fr-FR')} FCFA/mois`;

                        return (
                          <div
                            key={plan.code}
                            onClick={() => setPlanModalForm({ ...planModalForm, plan: plan.code })}
                            className={`p-3 rounded-xl border text-left cursor-pointer transition relative ${
                              isSelected
                                ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-500/10 ring-1 ring-purple-500'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-xs text-white">{plan.name}</div>
                                <div className="text-[11px] text-purple-400 font-semibold mt-0.5">
                                  {displayPrice}
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected ? 'border-purple-500 bg-purple-500 text-white' : 'border-slate-700 bg-slate-900'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <div className="text-[11px] text-emerald-400 font-medium mt-1.5 flex items-center gap-1">
                              <Shield className="w-3 h-3 shrink-0" />
                              <span>{plan.quotasDesc}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Paramètres de cycle et statut */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Cycle de facturation
                      </label>
                      <select
                        value={planModalForm.billingCycle}
                        onChange={(e) =>
                          setPlanModalForm({ ...planModalForm, billingCycle: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                      >
                        <option value="MONTHLY">Mensuel</option>
                        <option value="ANNUAL">Annuel (-15%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Statut d'abonnement
                      </label>
                      <select
                        value={planModalForm.status}
                        onChange={(e) =>
                          setPlanModalForm({ ...planModalForm, status: e.target.value as any })
                        }
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                      >
                        <option value="ACTIVE">ACTIVE (Abonnement confirmé)</option>
                        <option value="TRIAL">TRIAL (En période d'essai)</option>
                        <option value="SUSPENDED">SUSPENDED (Suspendu)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Motif de la modification (Audit & Traçabilité)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Contrat annuel signé, accord commercial Super Admin..."
                      value={planModalForm.reason}
                      onChange={(e) =>
                        setPlanModalForm({ ...planModalForm, reason: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPlanModalOrg(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={planModalLoading}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-purple-900/30 transition flex items-center gap-2"
                    >
                      {planModalLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Application...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" /> Appliquer le plan immédiatement
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

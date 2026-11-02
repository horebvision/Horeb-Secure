'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { isPlatformAdminUser } from '@/modules/users/types';
import {
  Layers,
  Building,
  Users,
  ShieldAlert,
  Car,
  Activity,
  ArrowLeft,
  Lock,
  Server,
  Database,
  CheckCircle,
  FileText,
  Trash2,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Phone,
  Mail,
  ShieldCheck,
  Calendar,
  Clock,
  ExternalLink,
  ChevronRight,
  X,
  UserCheck,
  TrendingUp,
  Sparkles,
  Send,
  UserPlus,
  Edit3,
  Power,
  MapPin,
  Navigation,
  Key,
  Plus,
  Home,
  Store,
  Briefcase,
  Radio,
} from 'lucide-react';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';
import { authFetch } from '@/lib/utils/api-client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { CommercialLead, LeadStatus } from '@/lib/billing/types';
import { CreateUserModal } from '@/components/admin/CreateUserModal';
import { EditUserModal } from '@/components/admin/EditUserModal';
import { CreateSiteModal } from '@/components/admin/CreateSiteModal';
import { EditSiteModal } from '@/components/admin/EditSiteModal';
import { EditAgentModal } from '@/components/admin/EditAgentModal';
import { CreateCenterModal } from '@/components/admin/CreateCenterModal';
import { EditCenterModal } from '@/components/admin/EditCenterModal';

const ALLOWED_ROLES = ['ADMIN'] as const;

export interface AdminCenterRecord {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  organization?: {
    id: string;
    name: string;
    commercial_name?: string | null;
  };
  agents?: Array<{
    id: string;
    security_center_id?: string | null;
    badge_number: string;
    duty_status: string;
    patrol_vehicle?: string | null;
    is_active: boolean;
    user?: {
      id: string;
      full_name: string;
      phone: string;
      email: string;
    };
  }>;
  agents_count?: number;
  active_interventions_count?: number;
}

export interface AdminAgentRecord {
  id: string;
  user_id: string;
  organization_id: string;
  security_center_id?: string | null;
  badge_number: string;
  duty_status: 'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED';
  patrol_vehicle?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  last_location_update?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name: string;
    phone?: string | null;
    role: string;
    is_active: boolean;
    avatar_url?: string | null;
    created_at: string;
  } | null;
  organization?: {
    id: string;
    name: string;
    commercial_name?: string | null;
  } | null;
  security_center?: {
    id: string;
    name: string;
    code: string;
    city?: string | null;
  } | null;
  active_mission?: {
    id: string;
    alert_id?: string | null;
    status: string;
    assigned_at?: string | null;
    alerts?: {
      id: string;
      alert_number: string;
      type: string;
      status: string;
      location_address?: string | null;
    } | null;
  } | null;
}

export interface AdminSiteRecord {
  id: string;
  name: string;
  site_type: 'RESIDENCE' | 'COMMERCE' | 'ENTREPRISE' | 'AUTRE';
  address: string;
  city: string;
  postal_code?: string | null;
  latitude: number;
  longitude: number;
  access_instructions?: string | null;
  is_default: boolean;
  owner_id?: string | null;
  organization_id?: string | null;
  security_center_id?: string | null;
  created_at: string;
  updated_at: string;
  organizations?: {
    id: string;
    name: string;
    commercial_name?: string | null;
  } | null;
  owner?: {
    id: string;
    full_name: string;
    phone?: string | null;
    email: string;
  } | null;
}

interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  role: 'USER' | 'AGENT' | 'SECURITY_MANAGER' | 'ADMIN' | 'SECRETARY';
  phone?: string | null;
  organization_id?: string | null;
  organizations?: {
    id: string;
    name: string;
    commercial_name?: string | null;
  } | null;
  security_center_id?: string | null;
  is_active?: boolean;
  created_at: string;
  security_agents?: {
    id: string;
    badge_number: string;
    duty_status: string;
    patrol_vehicle?: string | null;
  } | Array<{
    id: string;
    badge_number: string;
    duty_status: string;
    patrol_vehicle?: string | null;
  }> | null;
}

interface InterventionRecord {
  id: string;
  status: string;
  report?: string | null;
  created_at: string;
  resolved_at?: string | null;
  arrived_at?: string | null;
  agent_id?: string | null;
  alert_id?: string | null;
  alerts?: {
    id: string;
    alert_number: string;
    type: string;
    status: string;
    location_address?: string | null;
    users?: {
      full_name: string;
      email: string;
      phone?: string | null;
    } | null;
    protected_sites?: {
      name?: string | null;
      address?: string | null;
      city?: string | null;
    } | null;
  } | null;
  security_agents?: {
    id: string;
    badge_number: string;
    patrol_vehicle?: string | null;
    duty_status?: string | null;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);
  const { organization, agents, sites, alerts, alertEvents, currentUser, authUser } = useSecuria();

  // Contrôle strict : Seul le Super Admin Plateforme accède à la console superviseur SaaS
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

  // Onglet actif
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'USERS' | 'AGENTS' | 'CENTERS' | 'SITES' | 'REPORTS' | 'LEADS'>('LEADS');

  // Détection des paramètres d'URL (?tab=SITES&org=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const orgParam = params.get('org');
      if (tabParam === 'SITES') {
        setActiveTab('SITES');
      } else if (tabParam === 'AGENTS') {
        setActiveTab('AGENTS');
      } else if (tabParam === 'CENTERS') {
        setActiveTab('CENTERS');
      } else if (tabParam === 'USERS') {
        setActiveTab('USERS');
      } else if (tabParam === 'REPORTS') {
        setActiveTab('REPORTS');
      } else if (tabParam === 'LEADS') {
        setActiveTab('LEADS');
      }
      if (orgParam) {
        setSiteOrgFilter(orgParam);
        setAgentOrgFilter(orgParam);
        setCenterOrgFilter(orgParam);
      }
    }
  }, []);

  // États Demandes de démonstration / Prospects
  const [leadsList, setLeadsList] = useState<CommercialLead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('ALL');
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  // États Utilisateurs & Organisations
  const [usersList, setUsersList] = useState<AdminUserRecord[]>([]);
  const [organizationsList, setOrganizationsList] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [userToDelete, setUserToDelete] = useState<AdminUserRecord | null>(null);
  const [userToEdit, setUserToEdit] = useState<AdminUserRecord | null>(null);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // États Agents de Sécurité
  const [agentsList, setAgentsList] = useState<AdminAgentRecord[]>([]);
  const [securityCentersList, setSecurityCentersList] = useState<any[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentDutyFilter, setAgentDutyFilter] = useState<string>('ALL');
  const [agentOrgFilter, setAgentOrgFilter] = useState<string>('ALL');
  const [agentCenterFilter, setAgentCenterFilter] = useState<string>('ALL');
  const [agentStatusFilter, setAgentStatusFilter] = useState<string>('ALL');
  const [agentToEdit, setAgentToEdit] = useState<AdminAgentRecord | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  // États Centres de Sécurité (SOC)
  const [centersList, setCentersList] = useState<AdminCenterRecord[]>([]);
  const [isLoadingCenters, setIsLoadingCenters] = useState(false);
  const [centerSearchQuery, setCenterSearchQuery] = useState('');
  const [centerOrgFilter, setCenterOrgFilter] = useState<string>('ALL');
  const [centerStatusFilter, setCenterStatusFilter] = useState<string>('ALL');
  const [isCreateCenterModalOpen, setIsCreateCenterModalOpen] = useState(false);
  const [centerToEdit, setCenterToEdit] = useState<AdminCenterRecord | null>(null);
  const [centerToDelete, setCenterToDelete] = useState<AdminCenterRecord | null>(null);
  const [togglingCenterId, setTogglingCenterId] = useState<string | null>(null);
  const [isDeletingCenter, setIsDeletingCenter] = useState(false);

  // États Sites Protégés
  const [sitesList, setSitesList] = useState<AdminSiteRecord[]>([]);
  const [isLoadingSites, setIsLoadingSites] = useState(false);
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [siteTypeFilter, setSiteTypeFilter] = useState<string>('ALL');
  const [siteOrgFilter, setSiteOrgFilter] = useState<string>('ALL');
  const [isCreateSiteModalOpen, setIsCreateSiteModalOpen] = useState(false);
  const [siteToEdit, setSiteToEdit] = useState<AdminSiteRecord | null>(null);
  const [siteToDelete, setSiteToDelete] = useState<AdminSiteRecord | null>(null);
  const [isDeletingSite, setIsDeletingSite] = useState(false);

  // États Rapports d'intervention
  const [interventionsList, setInterventionsList] = useState<InterventionRecord[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  // Notification / Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Chargement des demandes de démonstration / leads
  const loadLeads = useCallback(async () => {
    setIsLoadingLeads(true);
    try {
      const res = await authFetch('/api/billing/leads');
      if (res.ok) {
        const data = await res.json();
        setLeadsList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement leads:', err);
    } finally {
      setIsLoadingLeads(false);
    }
  }, []);

  // 2. Chargement des utilisateurs
  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const res = await authFetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
        if (Array.isArray(data.organizations)) {
          setOrganizationsList(data.organizations);
        }
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement utilisateurs:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  // 3. Chargement des rapports d'intervention
  const loadReports = useCallback(async () => {
    setIsLoadingReports(true);
    try {
      const res = await authFetch('/api/interventions?limit=100');
      if (res.ok) {
        const data = await res.json();
        setInterventionsList(data.interventions || []);
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement interventions:', err);
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  // 4. Chargement des sites protégés
  const loadSites = useCallback(async () => {
    setIsLoadingSites(true);
    try {
      const res = await authFetch('/api/sites');
      if (res.ok) {
        const data = await res.json();
        setSitesList(data.sites || []);
        if (Array.isArray(data.organizations) && data.organizations.length > 0) {
          setOrganizationsList((prev) => (prev.length > 0 ? prev : data.organizations));
        }
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement sites:', err);
    } finally {
      setIsLoadingSites(false);
    }
  }, []);

  // 5. Chargement des agents de sécurité
  const loadAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      const res = await authFetch('/api/admin/agents');
      if (res.ok) {
        const data = await res.json();
        setAgentsList(data.agents || []);
        if (Array.isArray(data.securityCenters)) {
          setSecurityCentersList(data.securityCenters);
        }
        if (Array.isArray(data.organizations) && data.organizations.length > 0) {
          setOrganizationsList((prev) => (prev.length > 0 ? prev : data.organizations));
        }
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement agents:', err);
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  // 6. Chargement des centres de sécurité (SOC)
  const loadCenters = useCallback(async () => {
    setIsLoadingCenters(true);
    try {
      const res = await authFetch('/api/admin/centers');
      if (res.ok) {
        const data = await res.json();
        setCentersList(data.centers || []);
        if (Array.isArray(data.organizations) && data.organizations.length > 0) {
          setOrganizationsList((prev) => (prev.length > 0 ? prev : data.organizations));
        }
      }
    } catch (err) {
      console.warn('[Admin] Erreur chargement centres:', err);
    } finally {
      setIsLoadingCenters(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      loadLeads();
      loadUsers();
      loadReports();
      loadSites();
      loadAgents();
      loadCenters();
    }
  }, [isAuthorized, loadLeads, loadUsers, loadReports, loadSites, loadAgents, loadCenters]);

  // Filtrage des demandes de démo
  const filteredLeads = useMemo(() => {
    return leadsList.filter((l) => {
      const matchStatus = leadStatusFilter === 'ALL' || l.status === leadStatusFilter;
      const q = leadSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (l.companyName && l.companyName.toLowerCase().includes(q)) ||
        (l.contactName && l.contactName.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)) ||
        (l.phone && l.phone.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [leadsList, leadStatusFilter, leadSearchQuery]);

  const newLeadsCount = useMemo(() => {
    return leadsList.filter((l) => l.status === 'NEW').length;
  }, [leadsList]);

  // Mise à jour du statut d'un prospect
  const handleUpdateLeadStatus = async (leadId: string, newStatus: LeadStatus) => {
    setUpdatingLeadId(leadId);
    try {
      const res = await authFetch('/api/billing/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status: newStatus }),
      });
      if (res.ok) {
        setLeadsList((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
        );
        setFeedback({
          type: 'success',
          message: 'Statut du prospect mis à jour avec succès.',
        });
      } else {
        throw new Error('Erreur lors de la mise à jour du prospect.');
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de mettre à jour le statut.',
      });
    } finally {
      setUpdatingLeadId(null);
    }
  };

  // Filtrage des utilisateurs
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const q = searchQuery.toLowerCase().trim();
      const agentBadge = Array.isArray(u.security_agents)
        ? u.security_agents[0]?.badge_number
        : u.security_agents?.badge_number;

      const matchSearch =
        !q ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (agentBadge && agentBadge.toLowerCase().includes(q));
      return matchRole && matchSearch;
    });
  }, [usersList, userRoleFilter, searchQuery]);

  // Filtrage des interventions avec rapport
  const completedReports = useMemo(() => {
    return interventionsList.filter((i) => i.report || i.status === 'COMPLETED');
  }, [interventionsList]);

  // Filtrage des sites protégés
  const filteredSites = useMemo(() => {
    return sitesList.filter((s) => {
      const matchType = siteTypeFilter === 'ALL' || s.site_type === siteTypeFilter;
      const matchOrg = siteOrgFilter === 'ALL' || s.organization_id === siteOrgFilter;
      const q = siteSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.organizations?.name && s.organizations.name.toLowerCase().includes(q)) ||
        (s.owner?.full_name && s.owner.full_name.toLowerCase().includes(q)) ||
        (s.owner?.email && s.owner.email.toLowerCase().includes(q));
      return matchType && matchOrg && matchSearch;
    });
  }, [sitesList, siteTypeFilter, siteOrgFilter, siteSearchQuery]);

  // Filtrage des agents de sécurité
  const filteredAgents = useMemo(() => {
    return agentsList.filter((a) => {
      const matchDuty = agentDutyFilter === 'ALL' || a.duty_status === agentDutyFilter;
      const matchOrg = agentOrgFilter === 'ALL' || a.organization_id === agentOrgFilter;
      const matchCenter = agentCenterFilter === 'ALL' || a.security_center_id === agentCenterFilter;
      const matchStatus =
        agentStatusFilter === 'ALL' ||
        (agentStatusFilter === 'ACTIVE' && a.is_active) ||
        (agentStatusFilter === 'INACTIVE' && !a.is_active);

      const q = agentSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (a.user?.full_name && a.user.full_name.toLowerCase().includes(q)) ||
        (a.user?.email && a.user.email.toLowerCase().includes(q)) ||
        (a.user?.phone && a.user.phone.toLowerCase().includes(q)) ||
        (a.badge_number && a.badge_number.toLowerCase().includes(q)) ||
        (a.patrol_vehicle && a.patrol_vehicle.toLowerCase().includes(q)) ||
        (a.organization?.name && a.organization.name.toLowerCase().includes(q)) ||
        (a.security_center?.name && a.security_center.name.toLowerCase().includes(q));

      return matchDuty && matchOrg && matchCenter && matchStatus && matchSearch;
    });
  }, [agentsList, agentDutyFilter, agentOrgFilter, agentCenterFilter, agentStatusFilter, agentSearchQuery]);

  // Bascule Actif / Inactif pour un agent de sécurité avec règle anti-coupure de mission en cours
  const handleToggleAgentActive = async (targetAgent: AdminAgentRecord) => {
    if (targetAgent.active_mission && targetAgent.is_active) {
      setFeedback({
        type: 'error',
        message: `Action refusée : L'agent ${targetAgent.badge_number} (${targetAgent.user?.full_name}) a une intervention active en cours. Réaffectez ou clôturez la mission avant de désactiver son compte.`,
      });
      return;
    }

    setTogglingAgentId(targetAgent.id);
    const newActive = !targetAgent.is_active;

    try {
      const res = await authFetch('/api/admin/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetAgent.id,
          is_active: newActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut de l\'agent');
      }

      setAgentsList((prev) =>
        prev.map((a) =>
          a.id === targetAgent.id
            ? { ...a, is_active: newActive, duty_status: newActive ? a.duty_status : 'OFF_DUTY' }
            : a
        )
      );
      setFeedback({
        type: 'success',
        message: `Agent ${targetAgent.badge_number} (${targetAgent.user?.full_name}) ${newActive ? 'activé' : 'désactivé'} avec succès.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de modifier le statut de l\'agent.',
      });
    } finally {
      setTogglingAgentId(null);
    }
  };

  // Filtrage des centres de sécurité (SOC)
  const filteredCenters = useMemo(() => {
    return centersList.filter((c) => {
      const matchOrg = centerOrgFilter === 'ALL' || c.organization_id === centerOrgFilter;
      const matchStatus =
        centerStatusFilter === 'ALL' ||
        (centerStatusFilter === 'ACTIVE' && c.is_active) ||
        (centerStatusFilter === 'INACTIVE' && !c.is_active);

      const q = centerSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.organization?.name && c.organization.name.toLowerCase().includes(q));

      return matchOrg && matchStatus && matchSearch;
    });
  }, [centersList, centerOrgFilter, centerStatusFilter, centerSearchQuery]);

  // Bascule Actif / Inactif pour un centre de sécurité avec protection intervention active
  const handleToggleCenterActive = async (targetCenter: AdminCenterRecord) => {
    if (targetCenter.is_active && (targetCenter.active_interventions_count || 0) > 0) {
      setFeedback({
        type: 'error',
        message: `Action refusée : Le centre "${targetCenter.name}" (${targetCenter.code}) gère actuellement ${targetCenter.active_interventions_count} intervention(s) active(s). Veuillez réaffecter ou clôturer ces missions avant de désactiver le centre.`,
      });
      return;
    }

    setTogglingCenterId(targetCenter.id);
    const newActive = !targetCenter.is_active;

    try {
      const res = await authFetch('/api/admin/centers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetCenter.id,
          is_active: newActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut du centre');
      }

      setCentersList((prev) =>
        prev.map((c) => (c.id === targetCenter.id ? { ...c, is_active: newActive } : c))
      );
      setFeedback({
        type: 'success',
        message: `Centre "${targetCenter.name}" (${targetCenter.code}) ${newActive ? 'activé' : 'désactivé'} avec succès.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de modifier le statut du centre.',
      });
    } finally {
      setTogglingCenterId(null);
    }
  };

  // Suppression d'un centre de sécurité
  const handleConfirmDeleteCenter = async () => {
    if (!centerToDelete) return;
    setIsDeletingCenter(true);
    try {
      const res = await authFetch(`/api/admin/centers?id=${centerToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression du centre');
      }
      setCentersList((prev) => prev.filter((c) => c.id !== centerToDelete.id));
      setFeedback({
        type: 'success',
        message: `Centre de sécurité "${centerToDelete.name}" supprimé avec succès.`,
      });
      setCenterToDelete(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de supprimer le centre de sécurité.',
      });
    } finally {
      setIsDeletingCenter(false);
    }
  };

  // Suppression d'un site protégé
  const handleConfirmDeleteSite = async () => {
    if (!siteToDelete) return;
    setIsDeletingSite(true);
    try {
      const res = await authFetch(`/api/sites?id=${siteToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression du site');
      }
      setSitesList((prev) => prev.filter((s) => s.id !== siteToDelete.id));
      setFeedback({
        type: 'success',
        message: `Site protégé "${siteToDelete.name}" supprimé avec succès.`,
      });
      setSiteToDelete(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de supprimer le site.',
      });
    } finally {
      setIsDeletingSite(false);
    }
  };

  // Suppression d'un compte individuel
  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    setFeedback(null);

    try {
      const res = await authFetch(`/api/admin/users?id=${userToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      setFeedback({
        type: 'success',
        message: `Le compte ${userToDelete.email} a été supprimé définitivement.`,
      });
      setUserToDelete(null);
      await loadUsers();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de supprimer le compte.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Bascule rapide Actif / Inactif
  const handleToggleUserActive = async (targetUser: AdminUserRecord) => {
    if (targetUser.id === currentUser?.id || targetUser.id === authUser?.id) {
      setFeedback({
        type: 'error',
        message: 'Vous ne pouvez pas désactiver votre propre compte administrateur.',
      });
      return;
    }

    setTogglingUserId(targetUser.id);
    const newActive = !targetUser.is_active;

    try {
      const res = await authFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetUser.id,
          is_active: newActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du changement de statut');
      }

      setUsersList((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, is_active: newActive } : u))
      );
      setFeedback({
        type: 'success',
        message: `Compte ${targetUser.email} ${newActive ? 'activé' : 'désactivé'} avec succès.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de modifier le statut du compte.',
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return {
          label: 'SUPER ADMIN',
          classes: 'bg-purple-950 text-purple-300 border-purple-800',
        };
      case 'AGENT':
        return {
          label: 'PATROUILLEUR',
          classes: 'bg-cyan-950 text-cyan-300 border-cyan-800',
        };
      case 'SECURITY_MANAGER':
        return {
          label: 'RÉGULATEUR SOC',
          classes: 'bg-amber-950 text-amber-300 border-amber-800',
        };
      case 'SECRETARY':
        return {
          label: 'SECRÉTARIAT',
          classes: 'bg-sky-950 text-sky-300 border-sky-800',
        };
      case 'USER':
      default:
        return {
          label: 'CLIENT ABONNÉ',
          classes: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        };
    }
  };

  const getSiteTypeBadge = (type: string) => {
    switch (type) {
      case 'RESIDENCE':
        return {
          label: 'Résidence',
          classes: 'bg-emerald-950 text-emerald-300 border-emerald-800',
          icon: Home,
        };
      case 'COMMERCE':
        return {
          label: 'Commerce',
          classes: 'bg-amber-950 text-amber-300 border-amber-800',
          icon: Store,
        };
      case 'ENTREPRISE':
        return {
          label: 'Entreprise',
          classes: 'bg-blue-950 text-blue-300 border-blue-800',
          icon: Briefcase,
        };
      case 'AUTRE':
      default:
        return {
          label: 'Autre',
          classes: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Building,
        };
    }
  };

  const getAgentDutyBadge = (duty: string) => {
    switch (duty) {
      case 'AVAILABLE':
        return {
          label: 'DISPONIBLE',
          subLabel: 'En patrouille / Prêt',
          classes: 'bg-emerald-950 text-emerald-300 border-emerald-800',
          dot: 'bg-emerald-400',
        };
      case 'BUSY':
        return {
          label: 'EN MISSION',
          subLabel: 'Sur site d\'intervention',
          classes: 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse',
          dot: 'bg-amber-400',
        };
      case 'DISPATCHED':
        return {
          label: 'EN ROUTE',
          subLabel: 'Affecté / Transit',
          classes: 'bg-purple-950 text-purple-300 border-purple-800 animate-pulse',
          dot: 'bg-purple-400',
        };
      case 'OFF_DUTY':
      default:
        return {
          label: 'HORS SERVICE',
          subLabel: 'Repos / Fin de service',
          classes: 'bg-slate-800 text-slate-400 border-slate-700',
          dot: 'bg-slate-500',
        };
    }
  };

  const getLeadStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'NEW':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800 animate-pulse">
            NOUVEAU
          </span>
        );
      case 'CONTACTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">
            CONTACTÉ
          </span>
        );
      case 'QUALIFIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            QUALIFIÉ
          </span>
        );
      case 'DEMO':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
            DÉMO PROGRAMMÉE
          </span>
        );
      case 'PROPOSAL':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
            PROPOSITION
          </span>
        );
      case 'WON':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
            GAGNÉ (CLIENT)
          </span>
        );
      case 'LOST':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            PERDU
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  if (isAuthorized === false) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Navigation supérieure */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Accueil</span>
        </Link>
        <span className="text-xs font-mono text-purple-400 font-bold bg-purple-950/80 px-2.5 py-1 rounded-full border border-purple-800">
          CONSOLE SUPER-ADMINISTRATEUR
        </span>
      </div>

      {/* En-tête Admin */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-purple-950/80 border border-purple-800 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-950/50">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Supervision Globale de la Plateforme HOREB SECURE</h1>
            <p className="text-xs text-slate-400">
              Demandes de démonstration, gestion des utilisateurs, rapports de mission et gouvernance opérationnelle
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono text-emerald-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>SYSTÈME INTÈGRE (100% DISPONIBLE)</span>
        </div>
      </div>

      {/* Barre de retour d'information / Alertes */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/80 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation par Onglets */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-bold">
        <button
          onClick={() => setActiveTab('LEADS')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'LEADS'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Demandes de Démo ({leadsList.length})</span>
          {newLeadsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-black animate-pulse">
              {newLeadsCount} NOUVEAU{newLeadsCount > 1 ? 'X' : ''}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('USERS')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'USERS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Comptes Utilisateurs ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('AGENTS')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'AGENTS'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Agents de Sécurité ({agentsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('CENTERS')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'CENTERS'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Centres SOC ({centersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SITES')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'SITES'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Sites Protégés ({sitesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('REPORTS')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'REPORTS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Rapports de Fin de Mission ({completedReports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`py-2 px-4 rounded-xl flex items-center gap-2 transition-all ${
            activeTab === 'OVERVIEW'
              ? 'bg-slate-800 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Vue d'ensemble Système</span>
        </button>

        <Link
          href="/admin/business"
          className="ml-auto py-2 px-3 rounded-xl flex items-center gap-1.5 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800 transition-all font-semibold"
        >
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <span>Pipeline Commercial</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-70" />
        </Link>

        <Link
          href="/admin/organizations"
          className="py-2 px-3 rounded-xl flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 transition-all font-semibold"
        >
          <Building className="w-4 h-4 text-blue-400" />
          <span>Entreprises (Tenants)</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-70" />
        </Link>
      </div>

      {/* ==================================================================== */}
      {/* ONGLET 0 : DEMANDES DE DÉMONSTRATION & PROSPECTS (LEADS)             */}
      {/* ==================================================================== */}
      {activeTab === 'LEADS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barre d'action supérieure */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filtres & Recherche */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher une entreprise, un responsable, email ou téléphone..."
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Sélecteur de statut */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold overflow-x-auto">
                {['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'DEMO', 'WON', 'LOST'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setLeadStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      leadStatusFilter === s
                        ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 'ALL'
                      ? 'Tous'
                      : s === 'NEW'
                      ? 'Nouveaux'
                      : s === 'CONTACTED'
                      ? 'Contactés'
                      : s === 'QUALIFIED'
                      ? 'Qualifiés'
                      : s === 'DEMO'
                      ? 'En Démo'
                      : s === 'WON'
                      ? 'Gagnés'
                      : 'Perdus'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadLeads}
                disabled={isLoadingLeads}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title="Actualiser les demandes"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingLeads ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              <Link
                href="/admin/business"
                className="py-2 px-3.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-colors"
              >
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ouvrir Pipeline & KPI MRR</span>
              </Link>
            </div>
          </div>

          {/* Liste des demandes */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
            {isLoadingLeads ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Chargement des demandes de démonstration...</p>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Mail className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-white">Aucune demande de démonstration dans cette vue</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {leadSearchQuery || leadStatusFilter !== 'ALL'
                    ? 'Aucun résultat ne correspond aux filtres appliqués.'
                    : 'Les demandes soumises depuis la page d\'accueil, la page /demo ou les tarifs apparaîtront directement ici.'}
                </p>
                <Link
                  href="/demo"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline mt-2 font-medium"
                >
                  <span>Tester le formulaire public de démo</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 uppercase text-[11px] font-bold">
                      <th className="py-3.5 pl-6">Entreprise & Responsable</th>
                      <th className="py-3.5 px-4">Coordonnées directes</th>
                      <th className="py-3.5 px-4">Flotte estimée</th>
                      <th className="py-3.5 px-4">Formule choisie</th>
                      <th className="py-3.5 px-4">Date de réception</th>
                      <th className="py-3.5 px-4">Statut</th>
                      <th className="py-3.5 pr-6 text-right">Mise à jour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                              <Building className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-extrabold text-white text-sm flex items-center gap-2">
                                <span>{lead.companyName}</span>
                                {lead.status === 'NEW' && (
                                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Users className="w-3 h-3 text-slate-500" />
                                <span>{lead.contactName}</span>
                                {lead.jobTitle && <span className="text-slate-500">({lead.jobTitle})</span>}
                              </div>
                              {lead.message && (
                                <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-2 max-w-sm">
                                  &ldquo;{lead.message}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            <a
                              href={`tel:${lead.phone}`}
                              className="flex items-center gap-1.5 text-slate-200 hover:text-cyan-400 font-mono transition-colors"
                            >
                              <Phone className="w-3 h-3 text-emerald-400" />
                              <span>{lead.phone}</span>
                            </a>
                            <a
                              href={`mailto:${lead.email}`}
                              className="flex items-center gap-1.5 text-slate-400 hover:text-cyan-400 transition-colors"
                            >
                              <Mail className="w-3 h-3 text-cyan-400" />
                              <span>{lead.email}</span>
                            </a>
                            {lead.city && (
                              <div className="text-[10px] text-slate-500">
                                {lead.city}{lead.country ? `, ${lead.country}` : ''}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300">
                          <div className="font-semibold text-white">
                            {lead.agentsCount} agents
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {lead.sitesCount} sites • {lead.clientsCount} clients
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-950 text-cyan-300 border border-slate-800 inline-block">
                            {lead.requestedPlan || 'BUSINESS_OS'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-400">
                          <div className="flex items-center gap-1 text-[11px] text-slate-300">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>
                              {new Date(lead.createdAt).toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(lead.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {getLeadStatusBadge(lead.status)}
                        </td>
                        <td className="py-4 pr-6 text-right">
                          <select
                            disabled={updatingLeadId === lead.id}
                            value={lead.status}
                            onChange={(e) =>
                              handleUpdateLeadStatus(lead.id, e.target.value as LeadStatus)
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                          >
                            <option value="NEW">NOUVEAU</option>
                            <option value="CONTACTED">CONTACTÉ</option>
                            <option value="QUALIFIED">QUALIFIÉ</option>
                            <option value="DEMO">DÉMO PROGRAMMÉE</option>
                            <option value="PROPOSAL">PROPOSITION ENVOYÉE</option>
                            <option value="WON">GAGNÉ</option>
                            <option value="LOST">PERDU</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET 1 : GESTION DES COMPTES UTILISATEURS (VOIR & SUPPRIMER)         */}
      {/* ==================================================================== */}
      {activeTab === 'USERS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barre d'action supérieure */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Recherche & Filtres */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, téléphone ou matricule..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Sélecteur de Rôle */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                {['ALL', 'USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setUserRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      userRoleFilter === r
                        ? 'bg-purple-950 text-purple-300 font-bold border border-purple-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r === 'ALL'
                      ? 'Tous'
                      : r === 'USER'
                      ? 'Clients'
                      : r === 'AGENT'
                      ? 'Agents'
                      : r === 'SECURITY_MANAGER'
                      ? 'Régulateurs'
                      : 'Admins'}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions : Nouveau compte et Rafraîchir */}
            <div className="flex items-center gap-2">
              <button
                onClick={loadUsers}
                disabled={isLoadingUsers}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title="Actualiser la liste"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin text-purple-400' : ''}`} />
              </button>

              <button
                onClick={() => setIsCreateUserModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-950 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Nouveau Compte</span>
              </button>
            </div>
          </div>

          {/* Table / Liste des Utilisateurs */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
            {isLoadingUsers ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Chargement des comptes utilisateurs...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Users className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                <p className="text-sm font-bold text-white">Aucun compte utilisateur trouvé</p>
                <p className="text-xs text-slate-500">
                  Aucun résultat ne correspond à votre filtre de recherche.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Utilisateur</th>
                      <th className="py-3 px-4">Rôle Plateforme</th>
                      <th className="py-3 px-4">Entreprise (Tenant)</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Patrouille / Agent</th>
                      <th className="py-3 px-4">Statut</th>
                      <th className="py-3 px-4">Date Inscription</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredUsers.map((u) => {
                      const isCurrentAdmin = u.id === currentUser?.id || u.email === 'ahossancedric22@gmail.com';
                      const badge = getRoleBadge(u.role);
                      const agentData = Array.isArray(u.security_agents) ? u.security_agents[0] : u.security_agents;
                      const isAct = u.is_active !== false;

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                          {/* Identité */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
                                {u.full_name ? u.full_name.substring(0, 2).toUpperCase() : 'US'}
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{u.full_name || 'Sans nom'}</span>
                                  {isCurrentAdmin && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                                      VOUS
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400 font-mono block">{u.email}</span>
                              </div>
                            </div>
                          </td>

                          {/* Rôle */}
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.classes}`}>
                              {badge.label}
                            </span>
                          </td>

                          {/* Entreprise */}
                          <td className="py-3.5 px-4">
                            {u.organizations?.name ? (
                              <div className="flex items-center gap-1.5 text-slate-200">
                                <Building className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="font-semibold text-xs truncate max-w-[150px]">
                                  {u.organizations.name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px] font-mono">Plateforme SaaS</span>
                            )}
                          </td>

                          {/* Contact */}
                          <td className="py-3.5 px-4">
                            {u.phone ? (
                              <span className="font-mono text-slate-300">{u.phone}</span>
                            ) : (
                              <span className="text-slate-500 italic">Non renseigné</span>
                            )}
                          </td>

                          {/* Agent / Patrouille */}
                          <td className="py-3.5 px-4">
                            {u.role === 'AGENT' && agentData ? (
                              <div className="space-y-0.5">
                                <span className="font-mono font-bold text-cyan-300 block">
                                  {agentData.badge_number}
                                </span>
                                <span className="text-[11px] text-slate-400 block truncate max-w-[130px]">
                                  {agentData.patrol_vehicle || 'Véhicule patrouille'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>

                          {/* Statut Actif / Inactif */}
                          <td className="py-3.5 px-4">
                            {isAct ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>ACTIF</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                <span>DÉSACTIVÉ</span>
                              </span>
                            )}
                          </td>

                          {/* Date d'inscription */}
                          <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                            {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy à HH:mm') : '—'}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Bascule Actif / Inactif */}
                              <button
                                onClick={() => handleToggleUserActive(u)}
                                disabled={isCurrentAdmin || togglingUserId === u.id}
                                className={`p-1.5 rounded-xl border text-xs font-bold transition-colors ${
                                  isCurrentAdmin
                                    ? 'opacity-40 cursor-not-allowed border-slate-800 text-slate-600'
                                    : isAct
                                    ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-900/60'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-900/60'
                                }`}
                                title={
                                  isCurrentAdmin
                                    ? 'Votre propre compte ne peut être désactivé'
                                    : isAct
                                    ? 'Désactiver ce compte'
                                    : 'Activer ce compte'
                                }
                              >
                                <Power className={`w-3.5 h-3.5 ${togglingUserId === u.id ? 'animate-spin' : ''}`} />
                              </button>

                              {/* Modifier */}
                              <button
                                onClick={() => setUserToEdit(u)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                title="Modifier ce compte"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                              </button>

                              {/* Supprimer */}
                              {isCurrentAdmin ? (
                                <span className="text-[11px] text-slate-500 font-medium italic px-1">Protégé</span>
                              ) : (
                                <button
                                  onClick={() => setUserToDelete(u)}
                                  className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition-colors"
                                  title="Supprimer ce compte définitivement"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET AGENTS : GESTION DE LA FLOTTE D'AGENTS DE SÉCURITÉ            */}
      {/* ==================================================================== */}
      {activeTab === 'AGENTS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barre d'action supérieure */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Recherche & Filtres */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, téléphone, matricule, véhicule..."
                  value={agentSearchQuery}
                  onChange={(e) => setAgentSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Filtre Statut Opérationnel */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                {[
                  { code: 'ALL', label: 'Tous' },
                  { code: 'AVAILABLE', label: 'Disponibles' },
                  { code: 'BUSY', label: 'En Mission' },
                  { code: 'DISPATCHED', label: 'En Route' },
                  { code: 'OFF_DUTY', label: 'Hors Service' },
                ].map((st) => (
                  <button
                    key={st.code}
                    onClick={() => setAgentDutyFilter(st.code)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      agentDutyFilter === st.code
                        ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Filtre Centre SOC / Base */}
              {securityCentersList.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                  <Radio className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={agentCenterFilter}
                    onChange={(e) => setAgentCenterFilter(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-slate-900 text-white">
                      Toutes bases SOC
                    </option>
                    {securityCentersList.map((sc) => (
                      <option key={sc.id} value={sc.id} className="bg-slate-900 text-white">
                        {sc.name} ({sc.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre Organisation (Tenant) */}
              {organizationsList.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                  <Building className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={agentOrgFilter}
                    onChange={(e) => setAgentOrgFilter(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-slate-900 text-white">
                      Toutes entreprises
                    </option>
                    {organizationsList.map((org) => (
                      <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                        {org.name || org.commercial_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre Compte Actif/Inactif */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setAgentStatusFilter('ALL')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                    agentStatusFilter === 'ALL'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tous
                </button>
                <button
                  onClick={() => setAgentStatusFilter('ACTIVE')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                    agentStatusFilter === 'ACTIVE'
                      ? 'bg-emerald-950 text-emerald-300 font-bold border border-emerald-800'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Actifs
                </button>
                <button
                  onClick={() => setAgentStatusFilter('INACTIVE')}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                    agentStatusFilter === 'INACTIVE'
                      ? 'bg-rose-950 text-rose-300 font-bold border border-rose-800'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Désactivés
                </button>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="flex items-center gap-2">
              <button
                onClick={loadAgents}
                disabled={isLoadingAgents}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Actualiser la liste des agents de sécurité"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAgents ? 'animate-spin text-cyan-400' : ''}`} />
                <span>Actualiser</span>
              </button>

              <button
                onClick={() => setIsCreateUserModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-950 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Nouvel Agent</span>
              </button>
            </div>
          </div>

          {/* Tableau des Agents */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {isLoadingAgents ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-medium">Chargement des agents de sécurité...</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                  <Car className="w-6 h-6 text-slate-500" />
                </div>
                <h4 className="text-sm font-bold text-white">Aucun agent de sécurité trouvé</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {agentSearchQuery || agentDutyFilter !== 'ALL' || agentOrgFilter !== 'ALL' || agentCenterFilter !== 'ALL' || agentStatusFilter !== 'ALL'
                    ? 'Aucun agent ne correspond aux filtres appliqués.'
                    : 'Aucun agent de sécurité n\'est encore enregistré dans la base de données.'}
                </p>
                {(agentSearchQuery || agentDutyFilter !== 'ALL' || agentOrgFilter !== 'ALL' || agentCenterFilter !== 'ALL' || agentStatusFilter !== 'ALL') ? (
                  <button
                    onClick={() => {
                      setAgentSearchQuery('');
                      setAgentDutyFilter('ALL');
                      setAgentOrgFilter('ALL');
                      setAgentCenterFilter('ALL');
                      setAgentStatusFilter('ALL');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold"
                  >
                    Réinitialiser les filtres
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCreateUserModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-950 inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Créer le premier agent</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Agent & Contact</th>
                      <th className="py-3 px-4">Matricule & Véhicule</th>
                      <th className="py-3 px-4">Organisation (Tenant)</th>
                      <th className="py-3 px-4">Base SOC / Centre</th>
                      <th className="py-3 px-4">Statut Opérationnel</th>
                      <th className="py-3 px-4">Mission Active</th>
                      <th className="py-3 px-4">Compte</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAgents.map((ag) => {
                      const dutyBadge = getAgentDutyBadge(ag.duty_status);
                      const hasActiveMission = Boolean(ag.active_mission);
                      const isAct = ag.is_active;

                      return (
                        <tr key={ag.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Agent & Contact */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                                {ag.user?.full_name?.substring(0, 2).toUpperCase() || 'AG'}
                              </div>
                              <div>
                                <div className="font-bold text-white">
                                  {ag.user?.full_name || 'Agent sans nom'}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {ag.user?.email || 'Sans email'}
                                </div>
                                {ag.user?.phone && (
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                    <Phone className="w-2.5 h-2.5" />
                                    <span>{ag.user.phone}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Matricule & Véhicule */}
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-cyan-300 font-bold text-xs bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/80 inline-block">
                              {ag.badge_number}
                            </span>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                              <Car className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{ag.patrol_vehicle || 'À pied / Non assigné'}</span>
                            </div>
                          </td>

                          {/* Organisation */}
                          <td className="py-3.5 px-4 text-slate-300">
                            <div className="flex items-center gap-1.5 font-medium text-white">
                              <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>{ag.organization?.name || 'Entreprise Master'}</span>
                            </div>
                            {ag.organization?.commercial_name && (
                              <div className="text-[11px] text-slate-400 mt-0.5 pl-5">
                                {ag.organization.commercial_name}
                              </div>
                            )}
                          </td>

                          {/* Base SOC / Centre */}
                          <td className="py-3.5 px-4">
                            {ag.security_center ? (
                              <div>
                                <div className="font-medium text-white flex items-center gap-1">
                                  <Radio className="w-3 h-3 text-purple-400 shrink-0" />
                                  <span>{ag.security_center.name}</span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 pl-4">
                                  Code : {ag.security_center.code}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Non affecté</span>
                            )}
                          </td>

                          {/* Statut Opérationnel */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${dutyBadge.classes}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dutyBadge.dot}`} />
                              <span>{dutyBadge.label}</span>
                            </span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {dutyBadge.subLabel}
                            </div>
                          </td>

                          {/* Mission Active */}
                          <td className="py-3.5 px-4">
                            {hasActiveMission ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                                  <Radio className="w-3 h-3" />
                                  <span>Intervention en cours</span>
                                </span>
                                {ag.active_mission?.alerts?.alert_number && (
                                  <Link
                                    href={`/dispatch/alerts/${ag.active_mission?.alert_id}`}
                                    className="text-[10px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
                                    title="Ouvrir le dossier d'intervention"
                                  >
                                    <span>#{ag.active_mission?.alerts?.alert_number}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </Link>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Aucune mission active</span>
                            )}
                          </td>

                          {/* Statut Compte */}
                          <td className="py-3.5 px-4">
                            {isAct ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>ACTIF</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                <span>DÉSACTIVÉ</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Bascule Actif / Inactif */}
                              <button
                                onClick={() => handleToggleAgentActive(ag)}
                                disabled={togglingAgentId === ag.id}
                                className={`p-1.5 rounded-xl border text-xs font-bold transition-colors ${
                                  hasActiveMission && isAct
                                    ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed'
                                    : isAct
                                    ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-900/60'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-900/60'
                                }`}
                                title={
                                  hasActiveMission && isAct
                                    ? 'Action bloquée : Mission opérationnelle en cours'
                                    : isAct
                                    ? 'Désactiver cet agent'
                                    : 'Activer cet agent'
                                }
                              >
                                <Power className={`w-3.5 h-3.5 ${togglingAgentId === ag.id ? 'animate-spin' : ''}`} />
                              </button>

                              {/* Modifier */}
                              <button
                                onClick={() => setAgentToEdit(ag)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                title="Modifier la fiche et les affectations de cet agent"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET CENTRES DE SÉCURITÉ : GESTION DES CENTRES SOC                 */}
      {/* ==================================================================== */}
      {activeTab === 'CENTERS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Cartes métriques récapitulatives */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Centres Enregistrés</p>
                <p className="text-lg font-black text-white">{centersList.length}</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Postes Opérationnels</p>
                <p className="text-lg font-black text-emerald-400">
                  {centersList.filter((c) => c.is_active).length}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Missions SOC en cours</p>
                <p className="text-lg font-black text-rose-400">
                  {centersList.reduce((acc, c) => acc + (c.active_interventions_count || 0), 0)}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Patrouilleurs Affectés</p>
                <p className="text-lg font-black text-cyan-400">
                  {centersList.reduce((acc, c) => acc + (c.agents_count || 0), 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Barre d'action supérieure */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Recherche & Filtres */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, code (ex: CTR-...), ville, adresse ou contact..."
                  value={centerSearchQuery}
                  onChange={(e) => setCenterSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Filtre Organisation (si multi-organisations) */}
              {organizationsList.length > 1 && (
                <div className="min-w-[160px]">
                  <select
                    value={centerOrgFilter}
                    onChange={(e) => setCenterOrgFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Toutes organisations</option>
                    {organizationsList.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtre Statut Compte */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                {[
                  { code: 'ALL', label: 'Tous' },
                  { code: 'ACTIVE', label: 'Actifs' },
                  { code: 'INACTIVE', label: 'Inactifs' },
                ].map((s) => (
                  <button
                    key={s.code}
                    onClick={() => setCenterStatusFilter(s.code)}
                    className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      centerStatusFilter === s.code
                        ? 'bg-amber-950 text-amber-300 font-bold border border-amber-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={loadCenters}
                disabled={isLoadingCenters}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title="Actualiser les centres"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingCenters ? 'animate-spin text-amber-400' : ''}`} />
              </button>

              <button
                onClick={() => setIsCreateCenterModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-950 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau Centre</span>
              </button>
            </div>
          </div>

          {/* Tableau des centres de sécurité */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
            {isLoadingCenters ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Chargement des centres de sécurité...</p>
              </div>
            ) : filteredCenters.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Building className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-white">Aucun centre de sécurité correspondant</p>
                <p className="text-xs text-slate-400">
                  Modifiez vos critères de recherche ou enregistrez un nouveau centre pour cette organisation.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 font-bold">Centre & Code</th>
                      <th className="py-3 px-4 font-bold">Organisation</th>
                      <th className="py-3 px-4 font-bold">Contact Direct</th>
                      <th className="py-3 px-4 font-bold">Localisation</th>
                      <th className="py-3 px-4 font-bold">Patrouilleurs</th>
                      <th className="py-3 px-4 font-bold">Missions en cours</th>
                      <th className="py-3 px-4 font-bold">Statut</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {filteredCenters.map((c) => {
                      const hasActive = (c.active_interventions_count || 0) > 0;
                      const agentsCount = c.agents_count || 0;

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Centre & Code */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                                <Building className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-bold text-white text-xs flex items-center gap-1.5">
                                  <span>{c.name}</span>
                                </div>
                                <span className="text-[10px] font-mono text-amber-400 font-semibold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                  {c.code}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Organisation */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-200">
                              {c.organization?.name || 'Entreprise'}
                            </span>
                            {c.organization?.commercial_name && (
                              <p className="text-[10px] text-slate-500">{c.organization.commercial_name}</p>
                            )}
                          </td>

                          {/* Contact Direct */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              {c.phone ? (
                                <div className="flex items-center gap-1 text-[11px] text-slate-300 font-mono">
                                  <Phone className="w-3 h-3 text-cyan-400 shrink-0" />
                                  <span>{c.phone}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[10px] italic">Non renseigné</span>
                              )}
                              {c.email && (
                                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                  <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                                  <span className="truncate max-w-[140px]" title={c.email}>{c.email}</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Localisation */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-200 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>{c.city || 'Abidjan'}</span>
                                {c.postal_code && (
                                  <span className="text-[10px] text-slate-500">({c.postal_code})</span>
                                )}
                              </div>
                              {c.address && (
                                <p className="text-[10px] text-slate-400 truncate max-w-[160px]" title={c.address}>
                                  {c.address}
                                </p>
                              )}
                              {c.latitude && c.longitude && (
                                <p className="text-[9px] font-mono text-slate-500">
                                  GPS: {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Patrouilleurs rattachés */}
                          <td className="py-3.5 px-4">
                            {agentsCount > 0 ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                                  <Users className="w-3 h-3" />
                                  <span>{agentsCount} agent{agentsCount > 1 ? 's' : ''}</span>
                                </span>
                                {c.agents && c.agents.length > 0 && (
                                  <div className="flex flex-wrap gap-1 max-w-[160px]">
                                    {c.agents.slice(0, 3).map((ag) => (
                                      <span
                                        key={ag.id}
                                        className="text-[9px] font-mono px-1 py-0.2 bg-slate-950 rounded text-slate-400 border border-slate-800"
                                        title={`${ag.badge_number} - ${ag.user?.full_name || 'Agent'}`}
                                      >
                                        {ag.badge_number}
                                      </span>
                                    ))}
                                    {c.agents.length > 3 && (
                                      <span className="text-[9px] text-slate-500">+{c.agents.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Aucun agent</span>
                            )}
                          </td>

                          {/* Missions Actives */}
                          <td className="py-3.5 px-4">
                            {hasActive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                                <Radio className="w-3 h-3" />
                                <span>{c.active_interventions_count} en cours</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Aucune</span>
                            )}
                          </td>

                          {/* Statut Opérationnel */}
                          <td className="py-3.5 px-4">
                            {c.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                <CheckCircle className="w-3 h-3" />
                                <span>Actif</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                <span>Inactif</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Bouton Activer / Désactiver */}
                              <button
                                onClick={() => handleToggleCenterActive(c)}
                                disabled={togglingCenterId === c.id}
                                className={`p-1.5 rounded-xl border transition-colors ${
                                  c.is_active
                                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-400 hover:bg-rose-950/50 hover:border-rose-800 hover:text-rose-400'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-emerald-950/50 hover:border-emerald-800 hover:text-emerald-400'
                                }`}
                                title={c.is_active ? 'Désactiver ce centre' : 'Activer ce centre'}
                              >
                                <Power className={`w-3.5 h-3.5 ${togglingCenterId === c.id ? 'animate-spin' : ''}`} />
                              </button>

                              {/* Bouton Modifier */}
                              <button
                                onClick={() => setCenterToEdit(c)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                title="Modifier ce centre de sécurité"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                              </button>

                              {/* Bouton Supprimer */}
                              <button
                                onClick={() => setCenterToDelete(c)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800 transition-colors"
                                title="Supprimer ce centre (si aucun agent ni intervention rattaché)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET SITES : GESTION DES SITES PROTÉGÉS                            */}
      {/* ==================================================================== */}
      {activeTab === 'SITES' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barre d'action supérieure */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Recherche & Filtres */}
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, adresse, ville, client ou organisation..."
                  value={siteSearchQuery}
                  onChange={(e) => setSiteSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Filtre par Type de Site */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
                {[
                  { code: 'ALL', label: 'Tous' },
                  { code: 'RESIDENCE', label: 'Résidences' },
                  { code: 'COMMERCE', label: 'Commerces' },
                  { code: 'ENTREPRISE', label: 'Entreprises' },
                  { code: 'AUTRE', label: 'Autres' },
                ].map((t) => (
                  <button
                    key={t.code}
                    onClick={() => setSiteTypeFilter(t.code)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      siteTypeFilter === t.code
                        ? 'bg-blue-950 text-blue-300 font-bold border border-blue-800'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Filtre par Organisation (Tenant) */}
              {organizationsList.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                  <Building className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={siteOrgFilter}
                    onChange={(e) => setSiteOrgFilter(e.target.value)}
                    className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL" className="bg-slate-900 text-white">
                      Toutes entreprises
                    </option>
                    {organizationsList.map((org) => (
                      <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                        {org.name || org.commercial_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Boutons d'action */}
            <div className="flex items-center gap-2">
              <button
                onClick={loadSites}
                disabled={isLoadingSites}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Actualiser la liste des sites protégés"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSites ? 'animate-spin text-blue-400' : ''}`} />
                <span>Actualiser</span>
              </button>

              <button
                onClick={() => setIsCreateSiteModalOpen(true)}
                className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-950 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau Site</span>
              </button>
            </div>
          </div>

          {/* Liste des Sites */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            {isLoadingSites ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-medium">Chargement des sites protégés...</p>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto">
                  <MapPin className="w-6 h-6 text-slate-500" />
                </div>
                <h4 className="text-sm font-bold text-white">Aucun site protégé trouvé</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {siteSearchQuery || siteTypeFilter !== 'ALL' || siteOrgFilter !== 'ALL'
                    ? 'Aucun site ne correspond aux critères de filtre sélectionnés.'
                    : 'Aucun site protégé n\'est encore enregistré dans la base de données.'}
                </p>
                {(siteSearchQuery || siteTypeFilter !== 'ALL' || siteOrgFilter !== 'ALL') ? (
                  <button
                    onClick={() => {
                      setSiteSearchQuery('');
                      setSiteTypeFilter('ALL');
                      setSiteOrgFilter('ALL');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-semibold"
                  >
                    Réinitialiser les filtres
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCreateSiteModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-950 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Créer le premier site</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Site & Typologie</th>
                      <th className="py-3 px-4">Organisation (Tenant)</th>
                      <th className="py-3 px-4">Propriétaire / Client</th>
                      <th className="py-3 px-4">Adresse & Géolocalisation</th>
                      <th className="py-3 px-4">Consignes & Accès</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredSites.map((site) => {
                      const typeBadge = getSiteTypeBadge(site.site_type);
                      const IconComp = typeBadge.icon;
                      const hasGps = typeof site.latitude === 'number' && typeof site.longitude === 'number';

                      return (
                        <tr key={site.id} className="hover:bg-slate-800/40 transition-colors">
                          {/* Nom & Type */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center shrink-0">
                                <IconComp className="w-4 h-4 text-blue-400" />
                              </div>
                              <div>
                                <div className="font-bold text-white flex items-center gap-1.5">
                                  <span>{site.name}</span>
                                  {site.is_default && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      Principal
                                    </span>
                                  )}
                                </div>
                                <span className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-semibold border ${typeBadge.classes}`}>
                                  {typeBadge.label}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Organisation */}
                          <td className="py-3.5 px-4 text-slate-300">
                            <div className="flex items-center gap-1.5 font-medium text-white">
                              <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>{site.organizations?.name || 'Entreprise Master'}</span>
                            </div>
                            {site.organizations?.commercial_name && (
                              <div className="text-[11px] text-slate-400 mt-0.5 pl-5">
                                {site.organizations.commercial_name}
                              </div>
                            )}
                          </td>

                          {/* Propriétaire / Client */}
                          <td className="py-3.5 px-4">
                            {site.owner ? (
                              <div>
                                <div className="font-medium text-white">{site.owner.full_name}</div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {site.owner.phone || site.owner.email}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">Non assigné</span>
                            )}
                          </td>

                          {/* Adresse & GPS */}
                          <td className="py-3.5 px-4">
                            <div className="text-slate-200 font-medium">
                              {site.address || 'Adresse non renseignée'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {site.city || 'Abidjan'}
                            </div>
                            {hasGps ? (
                              <a
                                href={`https://www.google.com/maps?q=${site.latitude},${site.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors"
                                title="Ouvrir dans Google Maps"
                              >
                                <Navigation className="w-3 h-3 shrink-0" />
                                <span>{site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono mt-1 block">GPS non défini</span>
                            )}
                          </td>

                          {/* Consignes d'accès & Digicode */}
                          <td className="py-3.5 px-4">
                            {site.access_instructions ? (
                              <div className="max-w-[200px]">
                                <div className="inline-flex items-center gap-1 text-[11px] font-mono bg-amber-950/40 text-amber-300 border border-amber-900/40 px-2 py-0.5 rounded-lg">
                                  <Key className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span className="truncate" title={site.access_instructions}>
                                    {site.access_instructions}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px] italic">Aucune consigne</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Modifier */}
                              <button
                                onClick={() => setSiteToEdit(site)}
                                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                title="Modifier ce site protégé"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                              </button>

                              {/* Supprimer */}
                              <button
                                onClick={() => setSiteToDelete(site)}
                                className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition-colors"
                                title="Supprimer ce site protégé"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET 2 : RAPPORTS DE FIN DE MISSION DES AGENTS                     */}
      {/* ==================================================================== */}
      {activeTab === 'REPORTS' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Rapports de Fin de Mission Transmis par les Patrouilleurs</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Chaque rapport de mission clôturé par un agent patrouilleur est tracé et consultable ici
              </p>
            </div>

            <button
              onClick={loadReports}
              disabled={isLoadingReports}
              className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>

          {isLoadingReports ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Chargement des comptes-rendus de mission...</p>
            </div>
          ) : completedReports.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-slate-400 space-y-2">
              <ShieldCheck className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
              <p className="text-sm font-bold text-white">Aucun rapport de mission clôturé</p>
              <p className="text-xs text-slate-500">
                Les comptes-rendus rédigés par les patrouilleurs lors de la fin d'intervention s'afficheront ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedReports.map((item) => {
                const alertNum = item.alerts?.alert_number || 'SEC-2026';
                const clientName = item.alerts?.users?.full_name || 'Client Abonné';
                const siteName = item.alerts?.protected_sites?.name || 'Site Protégé';
                const agentBadge = item.security_agents?.badge_number || 'AGT-SEC';
                const vehicle = item.security_agents?.patrol_vehicle || 'Patrouille Alpha';

                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5 hover:border-emerald-700/60 transition-all"
                  >
                    {/* En-tête Rapport */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-white">{alertNum}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          CLÔTURÉ
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {item.resolved_at
                            ? format(new Date(item.resolved_at), 'dd/MM/yyyy à HH:mm')
                            : format(new Date(item.created_at), 'dd/MM/yyyy')}
                        </span>
                      </div>
                    </div>

                    {/* Données de mission */}
                    <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Client & Site</span>
                        <span className="font-bold text-white block">{clientName}</span>
                        <span className="text-[11px] text-slate-400 line-clamp-1">{siteName}</span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Agent Patrouilleur</span>
                        <span className="font-mono font-bold text-cyan-300 block">{agentBadge}</span>
                        <span className="text-[11px] text-slate-400 line-clamp-1">{vehicle}</span>
                      </div>
                    </div>

                    {/* Compte-rendu textuel */}
                    <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-900/50 space-y-1">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                        Compte-Rendu d'Intervention :
                      </span>
                      <p className="text-xs text-slate-200 leading-relaxed italic whitespace-pre-wrap">
                        "{item.report || 'Zone inspectée et sécurisée par le patrouilleur.'}"
                      </p>
                    </div>

                    {/* Lien dossier */}
                    {item.alert_id && (
                      <div className="pt-1 flex justify-end">
                        <Link
                          href={`/dispatch/alerts/${item.alert_id}`}
                          className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors border border-slate-700"
                        >
                          <span>Voir le dossier d'incident</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* ONGLET 3 : VUE D'ENSEMBLE SYSTÈME & INFRASTRUCTURE                  */}
      {/* ==================================================================== */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Cartes Métriques Système */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Total Comptes Créés</span>
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-2xl font-black text-white">{usersList.length}</span>
              <span className="text-[11px] text-slate-400 block mt-1">Enregistrés en base centrale</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Patrouilles Agents</span>
                <Car className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-2xl font-black text-white">{agents.length}</span>
              <span className="text-[11px] text-emerald-400 block mt-1">Actives et opérationnelles</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Sites Protégés</span>
                <Building className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-2xl font-black text-white">{sites.length}</span>
              <span className="text-[11px] text-slate-400 block mt-1">Enregistrés en base</span>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Rapports Clôturés</span>
                <FileText className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-2xl font-black text-white">{completedReports.length}</span>
              <span className="text-[11px] text-slate-400 block mt-1">{alertEvents.length} événements tracés</span>
            </div>
          </div>

          {/* Organisation Partenaire & Base de Données */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Détails Organisation */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4 text-purple-400" />
                <span>Centre Partenaire Référent</span>
              </h3>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Nom :</span>
                  <span className="font-bold text-white">{organization.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Code Partenaire :</span>
                  <span className="font-mono text-purple-300">{organization.code}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Ligne Régulation :</span>
                  <span className="font-mono text-slate-200">{organization.phone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Adresse Siège :</span>
                  <span className="text-slate-200">{organization.address}, {organization.city}</span>
                </div>
              </div>
            </div>

            {/* Intégrité Backend & Realtime */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Infrastructure Cloud & Base PostgreSQL</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-300">Supabase Realtime WebSockets :</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Connecté</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-300">Sécurité RLS (Row Level Security) :</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Active & Isolée</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-300">Journal d'Audit Immuable :</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Triggers SQL Actifs</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALE 1 : CONFIRMATION DE SUPPRESSION INDIVIDUELLE                  */}
      {/* ==================================================================== */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-3xl shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-950/80 border border-rose-800">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Supprimer ce compte ?</h3>
                <p className="text-xs text-rose-300 font-mono">Action irréversible</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Nom :</span>
                <span className="font-bold text-white">{userToDelete.full_name || 'Sans nom'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email :</span>
                <span className="font-mono text-purple-300">{userToDelete.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rôle :</span>
                <span className="font-bold text-white">{userToDelete.role}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Toutes les données associées (alertes, interventions, patrouilles, sites) seront nettoyées en cascade.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Suppression...' : 'Confirmer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALE 2 : CRÉATION D'UN NOUVEAU COMPTE UTILISATEUR                  */}
      {/* ==================================================================== */}
      <CreateUserModal
        isOpen={isCreateUserModalOpen}
        onClose={() => setIsCreateUserModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadUsers();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
        defaultOrganizationId={currentUser?.organization_id || authUser?.organization_id}
      />

      {/* ==================================================================== */}
      {/* MODALE 3 : MODIFICATION D'UN COMPTE UTILISATEUR EXISTANT             */}
      {/* ==================================================================== */}
      <EditUserModal
        isOpen={!!userToEdit}
        user={userToEdit}
        onClose={() => setUserToEdit(null)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadUsers();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
        isSelf={userToEdit?.id === currentUser?.id || userToEdit?.id === authUser?.id}
      />

      {/* ==================================================================== */}
      {/* MODALE : CONFIRMATION DE SUPPRESSION SITE PROTÉGÉ                    */}
      {/* ==================================================================== */}
      {siteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-rose-800/80 rounded-3xl shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-950/80 border border-rose-800">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Supprimer ce site protégé ?</h3>
                <p className="text-xs text-rose-300 font-mono">Action irréversible</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Nom du site :</span>
                <span className="font-bold text-white">{siteToDelete.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Typologie :</span>
                <span className="font-bold text-blue-300">{siteToDelete.site_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Adresse :</span>
                <span className="text-slate-300">{siteToDelete.address || 'Non renseignée'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Organisation :</span>
                <span className="font-medium text-white">{siteToDelete.organizations?.name || 'Entreprise'}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Le site sera retiré du cadastre de surveillance. Les alertes passées rattachées à ce site seront conservées mais déliées.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSiteToDelete(null)}
                disabled={isDeletingSite}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSite}
                disabled={isDeletingSite}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingSite ? 'Suppression...' : 'Confirmer'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALE 4 : CRÉATION D'UN NOUVEAU SITE PROTÉGÉ                        */}
      {/* ==================================================================== */}
      <CreateSiteModal
        isOpen={isCreateSiteModalOpen}
        onClose={() => setIsCreateSiteModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadSites();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
        defaultOrganizationId={currentUser?.organization_id || authUser?.organization_id}
        users={usersList.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }))}
      />

      {/* ==================================================================== */}
      {/* MODALE 5 : MODIFICATION D'UN SITE PROTÉGÉ EXISTANT                   */}
      {/* ==================================================================== */}
      <EditSiteModal
        isOpen={!!siteToEdit}
        site={siteToEdit}
        onClose={() => setSiteToEdit(null)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadSites();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
        users={usersList.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }))}
      />

      {/* ==================================================================== */}
      {/* Modal Édition Agent de Sécurité                                      */}
      {/* ==================================================================== */}
      <EditAgentModal
        isOpen={!!agentToEdit}
        agent={agentToEdit}
        onClose={() => setAgentToEdit(null)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadAgents();
        }}
        organizations={organizationsList}
        securityCenters={securityCentersList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
      />

      {/* ==================================================================== */}
      {/* MODALE : CONFIRMATION SUPPRESSION CENTRE DE SÉCURITÉ                 */}
      {/* ==================================================================== */}
      {centerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Supprimer ce centre ?</h3>
                <p className="text-xs text-slate-400">{centerToDelete.name} ({centerToDelete.code})</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Êtes-vous sûr de vouloir supprimer définitivement le centre de sécurité{' '}
              <span className="font-bold text-white">{centerToDelete.name}</span> ?
              Cette action est irréversible et sera refusée si des patrouilleurs, des sites protégés ou des interventions y sont rattachés.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCenterToDelete(null)}
                disabled={isDeletingCenter}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCenter}
                disabled={isDeletingCenter}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950 transition-colors disabled:opacity-50"
              >
                {isDeletingCenter ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODALE : CRÉATION D'UN CENTRE DE SÉCURITÉ                            */}
      {/* ==================================================================== */}
      <CreateCenterModal
        isOpen={isCreateCenterModalOpen}
        onClose={() => setIsCreateCenterModalOpen(false)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadCenters();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
        defaultOrganizationId={currentUser?.organization_id || authUser?.organization_id}
      />

      {/* ==================================================================== */}
      {/* MODALE : MODIFICATION D'UN CENTRE DE SÉCURITÉ                        */}
      {/* ==================================================================== */}
      <EditCenterModal
        isOpen={!!centerToEdit}
        center={centerToEdit}
        onClose={() => setCenterToEdit(null)}
        onSuccess={(msg) => {
          setFeedback({ type: 'success', message: msg });
          loadCenters();
        }}
        organizations={organizationsList}
        isPlatformAdmin={isPlatformAdminUser({
          role: currentUser?.role || authUser?.role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        })}
      />

    </div>
  );
}

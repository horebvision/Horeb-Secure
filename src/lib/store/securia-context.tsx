'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Alert,
  AlertEvent,
  AlertPriority,
  AlertStatus,
  AlertType,
  Organization,
  Profile,
  ProtectedSite,
  UserRole,
  AgentDutyStatus,
} from '../types/securia';
import { soundService } from '../utils/sound';
import { getBrowserClient } from '@/lib/supabase/client';
import { AuthService } from '@/modules/auth/auth.service';
import { authFetch } from '@/lib/utils/api-client';
import { isPlatformAdminUser } from '@/modules/users/types';

// Organisation opérationnelle principale (Côte d'Ivoire)
const DEFAULT_ORGANIZATION: Organization = {
  id: '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
  name: 'HOREB SECURE Côte d’Ivoire — Télésurveillance & Dispatch',
  code: 'SECURIA-CI',
  phone: '+225 07 47 33 84 77',
  email: 'dispatch.ci@securia.com',
  address: 'Boulevard de la République, Plateau',
  city: 'Abidjan',
  postal_code: 'BP 1234',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const ANONYMOUS_PROFILE: Profile = {
  id: '',
  email: '',
  full_name: '',
  phone: '',
  role: 'USER',
  organization_id: DEFAULT_ORGANIZATION.id,
  is_active: false,
  emergency_contacts: [
    { name: 'Police Secours (CI)', relation: 'Secours', phone: '170' },
    { name: 'Sapeurs-Pompiers (GSPM)', relation: 'Secours', phone: '180' },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const INITIAL_SITES: ProtectedSite[] = [];

interface SecuriaContextType {
  currentUser: Profile;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  organization: Organization;
  sites: ProtectedSite[];
  loadSites: () => Promise<void>;
  addSite: (site: Omit<ProtectedSite, 'id' | 'user_id' | 'created_at'>) => Promise<ProtectedSite>;
  updateSite: (id: string, updates: Partial<ProtectedSite>) => Promise<void>;
  deleteSite: (id: string) => Promise<void>;
  alerts: Alert[];
  alertEvents: AlertEvent[];
  activeAlert: Alert | null;
  agents: Profile[];
  refreshAgents: () => Promise<void>;
  updateAgentDuty: (agentId: string, status: AgentDutyStatus) => void;
  triggerAlert: (params: {
    type: AlertType;
    siteId?: string | null;
    isSilent?: boolean;
    clientNotes?: string;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    idempotencyKey?: string | null;
    serverAlert?: any;
  }) => Alert;
  updateAlertStatus: (
    alertId: string,
    newStatus: AlertStatus,
    comment?: string,
    report?: string
  ) => void;
  assignAgentToAlert: (alertId: string, agentId: string) => void;
  getAlertById: (id: string) => Alert | undefined;
  getEventsForAlert: (alertId: string) => AlertEvent[];
  unreadAlertCount: number;
  authUser: Profile | null;
  refreshProfile: () => Promise<void>;
  updateCurrentUser: (updates: Partial<Profile>) => void;
}

const SecuriaContext = createContext<SecuriaContextType | null>(null);

const STORAGE_KEY_ALERTS = 'securia_alerts_v1';
const STORAGE_KEY_EVENTS = 'securia_events_v1';
const STORAGE_KEY_SITES = 'securia_sites_v1';
const STORAGE_KEY_ROLE = 'securia_current_role_v1';

export function SecuriaProvider({ children }: { children: React.ReactNode }) {
  const [currentRole, setCurrentRoleState] = useState<UserRole>('USER');
  const [authUser, setAuthUser] = useState<Profile | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const [sites, setSites] = useState<ProtectedSite[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // BroadcastChannel pour la synchronisation temps réel inter-onglets
  const broadcastChannel = useMemo(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      return new BroadcastChannel('securia_live_bus');
    }
    return null;
  }, []);

  // 1. Récupération dynamique du profil utilisateur connecté depuis Supabase Auth
  const loadAuthUserProfile = useCallback(async () => {
    try {
      const sessionUser = await AuthService.getCurrentSessionUser();
      if (sessionUser) {
        const isPlatform = sessionUser.isPlatformAdmin ?? isPlatformAdminUser({
          role: sessionUser.role,
          email: sessionUser.email,
          organizationId: sessionUser.organizationId,
          isPlatformAdmin: sessionUser.isPlatformAdmin,
        });

        const profile: Profile = {
          id: sessionUser.id,
          email: sessionUser.email,
          full_name: sessionUser.fullName || sessionUser.email?.split('@')[0] || '',
          phone: sessionUser.phone || '',
          role: sessionUser.role,
          organization_id: sessionUser.organizationId || DEFAULT_ORGANIZATION.id,
          is_platform_admin: isPlatform,
          is_active: true,
          emergency_contacts: sessionUser.emergencyContacts && sessionUser.emergencyContacts.length > 0
            ? sessionUser.emergencyContacts
            : ANONYMOUS_PROFILE.emergency_contacts,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setAuthUser(profile);
        setCurrentRoleState(sessionUser.role);

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_ROLE, sessionUser.role);
          document.cookie = `securia_role=${sessionUser.role}; path=/; max-age=604800; SameSite=Lax`;

          // Si le rôle certifié en base est SECRETARY et qu'on se trouve sur l'écran client, redirection automatique
          if (
            sessionUser.role === 'SECRETARY' &&
            (window.location.pathname === '/' ||
              window.location.pathname === '/dashboard' ||
              window.location.pathname.startsWith('/dashboard/') ||
              window.location.pathname.startsWith('/client') ||
              window.location.pathname.startsWith('/sites') ||
              window.location.pathname.startsWith('/contacts') ||
              window.location.pathname.startsWith('/history') ||
              window.location.pathname.startsWith('/alerts') ||
              window.location.pathname.startsWith('/client-portal'))
          ) {
            window.location.replace('/secretariat');
          }
          // Note : aucun refreshSession ici. Le rôle fait foi depuis public.users ; rafraîchir la
          // session déclenchait TOKEN_REFRESHED -> rechargement du profil -> refreshSession (boucle).
        }
      } else {
        setAuthUser(null);
      }
    } catch (err) {
      console.warn('[SecuriaContext] Note récupération profil session:', err);
    }
  }, []);

  // 2. Chargement des patrouilleurs réels depuis l'API
  const loadRealAgents = useCallback(async () => {
    try {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await authFetch('/api/agent/duty-status', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.agents)) {
          const normalized = data.agents.map((ag: any) => {
            const userObj = ag.user || ag.users || {};
            const fullName = ag.full_name || userObj.full_name || ag.agent_name || `Agent ${ag.badge_number || 'AGT'}`;
            return {
              ...ag,
              full_name: fullName,
              agent_name: fullName,
              email: ag.email || userObj.email || '',
              phone: ag.phone || userObj.phone || '',
              agent_status: ag.duty_status || ag.agent_status || 'AVAILABLE',
            };
          });
          setAgents(normalized);
        }
      }
    } catch (e) {
      console.warn('[SecuriaContext] Note fetch agents:', e);
    }
  }, []);

  // 3. Chargement des sites protégés réels depuis l'API / Supabase
  const loadSites = useCallback(async () => {
    try {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await authFetch('/api/sites', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sites)) {
          setSites(data.sites);
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SITES, JSON.stringify(data.sites));
          }
        }
      }
    } catch (e) {
      console.warn('[SecuriaContext] Note fetch sites:', e);
    }
  }, []);

  // 4. Initialisation du state & Nettoyage des anciennes données démo du localStorage
  useEffect(() => {
    try {
      // Nettoyage immédiat des données de démonstration résiduelles (Claire Mercier, Dupont, Boulogne, etc.)
      const savedAlerts = localStorage.getItem(STORAGE_KEY_ALERTS);
      if (
        savedAlerts &&
        (savedAlerts.includes('SEC-2026-0042') ||
          savedAlerts.includes('Boulogne-Billancourt') ||
          savedAlerts.includes('Marc Dupont') ||
          savedAlerts.includes('Karim'))
      ) {
        localStorage.removeItem(STORAGE_KEY_ALERTS);
        localStorage.removeItem(STORAGE_KEY_EVENTS);
        localStorage.removeItem(STORAGE_KEY_SITES);
      }

      const savedRole = localStorage.getItem(STORAGE_KEY_ROLE) as UserRole | null;
      if (savedRole && ['USER', 'AGENT', 'SECURITY_MANAGER', 'ADMIN', 'SECRETARY'].includes(savedRole)) {
        setCurrentRoleState(savedRole);
      }

      const cleanAlerts = localStorage.getItem(STORAGE_KEY_ALERTS);
      const cleanEvents = localStorage.getItem(STORAGE_KEY_EVENTS);
      const cleanSites = localStorage.getItem(STORAGE_KEY_SITES);

      if (cleanAlerts && cleanEvents) {
        try {
          const parsedAlerts = JSON.parse(cleanAlerts);
          const parsedEvents = JSON.parse(cleanEvents);
          // Filtrer rigoureusement toute fausse alerte démo
          const filteredAlerts = Array.isArray(parsedAlerts)
            ? parsedAlerts.filter((a: Alert) => a.alert_number !== 'SEC-2026-0042' && a.id !== '44444444-4444-4444-4444-444444444444')
            : [];
          setAlerts(filteredAlerts);
          setAlertEvents(Array.isArray(parsedEvents) ? parsedEvents : []);
        } catch {
          setAlerts([]);
          setAlertEvents([]);
        }
      } else {
        setAlerts([]);
        setAlertEvents([]);
      }

      if (cleanSites) {
        try {
          const parsedSites = JSON.parse(cleanSites);
          setSites(Array.isArray(parsedSites) ? parsedSites : []);
        } catch {
          setSites([]);
        }
      } else {
        setSites([]);
      }
    } catch (e) {
      console.error('Erreur chargement Securia state:', e);
    } finally {
      setIsInitialized(true);
    }

    loadAuthUserProfile();
    loadRealAgents();
    loadSites();

    // Écouteur d'authentification Supabase temps réel
    const supabase = getBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Le chargement initial est déjà fait ci-dessus : on ne recharge que sur un vrai changement
      // de session (pas sur INITIAL_SESSION ni sur chaque TOKEN_REFRESHED horaire).
      if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        loadAuthUserProfile();
        loadRealAgents();
        loadSites();
      } else if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        setAlerts([]);
        setAlertEvents([]);
        setSites([]);
        setAgents([]);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_ALERTS);
          localStorage.removeItem(STORAGE_KEY_EVENTS);
          localStorage.removeItem(STORAGE_KEY_SITES);
          localStorage.removeItem(STORAGE_KEY_ROLE);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadAuthUserProfile, loadRealAgents, loadSites]);

  // Écoute des événements temps réel via BroadcastChannel
  useEffect(() => {
    if (!broadcastChannel) return;

    const handleMessage = (e: MessageEvent) => {
      const { type, payload } = e.data || {};
      if (type === 'ALERT_UPDATE') {
        setAlerts(payload.alerts);
        setAlertEvents(payload.alertEvents);
        if (payload.shouldChime && (currentRole === 'SECURITY_MANAGER' || currentRole === 'ADMIN')) {
          soundService.playEmergencyChime();
        }
      } else if (type === 'ROLE_CHANGE') {
        setCurrentRoleState(payload.role);
      } else if (type === 'SITE_CREATED' && payload?.site) {
        setSites((prev) => [payload.site, ...prev.filter((s) => s.id !== payload.site.id)]);
      } else if (type === 'SITE_UPDATED' && payload?.siteId) {
        setSites((prev) => prev.map((s) => s.id === payload.siteId ? { ...s, ...payload.updates } : s));
      } else if (type === 'SITE_DELETED' && payload?.siteId) {
        setSites((prev) => prev.filter((s) => s.id !== payload.siteId));
      }
    };

    broadcastChannel.addEventListener('message', handleMessage);
    return () => {
      broadcastChannel.removeEventListener('message', handleMessage);
    };
  }, [broadcastChannel, currentRole]);

  // Sauvegarde persistante des alertes
  const persistAlerts = useCallback(
    (newAlerts: Alert[], newEvents: AlertEvent[], shouldChime = false) => {
      setAlerts(newAlerts);
      setAlertEvents(newEvents);
      try {
        localStorage.setItem(STORAGE_KEY_ALERTS, JSON.stringify(newAlerts));
        localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(newEvents));
        broadcastChannel?.postMessage({
          type: 'ALERT_UPDATE',
          payload: { alerts: newAlerts, alertEvents: newEvents, shouldChime },
        });
      } catch (err) {
        console.error('Erreur persistance:', err);
      }
    },
    [broadcastChannel]
  );

  const setCurrentRole = useCallback(
    (role: UserRole) => {
      setCurrentRoleState(role);
      localStorage.setItem(STORAGE_KEY_ROLE, role);
      soundService.playConfirmation();
    },
    []
  );

  // Mise à jour synchrone et réactive du profil utilisateur en mémoire
  const updateCurrentUser = useCallback((updates: Partial<Profile>) => {
    setAuthUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...updates,
      };
    });
  }, []);

  // L'utilisateur courant est prioritairement le profil réel authentifié
  const currentUser: Profile = useMemo(() => {
    if (authUser) {
      return authUser;
    }
    return {
      ...ANONYMOUS_PROFILE,
      role: currentRole || 'USER',
    };
  }, [authUser, currentRole]);

  // Déclenchement d'une nouvelle alerte avec idempotence et anti-rebond
  const triggerAlert = useCallback(
    (params: {
      type: AlertType;
      siteId?: string | null;
      isSilent?: boolean;
      clientNotes?: string;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      idempotencyKey?: string | null;
      serverAlert?: any;
    }): Alert => {
      // 0. Si le serveur a déjà certifié et retourné l'alerte (ex: PanicButton)
      if (params.serverAlert) {
        const sAlert: Alert = {
          ...params.serverAlert,
          organization_id: params.serverAlert.organization_id || currentUser.organization_id || DEFAULT_ORGANIZATION.id,
        };

        const newEvent: AlertEvent = {
          id: crypto.randomUUID ? crypto.randomUUID() : `event-${Date.now()}`,
          alert_id: sAlert.id,
          actor_id: currentUser.id,
          from_status: null,
          to_status: sAlert.status || 'SENT',
          event_type: 'ALERT_CREATED',
          comment: `Alerte ${sAlert.type} confirmée par le serveur (${sAlert.location_address || 'Abidjan'})`,
          created_at: sAlert.created_at || new Date().toISOString(),
        };

        const existingIdx = alerts.findIndex((a) => a.id === sAlert.id || (params.idempotencyKey && a.idempotency_key === params.idempotencyKey));
        let updatedAlerts: Alert[];
        if (existingIdx >= 0) {
          updatedAlerts = [...alerts];
          updatedAlerts[existingIdx] = { ...updatedAlerts[existingIdx], ...sAlert };
        } else {
          updatedAlerts = [sAlert, ...alerts];
        }

        persistAlerts(updatedAlerts, [newEvent, ...alertEvents], true);
        return sAlert;
      }

      // 1. Idempotence locale : Si la clé existe déjà, retourner l'alerte existante sans duplicata
      if (params.idempotencyKey) {
        const existing = alerts.find((a) => a.idempotency_key === params.idempotencyKey);
        if (existing) {
          console.log('[Securia] Alerte existante renvoyée par idempotence locale:', existing.alert_number);
          return existing;
        }
      }

      // 2. Prévention du double déclenchement accidentel (cooldown 10s pour même utilisateur et même type)
      const recentCooldownMs = 10000;
      const recentIdentical = alerts.find(
        (a) =>
          a.user_id === currentUser.id &&
          a.type === params.type &&
          Date.now() - new Date(a.created_at).getTime() < recentCooldownMs &&
          !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
      );
      if (recentIdentical) {
        console.warn(
          '[Securia Engine] Double déclenchement accidentel prévenu (cooldown 10s):',
          recentIdentical.alert_number
        );
        return recentIdentical;
      }

      const selectedSite =
        sites.find((s) => s.id === params.siteId) || sites.find((s) => s.is_default) || sites[0];

      const alertNumber = `SEC-${new Date().getFullYear()}-${String(alerts.length + 43).padStart(4, '0')}`;
      const priority: AlertPriority =
        params.type === 'INTRUSION' || params.type === 'AGRESSION' ? 'CRITICAL' : 'HIGH';
      const escalationSeconds = priority === 'CRITICAL' ? 60 : 120;
      const escalationDeadline = new Date(Date.now() + escalationSeconds * 1000).toISOString();

      const resolvedOrgId = currentUser.organization_id || authUser?.organization_id || DEFAULT_ORGANIZATION.id;

      const newAlert: Alert = {
        id: crypto.randomUUID ? crypto.randomUUID() : `alert-${Date.now()}`,
        alert_number: alertNumber,
        user_id: currentUser.id,
        site_id: selectedSite?.id || null,
        organization_id: resolvedOrgId,
        type: params.type,
        priority,
        status: 'SENT',
        latitude: params.latitude || selectedSite?.latitude || 5.3484,
        longitude: params.longitude || selectedSite?.longitude || -4.0305,
        location_address: params.address || selectedSite?.address || 'Position GPS reçue',
        is_silent: !!params.isSilent,
        client_notes: params.clientNotes || '',
        idempotency_key: params.idempotencyKey || null,
        escalation_deadline: escalationDeadline,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const newEvent: AlertEvent = {
        id: crypto.randomUUID ? crypto.randomUUID() : `event-${Date.now()}`,
        alert_id: newAlert.id,
        actor_id: currentUser.id,
        from_status: null,
        to_status: 'SENT',
        event_type: 'ALERT_CREATED',
        comment: `Alerte ${params.type} transmise par ${currentUser.full_name} (${newAlert.location_address})`,
        created_at: new Date().toISOString(),
      };

      const updatedAlerts = [newAlert, ...alerts];
      const updatedEvents = [newEvent, ...alertEvents];

      persistAlerts(updatedAlerts, updatedEvents, true);

      // Signal haptique et sonore
      if (!params.isSilent) {
        soundService.vibrate([300, 150, 300]);
        soundService.playConfirmation();
      }

      // Synchronisation asynchrone avec l'API Supabase
      if (typeof window !== 'undefined') {
        const alertSyncFn = async () => {
          try {
            const supabase = getBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            const alertHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
              alertHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }
            if (params.idempotencyKey) {
              alertHeaders['Idempotency-Key'] = params.idempotencyKey;
            }
            const res = await authFetch('/api/alerts', {
              method: 'POST',
              headers: alertHeaders,
              body: JSON.stringify({
                id: newAlert.id,
                type: params.type,
                site_id: newAlert.site_id,
                latitude: newAlert.latitude,
                longitude: newAlert.longitude,
                location_address: newAlert.location_address,
                is_silent: newAlert.is_silent,
                client_notes: newAlert.client_notes,
                idempotency_key: params.idempotencyKey,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.alert) {
                setAlerts((prev) =>
                  prev.map((a) =>
                    a.id === newAlert.id || (params.idempotencyKey && a.idempotency_key === params.idempotencyKey)
                      ? { ...a, ...data.alert }
                      : a
                  )
                );
              }
              console.log('[Securia Engine] Alerte synchronisée backend API:', data.alert?.alert_number || 'OK');
            }
          } catch (err: any) {
            console.warn('[Securia Engine] Note sync API:', err.message);
          }
        };
        alertSyncFn();
      }

      return newAlert;
    },
    [alerts, alertEvents, currentUser, sites, persistAlerts]
  );

  // Mise à jour du statut d'une alerte
  const updateAlertStatus = useCallback(
    (alertId: string, newStatus: AlertStatus, comment?: string, report?: string) => {
      const targetAlert = alerts.find((a) => a.id === alertId);
      if (!targetAlert) return;

      const nowIso = new Date().toISOString();
      const updatedAlert: Alert = {
        ...targetAlert,
        status: newStatus,
        updated_at: nowIso,
        en_route_at: newStatus === 'EN_ROUTE' ? nowIso : targetAlert.en_route_at,
        arrived_at: newStatus === 'ARRIVED' ? nowIso : targetAlert.arrived_at,
        resolved_at: newStatus === 'RESOLVED' || newStatus === 'CANCELLED' ? nowIso : targetAlert.resolved_at,
        resolution_report: report !== undefined ? report : targetAlert.resolution_report,
      };

      const newEvent: AlertEvent = {
        id: crypto.randomUUID ? crypto.randomUUID() : `event-${Date.now()}`,
        alert_id: alertId,
        actor_id: currentUser.id,
        from_status: targetAlert.status,
        to_status: newStatus,
        event_type: newStatus === 'RESOLVED' ? 'INTERVENTION_RESOLVED' : 'STATUS_CHANGE',
        comment: comment || `Changement de statut : ${targetAlert.status} -> ${newStatus} par ${currentUser.full_name}`,
        created_at: nowIso,
      };

      const updatedAlerts = alerts.map((a) => (a.id === alertId ? updatedAlert : a));
      const updatedEvents = [newEvent, ...alertEvents];

      persistAlerts(updatedAlerts, updatedEvents, false);
      soundService.playConfirmation();

      // Synchronisation asynchrone sécurisée avec la base de données backend
      if (typeof window !== 'undefined') {
        authFetch(`/api/alerts/${alertId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            comment,
            report,
          }),
        }).catch((err) => console.warn('[SecuriaContext] Note sync alert status:', err));
      }
    },
    [alerts, alertEvents, currentUser, persistAlerts]
  );

  // Affectation d'un agent de sécurité
  const assignAgentToAlert = useCallback(
    (alertId: string, agentId: string) => {
      const targetAlert = alerts.find((a) => a.id === alertId);
      const agent = agents.find((ag) => ag.id === agentId);
      if (!targetAlert || !agent) return;

      const nowIso = new Date().toISOString();
      const updatedAlert: Alert = {
        ...targetAlert,
        assigned_agent_id: agentId,
        assigned_at: nowIso,
        status: 'ASSIGNED',
        updated_at: nowIso,
      };

      const newEvent: AlertEvent = {
        id: crypto.randomUUID ? crypto.randomUUID() : `event-${Date.now()}`,
        alert_id: alertId,
        actor_id: currentUser.id,
        from_status: targetAlert.status,
        to_status: 'ASSIGNED',
        event_type: 'AGENT_ASSIGNED',
        comment: `Agent ${agent.full_name} affecté à l'intervention par ${currentUser.full_name}.`,
        created_at: nowIso,
      };

      // Mettre à jour le statut de l'agent en 'DISPATCHED'
      setAgents((prev) =>
        prev.map((ag) => (ag.id === agentId ? { ...ag, agent_status: 'DISPATCHED' } : ag))
      );

      const updatedAlerts = alerts.map((a) => (a.id === alertId ? updatedAlert : a));
      const updatedEvents = [newEvent, ...alertEvents];

      persistAlerts(updatedAlerts, updatedEvents, true);
      soundService.playConfirmation();
    },
    [alerts, alertEvents, agents, currentUser, persistAlerts]
  );

  // Gestion des sites avec persistance réelle en base via /api/sites
  const addSite = useCallback(
    async (siteData: Omit<ProtectedSite, 'id' | 'user_id' | 'created_at'>): Promise<ProtectedSite> => {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const siteHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          siteHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        const res = await authFetch('/api/sites', {
          method: 'POST',
          headers: siteHeaders,
          body: JSON.stringify({
            name: siteData.name,
            site_type: siteData.site_type,
            address: siteData.address,
            city: siteData.city,
            postal_code: siteData.postal_code,
            latitude: siteData.latitude,
            longitude: siteData.longitude,
            access_instructions: siteData.access_instructions,
            is_default: siteData.is_default,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Erreur lors de la création du site');
        }

        const json = await res.json();
        const createdSite: ProtectedSite = json.site;

        setSites((prev) => {
          const updated = [createdSite, ...prev.filter((s) => s.id !== createdSite.id)];
          if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_SITES, JSON.stringify(updated));
          }
          return updated;
        });

        // Diffusion temps réel immédiate pour les autres onglets et la carte
        broadcastChannel?.postMessage({
          type: 'SITE_CREATED',
          payload: { site: createdSite },
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('securia:site_created', { detail: createdSite }));
        }

        soundService.playConfirmation();
        return createdSite;
      } catch (err: any) {
        console.error('[SecuriaContext] Erreur addSite:', err);
        throw err;
      }
    },
    [broadcastChannel]
  );

  const updateSite = useCallback(
    async (id: string, updates: Partial<ProtectedSite>) => {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const patchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          patchHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        const res = await authFetch('/api/sites', {
          method: 'PATCH',
          headers: patchHeaders,
          body: JSON.stringify({ id, ...updates }),
        });
        if (res.ok) {
          const json = await res.json();
          const updatedSite = json.site || updates;
          setSites((prev) => {
            const updated = prev.map((s) => (s.id === id ? { ...s, ...updatedSite } : s));
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY_SITES, JSON.stringify(updated));
            }
            return updated;
          });
          broadcastChannel?.postMessage({
            type: 'SITE_UPDATED',
            payload: { siteId: id, updates: updatedSite },
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('securia:site_updated', { detail: { id, updates: updatedSite } }));
          }
        }
      } catch (err) {
        console.error('[SecuriaContext] Erreur updateSite:', err);
      }
    },
    [broadcastChannel]
  );

  const deleteSite = useCallback(
    async (id: string) => {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const deleteHeaders: Record<string, string> = {};
        if (session?.access_token) {
          deleteHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
        const res = await authFetch(`/api/sites?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: deleteHeaders,
        });
        if (res.ok) {
          setSites((prev) => {
            const updated = prev.filter((s) => s.id !== id);
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY_SITES, JSON.stringify(updated));
            }
            return updated;
          });
          broadcastChannel?.postMessage({
            type: 'SITE_DELETED',
            payload: { siteId: id },
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('securia:site_deleted', { detail: { id } }));
          }
        }
      } catch (err) {
        console.error('[SecuriaContext] Erreur deleteSite:', err);
      }
    },
    [broadcastChannel]
  );

  const updateAgentDuty = useCallback(async (agentId: string, status: AgentDutyStatus) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, agent_status: status, duty_status: status } : a))
    );
    try {
      const supabase = getBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      await authFetch('/api/agent/duty-status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ agent_id: agentId, duty_status: status }),
      });
    } catch (e) {
      console.warn('[SecuriaContext] Note mise a jour statut garde:', e);
    }
  }, []);

  const getAlertById = useCallback(
    (id: string) => {
      const found = alerts.find((a) => a.id === id);
      if (!found) return undefined;
      return {
        ...found,
        site: sites.find((s) => s.id === found.site_id),
        user: (found as any).user || authUser || currentUser,
        assigned_agent: agents.find((ag) => ag.id === found.assigned_agent_id),
        organization: DEFAULT_ORGANIZATION,
      };
    },
    [alerts, sites, agents]
  );

  const getEventsForAlert = useCallback(
    (alertId: string) => {
      return alertEvents
        .filter((e) => e.alert_id === alertId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    },
    [alertEvents]
  );

  // Alerte active de l'utilisateur (non résolue / non annulée)
  const activeAlert = useMemo(() => {
    if (currentRole === 'USER') {
      return (
        alerts.find(
          (a) =>
            a.user_id === currentUser.id &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
        ) || null
      );
    }
    if (currentRole === 'AGENT') {
      return (
        alerts.find(
          (a) =>
            a.assigned_agent_id === currentUser.id &&
            !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
        ) || null
      );
    }
    return null;
  }, [alerts, currentRole, currentUser.id]);

  const unreadAlertCount = useMemo(() => {
    return alerts.filter((a) => ['CREATED', 'SENT', 'RECEIVED', 'ACKNOWLEDGED'].includes(a.status)).length;
  }, [alerts]);

  return (
    <SecuriaContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentRole,
        organization: DEFAULT_ORGANIZATION,
        sites,
        loadSites,
        addSite,
        updateSite,
        deleteSite,
        alerts,
        alertEvents,
        activeAlert,
        agents,
        refreshAgents: loadRealAgents,
        updateAgentDuty,
        triggerAlert,
        updateAlertStatus,
        assignAgentToAlert,
        getAlertById,
        getEventsForAlert,
        unreadAlertCount,
        authUser,
        refreshProfile: loadAuthUserProfile,
        updateCurrentUser,
      }}
    >
      {children}
    </SecuriaContext.Provider>
  );
}

export function useSecuria() {
  const context = useContext(SecuriaContext);
  if (!context) {
    throw new Error('useSecuria doit être utilisé au sein de SecuriaProvider');
  }
  return context;
}

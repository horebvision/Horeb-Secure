'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useSecuria } from '@/lib/store/securia-context';
import { isPlatformAdminUser } from '@/modules/users/types';
import {
  ShieldAlert,
  Radio,
  Car,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  MapPin,
  Clock,
  Lock,
  Play,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Smartphone,
  FileCheck2,
  BarChart3,
  Users2,
  PhoneCall,
  Activity,
  Compass,
  FileText,
  BadgeAlert,
  Check,
  X as CloseIcon,
  Navigation,
  KeyRound,
  Eye,
  Crosshair,
  Award,
  Loader2,
} from 'lucide-react';
import { PublicFooter } from '@/components/shared/PublicFooter';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';

function RouteLoadingSpinner({ message }: { message: string }) {
  return (
    <div className="min-h-[70vh] bg-slate-950 flex flex-col items-center justify-center gap-3 text-center p-6 animate-in fade-in">
      <div className="relative">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
      </div>
      <p className="text-xs text-slate-400 font-mono">{message}</p>
    </div>
  );
}

// Composants de pages chargés dynamiquement sur client pour le support Netlify Drop (SPA Fallback)
const AdminOrganizationsPage = dynamic(() => import('@/app/(admin)/admin/organizations/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la gestion des entreprises..." />,
});
const AdminPage = dynamic(() => import('@/app/(admin)/admin/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la console Superviseur..." />,
});
const AdminBusinessPage = dynamic(() => import('@/app/(admin)/admin/business/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du pipeline commercial..." />,
});
const AdminBillingPage = dynamic(() => import('@/app/(admin)/admin/billing/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la facturation SaaS..." />,
});
const DispatchPage = dynamic(() => import('@/app/(dispatch)/dispatch/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du Dispatch SOC..." />,
});
const DispatchAgentsPage = dynamic(() => import('@/app/(dispatch)/dispatch/agents/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la flotte agents..." />,
});
const DispatchClientsPage = dynamic(() => import('@/app/(dispatch)/dispatch/clients/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des clients..." />,
});
const AgentPage = dynamic(() => import('@/app/(agent)/agent/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du poste terrain agent..." />,
});
const DashboardPage = dynamic(() => import('@/app/(client)/dashboard/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de votre espace..." />,
});
const ClientPortalPage = dynamic(() => import('@/app/client-portal/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du portail client..." />,
});
const SecretariatPage = dynamic(() => import('@/app/secretariat/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du secrétariat..." />,
});
const BusinessPage = dynamic(() => import('@/app/(business)/business/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de Business OS..." />,
});
const SitesPage = dynamic(() => import('@/app/(client)/sites/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des sites protégés..." />,
});
const ContactsPage = dynamic(() => import('@/app/(client)/contacts/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des contacts..." />,
});
const HistoryPage = dynamic(() => import('@/app/(client)/history/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de l'historique..." />,
});
const BillingPage = dynamic(() => import('@/app/(business)/billing/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de l'abonnement..." />,
});
const ProfilePage = dynamic(() => import('@/app/(client)/profile/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de votre profil..." />,
});
const SettingsPage = dynamic(() => import('@/app/(client)/settings/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des paramètres..." />,
});
const SettingsUsersPage = dynamic(() => import('@/app/settings/users/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des collaborateurs..." />,
});
const SettingsOrganizationPage = dynamic(() => import('@/app/settings/organization/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des paramètres..." />,
});
const SettingsUsagePage = dynamic(() => import('@/app/settings/usage/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des quotas & abonnement..." />,
});
const DispatchIntegrationsPage = dynamic(() => import('@/app/(dispatch)/dispatch/integrations/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des intégrations..." />,
});
const DispatchCamerasPage = dynamic(() => import('@/app/(dispatch)/dispatch/cameras/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la vidéosurveillance..." />,
});
const DispatchExportsPage = dynamic(() => import('@/app/(dispatch)/dispatch/exports/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des exports & archives..." />,
});
const DispatchVideoEventsPage = dynamic(() => import('@/app/(dispatch)/dispatch/video-events/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des événements vidéo..." />,
});
const DispatchVideoGatewaysPage = dynamic(() => import('@/app/(dispatch)/dispatch/video-gateways/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des passerelles vidéo..." />,
});
const DispatchMapPage = dynamic(() => import('@/app/(dispatch)/dispatch/map/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la carte tactique..." />,
});
const AgentHistoryPage = dynamic(() => import('@/app/(agent)/agent/history/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de l'historique missions..." />,
});
const SecretariatVisitorsPage = dynamic(() => import('@/app/secretariat/visitors/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du registre visiteurs..." />,
});
const SecretariatNewVisitorPage = dynamic(() => import('@/app/secretariat/visitors/new/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de l'enregistrement visiteur..." />,
});
const SecretariatReportsPage = dynamic(() => import('@/app/secretariat/reports/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des rapports d'accueil..." />,
});
const ClientPortalAlertsPage = dynamic(() => import('@/app/client-portal/alerts/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des alertes client..." />,
});
const ClientPortalInterventionsPage = dynamic(() => import('@/app/client-portal/interventions/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des interventions client..." />,
});
const ClientPortalSitesPage = dynamic(() => import('@/app/client-portal/sites/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des sites protégés..." />,
});
const BusinessAgentsPage = dynamic(() => import('@/app/(business)/business/agents/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la performance agents..." />,
});
const BusinessFinancePage = dynamic(() => import('@/app/(business)/business/finance/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des finances opérationnelles..." />,
});
const BusinessOperationsPage = dynamic(() => import('@/app/(business)/business/operations/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des métriques d'opérations..." />,
});
const BusinessReportsPage = dynamic(() => import('@/app/(business)/business/reports/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des rapports Business OS..." />,
});
const BusinessRiskPage = dynamic(() => import('@/app/(business)/business/risk/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la cartographie des risques..." />,
});
const BusinessSitesPage = dynamic(() => import('@/app/(business)/business/sites/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des sites sous contrat..." />,
});
const BusinessSlaPage = dynamic(() => import('@/app/(business)/business/sla/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement de la conformité SLA..." />,
});
const BusinessApiKeysPage = dynamic(() => import('@/app/(business)/business/api-keys/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des clés API..." />,
});
const BillingUpgradePage = dynamic(() => import('@/app/(business)/billing/upgrade/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement du choix d'abonnement..." />,
});
const AlertsPage = dynamic(() => import('@/app/(client)/alerts/page'), {
  ssr: false,
  loading: () => <RouteLoadingSpinner message="Chargement des alertes..." />,
});



/* ─── Chaîne d'intervention en 4 étapes clés (Stitch Architecture) ─── */
const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Alerte & Détection Immédiate',
    desc: 'Déclenchement instantané via le bouton panique mobile du résident, alarme intrusion sur site ou appel d’urgence.',
    icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
    badge: 'Temps réel',
    badgeColor: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
  {
    step: '02',
    title: 'Qualification SOC < 45s',
    desc: 'L’opérateur de télésurveillance qualifie l’incident, visualise la fiche site avec consignes d’accès et valide la criticité.',
    icon: <Radio className="w-5 h-5 text-amber-400" />,
    badge: '< 45 secondes',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  {
    step: '03',
    title: 'Smart Dispatch GPS & Guidage',
    desc: 'L’algorithme affecte la patrouille la plus proche. L’agent reçoit l’ordre de mission chiffré et son itinéraire Waze/Maps.',
    icon: <Car className="w-5 h-5 text-cyan-400" />,
    badge: 'Guidage live',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  },
  {
    step: '04',
    title: 'Constat & Clôture PoI Certifiée',
    desc: 'Rapport numérique sur place, photos horodatées infalsifiables RFC 3161, signature tactile client et rapport PDF instantané.',
    icon: <FileCheck2 className="w-5 h-5 text-emerald-400" />,
    badge: 'Preuve certifiée',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
];

/* ─── 6 Piliers Fonctionnels (Tactical Defense Command) ─── */
const CORE_FEATURES = [
  {
    icon: <Radio className="w-6 h-6 text-red-400" />,
    title: 'Centre de Commandement SOC 24/7',
    badge: 'Télésurveillance',
    desc: 'File d’attente des alertes en direct, signaux sonores d’urgence, priorisation automatique (P1 à P4) et coordination radio multi-canaux.',
    highlight: 'Temps de prise en charge < 45s',
  },
  {
    icon: <Car className="w-6 h-6 text-cyan-400" />,
    title: 'Smart Dispatch & Carte Tactique',
    badge: 'Flotte & GPS',
    desc: 'Visualisation live de vos patrouilles à Abidjan et villes de l’intérieur. Calcul d’ETA intelligent et affectation automatique de l’agent le plus proche.',
    highlight: 'Optimisation des temps de trajet',
  },
  {
    icon: <Smartphone className="w-6 h-6 text-amber-400" />,
    title: 'Application Terrain pour Agents',
    badge: 'Mobile-First',
    desc: 'Ordres de mission immédiats, consignes d’accès sécurisées (digicodes, vigiles), guidage GPS et main courante électronique fonctionnant en réseau dégradé.',
    highlight: 'Mode offline & reprise automatique',
  },
  {
    icon: <FileCheck2 className="w-6 h-6 text-emerald-400" />,
    title: 'Preuve d’Intervention (PoI) & Signature',
    badge: 'Conformité & Audit',
    desc: 'Horodatage certifié T0 à T7, photos géolocalisées inaltérables, signature tactile du client et génération immédiate du rapport PDF.',
    highlight: 'Valeur probante contractuelle',
  },
  {
    icon: <ShieldAlert className="w-6 h-6 text-rose-400" />,
    title: 'Portail Client & Bouton SOS',
    badge: 'Clients & Sites',
    desc: 'Espace sécurisé pour vos résidents et entreprises abonnées : déclenchement SOS, suivi de la patrouille sur carte et historique des rondes.',
    highlight: 'Fidélisation client maximale',
  },
  {
    icon: <Layers className="w-6 h-6 text-purple-400" />,
    title: 'Cloisonnement Multi-Tenant Étanche',
    badge: 'Architecture SaaS',
    desc: 'Isolation stricte des données de chaque société de sécurité (Anti-IDOR & Supabase RLS). Gestion granulaire des accès Superviseur, SOC, Agent et Client.',
    highlight: 'Sécurité de grade bancaire',
  },
];

/* ─── 4 Espaces Opérationnels ─── */
const OPERATIONAL_SPACES = [
  {
    role: 'DIRECTION & SUPERVISION',
    title: 'Pilotage & Supervision Globale',
    desc: 'Suivez la performance opérationnelle, le respect des SLA, le dimensionnement des équipes et la rentabilité de vos contrats.',
    stats: 'Dashboard Executive & Facturation',
    icon: <BarChart3 className="w-5 h-5 text-purple-400" />,
    image: '/hero-soc.jpg',
  },
  {
    role: 'OPÉRATEURS SOC',
    title: 'Centre de Télésurveillance 24/7',
    desc: 'Console de régulation ultra-rapide : réception sonore des SOS, géolocalisation des sites et déclenchement des patrouilles.',
    stats: 'Multi-écrans & Alerte sonore',
    icon: <Radio className="w-5 h-5 text-red-400" />,
    image: '/hero-soc.jpg',
  },
  {
    role: 'AGENTS DE SÉCURITÉ',
    title: 'Poste Mobile Patrouille & Ronde',
    desc: 'Application ergonomique pensée pour le terrain : prise en charge d’alarme en 1 clic, consignes portail/digicode et clôture photo.',
    stats: 'GPS intégré & Main courante',
    icon: <Car className="w-5 h-5 text-amber-400" />,
    image: '/hero-agent.jpg',
  },
  {
    role: 'CLIENTS & RÉSIDENTS',
    title: 'Portail de Protection Connecté',
    desc: 'Vos clients disposent d’un bouton d’urgence géolocalisé, du suivi en direct de l’arrivée de la patrouille et de leurs rapports.',
    stats: 'Transparence & Réassurance',
    icon: <Users2 className="w-5 h-5 text-emerald-400" />,
    image: '/hero-sos.jpg',
  },
];

export default function HomePage() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { currentRole, currentUser, authUser } = useSecuria();

  const [activeConsoleTab, setActiveConsoleTab] = useState<'radar' | 'agent' | 'poi' | 'client'>('radar');
  const [radarPing, setRadarPing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRadarPing((prev) => !prev);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const scrollToFeatures = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('features');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isPlatformAdmin = useMemo(() => {
    if (currentRole !== 'ADMIN') return false;
    return isPlatformAdminUser({
      role: currentRole,
      email: authUser?.email || currentUser?.email,
      organizationId: authUser?.organization_id || currentUser?.organization_id,
      isPlatformAdmin: authUser?.is_platform_admin ?? (currentUser as any)?.is_platform_admin,
    });
  }, [currentRole, authUser, currentUser]);

  const userHomePath = useMemo(() => {
    switch (currentRole) {
      case 'ADMIN':
        return isPlatformAdmin ? '/admin' : '/dispatch';
      case 'SECURITY_MANAGER':
        return '/dispatch';
      case 'SECRETARY':
        return '/secretariat';
      case 'AGENT':
        return '/agent';
      case 'USER':
      default:
        return '/dashboard';
    }
  }, [currentRole, isPlatformAdmin]);

  const isLoggedIn = !!currentUser?.id;

  // Détection prioritaire du chemin d'URL pour le support SPA Netlify Drop sans flash de la page d'accueil
  const currentPath = useMemo(() => {
    if (typeof window !== 'undefined') {
      const locPath = window.location.pathname;
      if (locPath && locPath !== '/') {
        return locPath;
      }
    }
    return pathname || '/';
  }, [pathname]);

  const normalizedPath = currentPath.endsWith('/') && currentPath.length > 1 ? currentPath.slice(0, -1) : currentPath;

  // 1. Administration Superviseur
  if (normalizedPath === '/admin/organizations') return <AdminOrganizationsPage />;
  if (normalizedPath === '/admin/business') return <AdminBusinessPage />;
  if (normalizedPath === '/admin/billing') return <AdminBillingPage />;
  if (normalizedPath === '/admin') return <AdminPage />;

  // 2. Dispatch SOC & Vidéosurveillance
  if (normalizedPath === '/dispatch/agents') return <DispatchAgentsPage />;
  if (normalizedPath === '/dispatch/clients') return <DispatchClientsPage />;
  if (normalizedPath === '/dispatch/cameras') return <DispatchCamerasPage />;
  if (normalizedPath === '/dispatch/exports') return <DispatchExportsPage />;
  if (normalizedPath === '/dispatch/video-events') return <DispatchVideoEventsPage />;
  if (normalizedPath === '/dispatch/video-gateways') return <DispatchVideoGatewaysPage />;
  if (normalizedPath === '/dispatch/map') return <DispatchMapPage />;
  if (normalizedPath === '/dispatch/integrations') return <DispatchIntegrationsPage />;
  if (normalizedPath === '/dispatch') return <DispatchPage />;

  // 3. Poste Agent de terrain
  if (normalizedPath === '/agent/history') return <AgentHistoryPage />;
  if (normalizedPath === '/agent') return <AgentPage />;

  // 4. Secrétariat & Visiteurs
  if (normalizedPath === '/secretariat/visitors/new') return <SecretariatNewVisitorPage />;
  if (normalizedPath === '/secretariat/visitors') return <SecretariatVisitorsPage />;
  if (normalizedPath === '/secretariat/reports') return <SecretariatReportsPage />;
  if (normalizedPath === '/secretariat') return <SecretariatPage />;

  // 5. Portail Client Entreprise
  if (normalizedPath === '/client-portal/alerts') return <ClientPortalAlertsPage />;
  if (normalizedPath === '/client-portal/interventions') return <ClientPortalInterventionsPage />;
  if (normalizedPath === '/client-portal/sites') return <ClientPortalSitesPage />;
  if (normalizedPath === '/client-portal') return <ClientPortalPage />;

  // 6. Security Business OS
  if (normalizedPath === '/business/agents') return <BusinessAgentsPage />;
  if (normalizedPath === '/business/finance') return <BusinessFinancePage />;
  if (normalizedPath === '/business/operations') return <BusinessOperationsPage />;
  if (normalizedPath === '/business/reports') return <BusinessReportsPage />;
  if (normalizedPath === '/business/risk') return <BusinessRiskPage />;
  if (normalizedPath === '/business/sites') return <BusinessSitesPage />;
  if (normalizedPath === '/business/sla') return <BusinessSlaPage />;
  if (normalizedPath === '/business/api-keys' || normalizedPath === '/business/api-docs') return <BusinessApiKeysPage />;
  if (normalizedPath === '/business') return <BusinessPage />;

  // 7. Facturation & Plans SaaS
  if (normalizedPath === '/billing/upgrade') return <BillingUpgradePage />;
  if (normalizedPath === '/billing') return <BillingPage />;

  // 8. Espaces Résidents & Directs
  if (normalizedPath === '/dashboard') return <DashboardPage />;
  if (normalizedPath === '/sites') return <SitesPage />;
  if (normalizedPath === '/contacts') return <ContactsPage />;
  if (normalizedPath === '/history') return <HistoryPage />;
  if (normalizedPath === '/alerts') return <AlertsPage />;
  if (normalizedPath === '/profile') return <ProfilePage />;

  // 9. Paramètres & Collaborateurs
  if (normalizedPath === '/settings/users') return <SettingsUsersPage />;
  if (normalizedPath === '/settings/organization') return <SettingsOrganizationPage />;
  if (normalizedPath === '/settings/usage') return <SettingsUsagePage />;
  if (normalizedPath === '/settings/integrations') return <DispatchIntegrationsPage />;
  if (normalizedPath.startsWith('/settings')) {
    return currentRole === 'ADMIN' ? <SettingsOrganizationPage /> : <SettingsPage />;
  }

  // Protection anti-flash : si le navigateur est sur une URL d'application, ne JAMAIS afficher la page d'accueil marketing !
  if (currentPath !== '/' || (typeof window !== 'undefined' && window.location.pathname !== '/')) {
    return <RouteLoadingSpinner message="Chargement de votre console opérationnelle..." />;
  }

  return (
    <div className="relative min-h-screen bg-[#070d1f] text-slate-100 overflow-x-hidden selection:bg-cyan-500 selection:text-black">
      {/* Bandeau d'accès direct pour les utilisateurs déjà connectés */}
      {isLoggedIn && (
        <div className="sticky top-16 z-40 bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950 border-b border-cyan-500/30 px-4 py-3 text-center shadow-lg animate-in fade-in">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Session active : <strong>{currentUser?.full_name || 'Utilisateur'}</strong> ({isPlatformAdmin ? 'Super Admin Plateforme' : currentRole})
              </span>
            </div>
            <Link
              href={userHomePath}
              className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold transition-all shadow-md shadow-cyan-950/50 flex items-center gap-1.5 shrink-0"
            >
              <span>Accéder à votre console {isPlatformAdmin ? 'Superviseur' : 'Opérationnelle'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          HERO SECTION — Tactical Defense Command (Stitch)
      ═══════════════════════════════════════════════ */}
      <section className="relative pt-10 pb-20 md:pt-16 md:pb-28 overflow-hidden border-b border-slate-800/80">
        {/* Glow Halos & Tactical Radar Background Lines */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-cyan-500/15 via-blue-600/10 to-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] bg-red-600/10 blur-[100px] rounded-full pointer-events-none" />

        {/* Ambient coordinate grid */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-6">

            {/* ─── OFFICIAL HOREB SECURE LOGO SHOWCASE ─── */}
            <div className="flex flex-col items-center justify-center pt-2">
              <div className="relative group">
                {/* Rotating Cyber Pulse Rings */}
                <div className="absolute -inset-5 rounded-full bg-gradient-to-tr from-cyan-500/30 via-blue-600/20 to-emerald-400/30 blur-xl opacity-75 group-hover:opacity-100 transition duration-700 pointer-events-none" />
                <div className="absolute -inset-2 rounded-full border border-cyan-400/40 animate-pulse pointer-events-none" />
                <div className="absolute -inset-3 rounded-full border border-dashed border-cyan-500/20 pointer-events-none animate-[spin_20s_linear_infinite]" />

                {/* 3D Round Badge Container */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr from-cyan-400 via-blue-600 to-emerald-400 shadow-2xl shadow-cyan-950/80 flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center relative p-1">
                    <Image
                      src="/horeb-secure-logo.png"
                      alt="Horeb Secure"
                      width={256}
                      height={256}
                      unoptimized
                      priority
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                </div>
              </div>

              {/* Slogan Banner */}
              <div className="flex items-center gap-2 mt-4">
                <span className="h-px w-6 sm:w-10 bg-gradient-to-r from-transparent to-cyan-400" />
                <span className="text-[11px] sm:text-xs font-black tracking-[0.25em] text-cyan-300 uppercase font-mono">
                  PROTÉGER AUJOURD'HUI — DEMAIN
                </span>
                <span className="h-px w-6 sm:w-10 bg-gradient-to-l from-transparent to-cyan-400" />
              </div>
            </div>

            {/* Pill Badge B2B */}
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-semibold shadow-inner">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-slate-400">Plateforme SaaS B2B</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-300">Télésurveillance &amp; Sécurité Privée UEMOA</span>
            </div>

            {/* Titre Principal */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.14]">
              Pilotez vos alertes, vos patrouilles et vos sites{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                en temps réel
              </span>
            </h1>

            {/* Sous-titre */}
            <p className="text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
              La solution de commandement unifiée pour les sociétés de sécurité privée en Afrique de l'Ouest :
              réception des alarmes sous 45s, traçabilité GPS des patrouilles et preuves d'intervention certifiées.
            </p>

            {/* Boutons d'Action (CTAs) */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-cyan-950/60 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>Demander une démonstration B2B</span>
                <ArrowRight className="w-4 h-4 text-slate-950" />
              </Link>

              <button
                type="button"
                onClick={scrollToFeatures}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-sm transition-all hover:border-cyan-500/40"
              >
                <span>Découvrir la console SOC</span>
              </button>
            </div>

            {/* Lien secondaire de connexion */}
            <div className="pt-1 text-xs text-slate-400">
              <span>Société ou agent déjà équipé ?</span>{' '}
              <Link href="/login" className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 font-semibold transition-colors">
                Se connecter à votre console HOREB SECURE →
              </Link>
            </div>
          </div>

          {/* Baromètre Opérationnel (Telemetry Ticker) */}
          <div className="mt-14 max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-sm text-center group hover:border-emerald-500/40 transition-colors">
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">&lt; 45s</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Prise en charge SOC</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-sm text-center group hover:border-cyan-500/40 transition-colors">
              <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">GPS Live</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Traçabilité patrouilles</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-sm text-center group hover:border-blue-500/40 transition-colors">
              <div className="text-2xl sm:text-3xl font-black text-blue-400 font-mono">100%</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Preuves horodatées</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-sm text-center group hover:border-purple-500/40 transition-colors">
              <div className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">24h/7</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Disponibilité continue</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION CONSOLE INTERACTIVE SOC & RADAR TACTIQUE
      ═══════════════════════════════════════════════ */}
      <section className="py-16 md:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-3 font-mono">
            <Activity className="w-3.5 h-3.5" />
            <span>Console Opérationnelle Interactive</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
            Une vue à 360° sur vos équipes et vos incidents
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Testez l'interface en direct : passez du radar de télésurveillance SOC au poste mobile de l'agent sur le terrain.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <button
            type="button"
            onClick={() => setActiveConsoleTab('radar')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeConsoleTab === 'radar'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 font-bold'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>1. Radar SOC &amp; Dispatch GPS</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveConsoleTab('agent')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeConsoleTab === 'agent'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 font-bold'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>2. Ordre de Mission Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveConsoleTab('poi')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeConsoleTab === 'poi'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 font-bold'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>3. Preuve d'Intervention (PoI)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveConsoleTab('client')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
              activeConsoleTab === 'client'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/30 font-bold'
                : 'bg-slate-900/80 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>4. Espace SOS Résident</span>
          </button>
        </div>

        {/* Console Container (Glassmorphic Terminal) */}
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800/90 shadow-2xl p-4 sm:p-8 relative overflow-hidden backdrop-blur-xl">
          {/* Top Bar of Console */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="ml-2 font-mono text-slate-400 text-[11px]">
                HOREB-SECURE-TACTICAL-CORE // REGION-UEMOA-01
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-cyan-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SYSTÈME EN LIGNE (99.98%)</span>
            </div>
          </div>

          {/* TAB 1: RADAR SOC VIEW */}
          {activeConsoleTab === 'radar' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Radar Grid Map */}
              <div className="lg:col-span-2 relative h-[360px] sm:h-[400px] rounded-2xl bg-slate-950/90 border border-slate-800 overflow-hidden flex items-center justify-center p-4">
                {/* Simulated Map Coordinates Grid */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                  }}
                />

                {/* Concentric Radar Rings */}
                <div className="absolute w-[300px] h-[300px] rounded-full border border-cyan-500/20 pointer-events-none" />
                <div className="absolute w-[200px] h-[200px] rounded-full border border-cyan-500/30 pointer-events-none" />
                <div className="absolute w-[100px] h-[100px] rounded-full border border-cyan-500/40 pointer-events-none" />

                {/* Rotating Radar Sweep Beam */}
                <div className="absolute w-[300px] h-[300px] rounded-full pointer-events-none animate-[spin_6s_linear_infinite] opacity-30 bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,transparent_280deg,rgba(6,182,212,0.6)_360deg)]" />

                {/* Center Station: SOC Abidjan */}
                <div className="absolute z-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/50">
                    <Radio className="w-4 h-4 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-mono text-cyan-300 font-bold mt-1 bg-slate-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">
                    CENTRE SOC ABIDJAN
                  </span>
                </div>

                {/* Patrol Unit 1: Alpha-01 */}
                <div className="absolute top-16 left-20 sm:left-32 z-10 flex items-center gap-2 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-emerald-950 border border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                    <Car className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="bg-slate-950/90 p-1.5 rounded-lg border border-emerald-500/40 text-[10px] font-mono">
                    <span className="font-bold text-emerald-300">ALPHA-01</span>
                    <span className="text-slate-400 block">Cocody Danga (Dispo)</span>
                  </div>
                </div>

                {/* Patrol Unit 2: Beta-03 */}
                <div className="absolute bottom-20 right-16 sm:right-28 z-10 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center">
                    <Car className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="bg-slate-950/90 p-1.5 rounded-lg border border-cyan-500/40 text-[10px] font-mono">
                    <span className="font-bold text-cyan-300">BETA-03</span>
                    <span className="text-slate-400 block">Plateau Chardy</span>
                  </div>
                </div>

                {/* Active Incident Beacon (SOS) */}
                <div className="absolute top-24 right-20 sm:right-36 z-10 flex items-center gap-2">
                  <div className="relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <div className="w-8 h-8 rounded-full bg-red-950 border-2 border-red-500 flex items-center justify-center shadow-lg shadow-red-500/60">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                    </div>
                  </div>
                  <div className="bg-red-950/90 p-2 rounded-lg border border-red-500/60 text-[10px] font-mono shadow-xl">
                    <span className="font-extrabold text-red-300">ALERTE P1 // INTRUSION</span>
                    <span className="text-white block font-bold">Résidence Les Ambassades</span>
                    <span className="text-red-400 block">SLA: 00:26 restante</span>
                  </div>
                </div>
              </div>

              {/* Feed & Quick Dispatch Actions */}
              <div className="flex flex-col justify-between space-y-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      File d'Incidents Actifs
                    </span>
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-mono font-bold border border-red-500/40">
                      1 CRITIQUE
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 mb-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <strong className="text-red-300 font-bold">#ALT-2026-084</strong>
                      <span className="text-red-400 font-mono font-bold animate-pulse">P1 URGENT</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Déclenchement alarme périmétrique Nord. Appel résident confirmé.
                    </p>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-400" />
                      <span>Cocody Ambassades — Rue des Jardins</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">#ALT-2026-083</span>
                      <span className="text-emerald-400 font-mono text-[10px]">P3 NORMAL</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Ronde planifiée terminée avec succès (Zone Marcory).
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] text-slate-400">Patrouille recommandée :</div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-cyan-400" />
                      <div>
                        <div className="text-xs font-bold text-white">ALPHA-01 (Hilux)</div>
                        <div className="text-[10px] text-cyan-300 font-mono">ETA: 3 min 12s (1.8 km)</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-cyan-500/30"
                    >
                      Affecter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AGENT MOBILE VIEW */}
          {activeConsoleTab === 'agent' && (
            <div className="max-w-md mx-auto p-4 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                    K.A
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Agent Kouadio Alexis</div>
                    <div className="text-[10px] text-emerald-400 font-mono">Patrouille ALPHA-01</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40">
                  EN MISSION
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-white">
                  <span>Ordre de Mission #ALT-2026-084</span>
                  <span className="text-red-400 font-mono animate-pulse">P1</span>
                </div>
                <div className="text-xs text-slate-300 font-semibold">
                  Site : Résidence Privée Les Ambassades
                </div>
                <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded-lg border border-slate-800 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                    <KeyRound className="w-3 h-3" />
                    <span>Consignes d'Accès :</span>
                  </div>
                  <p>Portail électrique gris, code vigile : <strong className="text-white font-mono">#4821#</strong>. Chien de garde dans enclos arrière.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Guidage Waze</span>
                </button>
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Arrivé sur Site</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: POI CERTIFIED REPORT VIEW */}
          {activeConsoleTab === 'poi' && (
            <div className="max-w-xl mx-auto p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-white">Preuve d'Intervention Certifiée (PoI)</span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
                  RFC 3161 VALIDE
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-850 font-mono text-[11px]">
                  <div><span className="text-slate-500">Horodatage T0 (Déclenchement):</span> <span className="text-white">12:44:02 GMT</span></div>
                  <div><span className="text-slate-500">Horodatage T2 (Arrivée sur site):</span> <span className="text-emerald-400">12:47:18 GMT</span></div>
                  <div><span className="text-slate-500">Coordonnées GPS:</span> <span className="text-cyan-300">5.3599° N, 4.0083° W</span></div>
                  <div><span className="text-slate-500">Précision satellite:</span> <span className="text-white">± 2.4 mètres</span></div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-850 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-300">Constat Opérationnel :</div>
                  <p className="text-slate-400 text-[11px]">
                    Inspection complète de l'accès Nord effectuée. Aucune effraction détectée. Fausse alerte provoquée par animal domestique. Propriétaire avisé sur place.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-[11px] font-bold text-white">Signature tactile client enregistrée</div>
                      <div className="text-[10px] text-slate-400 font-mono">Signé par : M. Jean-Marc K. (Propriétaire)</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700"
                  >
                    Voir PDF
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CLIENT SOS PORTAL VIEW */}
          {activeConsoleTab === 'client' && (
            <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-950 border border-slate-800 text-center space-y-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Portail Résident Horeb Secure
              </div>

              {/* Big Red SOS Button */}
              <div className="relative inline-block my-2">
                <div className="absolute -inset-3 bg-red-600/30 rounded-full blur-xl animate-pulse" />
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-b from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 border-4 border-red-400 flex flex-col items-center justify-center text-white shadow-2xl shadow-red-950 cursor-pointer active:scale-95 transition-all mx-auto">
                  <ShieldAlert className="w-8 h-8 mb-1" />
                  <span className="font-black text-sm tracking-widest">SOS</span>
                </div>
              </div>

              <div className="text-xs text-slate-300">
                Appuyez pour déclencher l'intervention immédiate de la patrouille la plus proche de votre domicile.
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-left text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-white">Résidence Les Ambassades</span>
                  <span className="text-emerald-400 font-mono text-[10px]">● Sécurisé</span>
                </div>
                <div className="text-[11px] text-slate-400">Patrouille assignée : Secteur Cocody (ETA habituel &lt; 5 min)</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION CHAÎNE D'INTERVENTION (#pipeline)
      ═══════════════════════════════════════════════ */}
      <section id="pipeline" className="scroll-mt-20 py-20 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3 font-mono">
              <Zap className="w-3.5 h-3.5" />
              <span>Fluidité Opérationnelle</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              La chaîne d'intervention complète, sans rupture
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              De l'alerte d'urgence sur le terrain à la signature du constat client :
              chaque étape est synchronisée en temps réel entre le résident, le centre SOC et l'agent patrouilleur.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PIPELINE_STEPS.map((item) => (
              <div
                key={item.step}
                className="relative flex flex-col p-6 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all duration-300 group shadow-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-black text-slate-600 group-hover:text-cyan-400 transition-colors font-mono">
                    {item.step}
                  </span>
                  <div className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${item.badgeColor}`}>
                    {item.badge}
                  </div>
                </div>

                <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  {item.icon}
                </div>

                <h3 className="text-base font-bold text-white mb-2">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed flex-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION FONCTIONNALITÉS CLÉS (#features)
      ═══════════════════════════════════════════════ */}
      <section id="features" className="scroll-mt-20 py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3 font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Modules Métier Spécifiques</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
            Tout pour digitaliser votre société de sécurité
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Conçu pour éliminer les appels téléphoniques chaotiques, les retards d'affectation et les contestations clients lors des interventions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CORE_FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="flex flex-col p-6 rounded-3xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900/90 transition-all duration-300 shadow-xl group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {feat.icon}
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-[11px] font-medium text-slate-300 font-mono">
                  {feat.badge}
                </span>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">{feat.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6 flex-1">{feat.desc}</p>

              <div className="pt-3 border-t border-slate-800/70 flex items-center gap-2 text-xs text-emerald-400 font-semibold font-mono">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{feat.highlight}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION TABLEAU COMPARATIF (AVANT VS AVEC HOREB SECURE)
      ═══════════════════════════════════════════════ */}
      <section className="py-20 bg-slate-900/30 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              Pourquoi moderniser vos opérations avec Horeb Secure ?
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Comparez le mode de fonctionnement traditionnel avec l'efficacité de la plateforme Horeb Secure.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-4 px-4 font-bold text-slate-400 uppercase text-xs">Critère Opérationnel</th>
                  <th className="py-4 px-4 font-bold text-red-400 uppercase text-xs bg-red-950/20 rounded-t-xl">
                    Gestion Manuelle / Traditionnelle
                  </th>
                  <th className="py-4 px-4 font-bold text-cyan-400 uppercase text-xs bg-cyan-950/30 rounded-t-xl">
                    Avec HOREB SECURE
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                <tr>
                  <td className="py-4 px-4 text-white font-semibold">Temps de qualification alarme</td>
                  <td className="py-4 px-4 text-slate-400 bg-red-950/10">3 à 10 minutes (appels téléphoniques, doutes)</td>
                  <td className="py-4 px-4 text-emerald-300 font-bold bg-cyan-950/20 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Moins de 45 secondes (qualification SOC guidée)</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 text-white font-semibold">Affectation de la patrouille</td>
                  <td className="py-4 px-4 text-slate-400 bg-red-950/10">Appel radio général sans visibilité GPS</td>
                  <td className="py-4 px-4 text-emerald-300 font-bold bg-cyan-950/20 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Algorithme GPS : agent le plus proche sous 1 clic</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 text-white font-semibold">Preuve de passage &amp; horodatage</td>
                  <td className="py-4 px-4 text-slate-400 bg-red-950/10">Cahier papier manuscrit contestable</td>
                  <td className="py-4 px-4 text-emerald-300 font-bold bg-cyan-950/20 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Photos géocodées, horodatage RFC 3161 inaltérable</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 text-white font-semibold">Validation client sur place</td>
                  <td className="py-4 px-4 text-slate-400 bg-red-950/10">Aucune ou signature différée</td>
                  <td className="py-4 px-4 text-emerald-300 font-bold bg-cyan-950/20 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Signature tactile immédiate &amp; PDF certifié</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-4 px-4 text-white font-semibold">Fonctionnement en réseau faible</td>
                  <td className="py-4 px-4 text-slate-400 bg-red-950/10">Perte d'information et blocage</td>
                  <td className="py-4 px-4 text-emerald-300 font-bold bg-cyan-950/20 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>PWA Offline : synchronisation auto dès reconnexion</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION ESPACES OPÉRATIONNELS (#modules)
      ═══════════════════════════════════════════════ */}
      <section id="modules" className="scroll-mt-20 py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/50 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-3 font-mono">
            <Layers className="w-3.5 h-3.5" />
            <span>4 Postes de Travail Dédiés</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
            Une interface adaptée au rôle de chaque acteur
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Chaque utilisateur accède à un espace optimisé pour ses responsabilités opérationnelles, avec des permissions strictement cloisonnées.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {OPERATIONAL_SPACES.map((space) => (
            <div
              key={space.role}
              className="flex flex-col sm:flex-row overflow-hidden rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all duration-300 shadow-xl"
            >
              <div className="relative sm:w-2/5 h-44 sm:h-auto min-h-[160px]">
                <Image
                  src={space.image}
                  alt={space.title}
                  fill
                  unoptimized
                  className="object-cover opacity-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent" />
                <div className="absolute top-4 left-4 p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white backdrop-blur-sm">
                  {space.icon}
                </div>
              </div>

              <div className="sm:w-3/5 p-6 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-400 block mb-1 font-mono">
                    {space.role}
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2">{space.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">{space.desc}</p>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                  <span className="font-semibold text-slate-400">{space.stats}</span>
                  <Link
                    href="/login"
                    className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 transition-colors"
                  >
                    <span>Accès</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION APERÇU TARIFS & TRANSPARENCE
      ═══════════════════════════════════════════════ */}
      <section className="py-20 bg-slate-900/40 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 shadow-2xl relative overflow-hidden">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4 font-mono">
                Tarification Transparente
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
                Des forfaits SaaS pensés pour vos flottes de sécurité
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
                À partir de <span className="font-bold text-white">49 000 FCFA / mois</span> pour les agences locales, jusqu'aux forfaits illimités pour les grands réseaux de surveillance et institutions multisites. Facturation certifiée avec TVA et règlement par virement bancaire certifié.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/pricing"
                  className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm border border-slate-700 transition-all flex items-center gap-2"
                >
                  <span>Consulter la grille complète des tarifs (FCFA)</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/demo"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-cyan-950 transition-all flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                  <span>Demander une démo personnalisée</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          SECTION BANNIÈRE CTA FINAL
      ═══════════════════════════════════════════════ */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden text-center p-10 sm:p-16 border border-slate-800 bg-slate-900/90 shadow-2xl">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Instance Opérationnelle Déployée sous 24h</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Prêt à moderniser vos interventions de sécurité ?
            </h2>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Rejoignez les sociétés de sécurité qui optimisent leurs équipes, améliorent leurs délais de réponse et renforcent la confiance de leurs clients avec HOREB SECURE.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/demo"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-sm shadow-xl shadow-cyan-950/60 transition-all hover:scale-105"
              >
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>Demander ma démonstration B2B</span>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-sm border border-slate-700 transition-all"
              >
                <span>Accès Espace Collaborateur / Client</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Global Unifié */}
      <PublicFooter />
    </div>
  );
}

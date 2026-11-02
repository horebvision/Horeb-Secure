'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';
import { AuthService } from '@/modules/auth/auth.service';
import {
  Shield,
  Siren,
  Radio,
  User,
  ShieldAlert,
  Layers,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { NotificationCenter } from '@/components/shared/NotificationCenter';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';
import { OrganizationSwitcher } from '@/components/shared/OrganizationSwitcher';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentRole, setCurrentRole, currentUser, authUser, organization, unreadAlertCount, activeAlert } = useSecuria();

  // Détection autoritaire du statut Super Admin Plateforme vs Admin Entreprise (Tenant)
  const isPlatformAdmin = React.useMemo(() => {
    if (currentRole !== 'ADMIN') return false;
    return isPlatformAdminUser({
      role: currentRole,
      email: authUser?.email || currentUser?.email,
      organizationId: authUser?.organization_id || currentUser?.organization_id,
      isPlatformAdmin: authUser?.is_platform_admin ?? (currentUser as any)?.is_platform_admin,
    });
  }, [currentRole, authUser, currentUser]);

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Fermeture automatique du menu utilisateur lors d'un clic extérieur
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  // Fermeture automatique des tiroirs et menus lors d'un changement de page
  React.useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  const isPilotPage = pathname.startsWith('/pilot');

  const userInitials = React.useMemo(() => {
    if (!currentUser?.full_name || currentUser.full_name === 'Utilisateur') return 'SC';
    const parts = currentUser.full_name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return currentUser.full_name.slice(0, 2).toUpperCase();
  }, [currentUser?.full_name]);

  const handleRoleChange = (role: UserRole) => {
    // Changement de rôle UNIQUEMENT toléré en mode pilote explicite
    if (isPilotPage) {
      setCurrentRole(role);
      if (typeof document !== 'undefined') {
        document.cookie = `securia_role=${role}; path=/; max-age=604800; SameSite=Lax`;
      }
    }
  };

  const handleSignOut = async () => {
    // 1. Afficher l'overlay de déconnexion immédiat pour masquer tout clignotement ou revalidation
    setIsLoggingOut(true);

    // 2. Suppression synchrone immédiate des cookies de session côté navigateur
    if (typeof document !== 'undefined') {
      const cookiesToPurge = ['securia_role', 'sb-access-token', 'sb-refresh-token'];
      cookiesToPurge.forEach((c) => {
        document.cookie = `${c}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      });
      document.cookie.split(';').forEach((cookie) => {
        const name = cookie.split('=')[0].trim();
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
        }
      });
    }

    // 3. Déconnexion via AuthService en parallèle
    try {
      await AuthService.signOut();
    } catch {
      // Ignorer les éventuelles erreurs réseau
    }

    // 4. Redirection propre via l'endpoint serveur qui invalide les cookies HTTP et redirige vers /login
    window.location.replace('/api/auth/signout');
  };

  // Liens de navigation adaptés rigoureusement par rôle
  const navLinks = React.useMemo(() => {
    switch (currentRole) {
      case 'USER':
        return [
          { href: '/dashboard', label: 'Mon Espace' },
          { href: '/client-portal', label: 'Portail Client' },
          { href: '/sites', label: 'Sites Protégés' },
          { href: '/history', label: 'Historique' },
          { href: '/contacts', label: 'Contacts' },
        ];
      case 'SECURITY_MANAGER':
        return [
          { href: '/dispatch', label: 'Dispatch Opérationnel', badge: unreadAlertCount },
          { href: '/secretariat', label: 'Secrétariat' },
          { href: '/dispatch/clients', label: 'Clients' },
          { href: '/dispatch/agents', label: 'Flotte Agents' },
          { href: '/business', label: 'Business OS' },
          { href: '/billing', label: 'Abonnement' },
          { href: '/client-portal', label: 'Portail Client' },
          { href: '/sites', label: 'Sites Protégés' },
          { href: '/history', label: 'Rapports & Audit' },
        ];
      case 'SECRETARY':
        return [
          { href: '/secretariat', label: 'Tableau de bord' },
          { href: '/secretariat/visitors', label: 'Registre Visiteurs' },
          { href: '/secretariat/visitors/new', label: 'Nouvelle Visite' },
          { href: '/secretariat/reports', label: 'Rapports & Audit' },
        ];
      case 'AGENT':
        return [
          { href: '/agent', label: 'Poste Terrain' },
        ];
      case 'ADMIN':
        if (isPlatformAdmin) {
          // Navigation Super Admin Plateforme (SaaS SECURIA Multi-Tenant)
          return [
            { href: '/admin', label: 'Superviseur' },
            { href: '/admin/organizations', label: 'Entreprises' },
            { href: '/admin/business', label: 'Pipeline & Démos' },
            { href: '/admin/billing', label: 'Facturation SaaS' },
            { href: '/dispatch', label: 'Dispatch Global', badge: unreadAlertCount },
            { href: '/secretariat', label: 'Secrétariat' },
            { href: '/business', label: 'Business OS' },
            { href: '/dispatch/clients', label: 'Clients' },
            { href: '/dispatch/agents', label: 'Flotte Agents' },
          ];
        }
        // Navigation Opérationnelle Administrateur Entreprise (ex: Horeb vision)
        return [
          { href: '/dispatch', label: 'Dispatch SOC', badge: unreadAlertCount },
          { href: '/secretariat', label: 'Secrétariat' },
          { href: '/dispatch/clients', label: 'Clients' },
          { href: '/dispatch/agents', label: 'Flotte Agents' },
          { href: '/sites', label: 'Sites Protégés' },
          { href: '/business', label: 'Business OS' },
          { href: '/billing', label: 'Abonnement & Quotas' },
          { href: '/settings/organization', label: 'Paramètres' },
          { href: '/settings/users', label: 'Collaborateurs' },
        ];
      default:
        return [
          { href: '/dashboard', label: 'Mon Espace' },
        ];
    }
  }, [currentRole, isPlatformAdmin, unreadAlertCount]);

  // Route d'atterrissage naturelle selon le rôle réel
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

  const roleOptions: { role: UserRole; label: string; icon: React.ReactNode }[] = [
    {
      role: 'USER',
      label: 'Client',
      icon: <User className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      role: 'SECRETARY',
      label: 'Secrétariat',
      icon: <Building2 className="w-3.5 h-3.5 text-amber-400" />,
    },
    {
      role: 'SECURITY_MANAGER',
      label: 'Centre',
      icon: <Radio className="w-3.5 h-3.5 text-rose-400" />,
    },
    {
      role: 'AGENT',
      label: 'Agent',
      icon: <Shield className="w-3.5 h-3.5 text-cyan-400" />,
    },
    {
      role: 'ADMIN',
      label: 'Super',
      icon: <Layers className="w-3.5 h-3.5 text-purple-400" />,
    },
  ];

  const isAuthPage = 
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/unauthorized');

  const isPublicMarketingPage =
    pathname === '/' ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/request-demo');

  const isLoggedIn = !!currentUser?.id;

  const scrollToAnchor = (id: string, e: React.MouseEvent) => {
    if (pathname === '/') {
      e.preventDefault();
      setMobileMenuOpen(false);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.hash = id;
      }
    } else {
      setMobileMenuOpen(false);
    }
  };

  if (isAuthPage) {
    return null;
  }

  // Navigation unifiée pour toutes les pages publiques marketing (/, /pricing, /demo)
  if (isPublicMarketingPage) {
    return (
      <header className="sticky top-0 z-50 bg-slate-950/90 border-b border-slate-800/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <SecuriaLogo variant="navbar" href="/" priority />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6 text-sm font-semibold">
              <Link
                href="/#features"
                onClick={(e) => scrollToAnchor('features', e)}
                className="text-slate-300 hover:text-white transition-colors"
              >
                Fonctionnalités
              </Link>
              <Link
                href="/#pipeline"
                onClick={(e) => scrollToAnchor('pipeline', e)}
                className="text-slate-300 hover:text-white transition-colors"
              >
                Chaîne d'Intervention
              </Link>
              <Link
                href="/#modules"
                onClick={(e) => scrollToAnchor('modules', e)}
                className="text-slate-300 hover:text-white transition-colors"
              >
                Architecture SOC
              </Link>
              <Link
                href="/pricing"
                className={`transition-colors ${
                  pathname.startsWith('/pricing') ? 'text-cyan-400 font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                Tarifs
              </Link>
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden sm:flex items-center gap-3">
              {isLoggedIn ? (
                <Link
                  href={userHomePath}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Mon Espace ({currentUser?.role})</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium hover:border-slate-700 hover:text-white transition-all"
                >
                  Se connecter
                </Link>
              )}
              <Link
                href="/demo"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-red-950 flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Demander une démo</span>
              </Link>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex md:hidden items-center gap-2">
              <Link
                href="/demo"
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-amber-600 text-white text-xs font-bold shadow-md shadow-red-950"
              >
                Démo
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white focus:outline-none"
                aria-label="Menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-950/98 px-4 py-4 space-y-3 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top duration-200">
            <Link
              href="/#features"
              onClick={(e) => scrollToAnchor('features', e)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-900 transition-colors"
            >
              Fonctionnalités
            </Link>
            <Link
              href="/#pipeline"
              onClick={(e) => scrollToAnchor('pipeline', e)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-900 transition-colors"
            >
              Chaîne d'Intervention
            </Link>
            <Link
              href="/#modules"
              onClick={(e) => scrollToAnchor('modules', e)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-900 transition-colors"
            >
              Architecture SOC
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:bg-slate-900 transition-colors"
            >
              Tarifs &amp; Plans FCFA
            </Link>
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              {isLoggedIn ? (
                <Link
                  href={userHomePath}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-2.5 px-3 rounded-xl bg-slate-800 text-center text-sm font-semibold text-white"
                >
                  Accéder à Mon Espace
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full py-2.5 px-3 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm font-semibold text-slate-300"
                >
                  Se connecter
                </Link>
              )}
              <Link
                href="/demo"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 text-center text-sm font-bold text-white shadow-lg shadow-red-950"
              >
                Demander une démonstration
              </Link>
            </div>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800 backdrop-blur-md">
      <div className="w-full px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-1.5 sm:gap-2 min-w-0">
          {/* Logo & Navigation Principale selon le rôle */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <SecuriaLogo variant="navbar" href="/" priority hideTextOnMobile={true} className="shrink-0" />

            {/* Navigation principale adaptée au rôle réel avec défilement fluide sans overflow */}
            <nav className="hidden md:flex items-center space-x-1 ml-2 lg:ml-4 pl-2 lg:pl-4 border-l border-slate-800 overflow-x-auto no-scrollbar flex-1 min-w-0 py-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    className={`relative px-2 sm:px-2.5 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0 ${
                      isActive
                        ? 'bg-slate-800 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{link.label}</span>
                    {typeof link.badge === 'number' && link.badge > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-red-600 text-white animate-pulse">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Rôle Vérifié & Contrôles Session — TOUJOURS VISIBLES & PRIORITAIRES (shrink-0) */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 ml-auto">
            {/* Organization Switcher & Contexte Multi-Tenant */}
            <div className="shrink-0">
              <OrganizationSwitcher />
            </div>

            {/* Bannière Alerte Active (uniquement sur très grands écrans 2xl) */}
            {activeAlert && (
              <Link
                href={`/alert/${activeAlert.id}`}
                className="hidden 2xl:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-red-950/80 border border-red-500/70 text-red-200 text-xs font-semibold animate-pulse hover:bg-red-900 transition-colors shrink-0"
              >
                <Siren className="w-4 h-4 text-red-400 animate-siren shrink-0" />
                <span>Intervention {activeAlert.alert_number}</span>
              </Link>
            )}

            {/* Badge de Rôle Réel (masqué sur très petit mobile pour protéger la visibilité de la Déconnexion) */}
            {isPilotPage ? (
              // Mode Pilote uniquement : sélecteur interactif réservé au banc d'essai
              <div className="hidden sm:flex items-center bg-slate-900/90 rounded-xl p-1 border border-amber-500/30 shadow-inner shrink-0">
                <span className="text-[10px] text-amber-400 font-bold px-2 hidden lg:inline">
                  PILOTE :
                </span>
                <div className="flex space-x-1">
                  {roleOptions.map((opt) => {
                    const isActive = currentRole === opt.role;
                    return (
                      <button
                        key={opt.role}
                        onClick={() => handleRoleChange(opt.role)}
                        title={`Banc Pilote : ${opt.label}`}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                          isActive
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {opt.icon}
                        <span className="hidden sm:inline">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              // Mode Production Réel : Badge Statut Compact et Visible
              <div className="hidden sm:flex items-center px-2 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner text-xs font-medium shrink-0">
                {currentRole === 'USER' && (
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-emerald-300 font-semibold text-[11px] sm:text-xs">Client</strong>
                  </div>
                )}
                {currentRole === 'SECRETARY' && (
                  <div className="flex items-center gap-1.5 text-amber-400">
                    <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-amber-300 font-semibold text-[11px] sm:text-xs">Secrétariat</strong>
                  </div>
                )}
                {currentRole === 'SECURITY_MANAGER' && (
                  <div className="flex items-center gap-1.5 text-rose-400">
                    <Radio className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-rose-300 font-semibold text-[11px] sm:text-xs">SOC</strong>
                  </div>
                )}
                {currentRole === 'AGENT' && (
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-cyan-300 font-semibold text-[11px] sm:text-xs">Agent</strong>
                  </div>
                )}
                {currentRole === 'ADMIN' && isPlatformAdmin && (
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <Layers className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-purple-300 font-semibold text-[11px] sm:text-xs">Super Admin</strong>
                  </div>
                )}
                {currentRole === 'ADMIN' && !isPlatformAdmin && (
                  <div className="flex items-center gap-1.5 text-indigo-400">
                    <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-slate-400 hidden xl:inline">Rôle :</span>
                    <strong className="text-indigo-300 font-semibold text-[11px] sm:text-xs">Admin</strong>
                  </div>
                )}
              </div>
            )}

            {/* Centre de Notifications Opérationnelles */}
            <div className="shrink-0">
              <NotificationCenter userId={currentUser.id} role={currentRole} />
            </div>

            {/* Bouton de Déconnexion Directe — PERMANENT, ÉCLATANT, TOUJOURS ACCESSIBLE */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              title="Se déconnecter de la session HOREB SECURE"
              aria-label="Se déconnecter de HOREB SECURE"
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border border-red-400/80 text-white font-extrabold text-xs shadow-md shadow-red-950/60 hover:shadow-red-900/80 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="hidden sm:inline font-bold">Déconnexion</span>
            </button>

            {/* Monogramme Utilisateur Interactif avec Menu Déroulant Profil & Déconnexion */}
            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                title={`Profil de ${currentUser.full_name || 'Utilisateur'} — Cliquer pour le menu`}
                aria-label="Menu du compte utilisateur"
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 hover:from-cyan-900 hover:to-blue-900 border border-slate-700 hover:border-cyan-400/60 flex items-center justify-center text-xs font-bold text-white uppercase shadow-sm transition-all cursor-pointer active:scale-95"
              >
                {userInitials}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/90 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3.5 py-2.5 border-b border-slate-800/80">
                    <p className="text-xs font-extrabold text-white truncate">
                      {currentUser.full_name || 'Utilisateur'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {currentUser.email || authUser?.email || ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                        {currentRole}
                      </span>
                      {organization?.name && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                          {organization.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Mon Profil & Coordonnées</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Réglages & Sécurité</span>
                    </Link>
                  </div>

                  <div className="pt-1 mt-1 border-t border-slate-800/80 px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-600 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-400 group-hover:text-white" />
                      <span>Se déconnecter</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton Hamburger Menu Mobile */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu de navigation'}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white md:hidden transition-colors cursor-pointer shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 text-cyan-400" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Menu Déroulant Mobile Complet pour Toutes les Pages et Rôles */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-b border-slate-800 bg-slate-950/98 backdrop-blur-xl px-4 pt-3 pb-5 space-y-4 shadow-2xl animate-in slide-in-from-top-2 duration-200">
          {/* Identité Utilisateur Mobile */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-cyan-500/40 flex items-center justify-center text-xs font-bold text-white uppercase shadow">
                {userInitials}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white max-w-[180px] truncate">{currentUser.full_name || 'Utilisateur'}</span>
                <span className="text-[10px] text-slate-400 max-w-[180px] truncate">{currentUser.email || currentRole}</span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300">
              {currentRole}
            </span>
          </div>

          {/* Navigation Links pour Mobile */}
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-2 pb-1">
              Navigation Rapide
            </div>
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 shadow'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  <span>{link.label}</span>
                  {typeof link.badge === 'number' && link.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Bouton de Déconnexion Mobile Large & Haute Visibilité */}
          <div className="pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-red-950/80 to-rose-950/80 hover:from-red-900 hover:to-rose-900 border border-red-500/40 text-red-200 font-extrabold text-xs shadow-lg shadow-red-950/50 transition-all cursor-pointer active:scale-[0.98]"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span>Se déconnecter de HOREB SECURE</span>
            </button>
          </div>
        </div>
      )}

      {/* Overlay élégant de déconnexion immédiate (élimine tout écran blanc ou clignotement) */}
      {isLoggingOut && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center gap-4 animate-in fade-in duration-150">
          <div className="w-14 h-14 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-center justify-center shadow-2xl shadow-red-950">
            <LogOut className="w-7 h-7 text-red-400 animate-pulse" />
          </div>
          <div className="flex flex-col items-center text-center space-y-1">
            <h3 className="text-base font-extrabold text-white tracking-wide">
              Déconnexion sécurisée de HOREB SECURE...
            </h3>
            <p className="text-xs text-slate-400">
              Révocation de la session et redirection vers la connexion
            </p>
          </div>
          <div className="w-36 h-1 rounded-full bg-slate-800 overflow-hidden mt-1">
            <div className="h-full bg-gradient-to-r from-red-600 to-rose-400 animate-pulse w-full" />
          </div>
        </div>
      )}
    </header>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import {
  Shield,
  LayoutDashboard,
  Building,
  Bell,
  FileCheck2,
  LogOut,
  Radio,
  Menu,
  X,
} from 'lucide-react';
import { AuthService } from '@/modules/auth/auth.service';

interface ClientPortalShellProps {
  children: React.ReactNode;
}

export default function ClientPortalShell({ children }: ClientPortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useSecuria();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    {
      label: 'Tableau de bord',
      href: '/client-portal',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      label: 'Mes Sites',
      href: '/client-portal/sites',
      icon: Building,
    },
    {
      label: 'Mes Alertes',
      href: '/client-portal/alerts',
      icon: Bell,
    },
    {
      label: 'Mes Interventions',
      href: '/client-portal/interventions',
      icon: FileCheck2,
    },
  ];

  const handleLogout = async () => {
    await AuthService.signOut();
    router.push('/login');
  };

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-cyan-500 selection:text-black">
      {/* Navigation supérieure Client */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Marque */}
          <div className="flex items-center space-x-6">
            <Link href="/client-portal" className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-cyan-950">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="font-black text-sm tracking-wider uppercase text-white block leading-none">
                  HOREB SECURE
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-semibold tracking-widest uppercase">
                  Portail Client
                </span>
              </div>
            </Link>

            {/* Navigation Desktop */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      active
                        ? 'bg-slate-800 text-cyan-400 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-850'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Profil & Bouton d'urgence SOS */}
          <div className="hidden sm:flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="py-1.5 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Retourner au bouton panique SOS"
            >
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>Bouton Panique</span>
            </Link>

            <div className="h-5 w-px bg-slate-800 mx-1" />

            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white uppercase">
                {currentUser?.full_name ? currentUser.full_name[0] : 'C'}
              </div>
              <div className="text-left hidden lg:block">
                <span className="text-xs font-bold text-white block leading-tight">
                  {currentUser?.full_name || 'Client Abonné'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono block">
                  Abonnement Certifié
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Bouton Menu Mobile */}
          <div className="flex md:hidden items-center space-x-2">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-rose-950 text-rose-300 border border-rose-800"
              title="SOS"
            >
              <Radio className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl text-slate-300 hover:bg-slate-800"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Menu Déroulant Mobile */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition-colors ${
                    active ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">
                {currentUser?.full_name}
              </span>
              <button
                onClick={handleLogout}
                className="text-xs font-bold text-rose-400 hover:underline flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Contenu de page */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      {/* Pied de page sobre */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>HOREB SECURE V2 • Plateforme de Sécurité & Intervention Rapide</span>
          <span>Données et Preuves d'Intervention Certifiées • Chiffrement 256-bit</span>
        </div>
      </footer>
    </div>
  );
}

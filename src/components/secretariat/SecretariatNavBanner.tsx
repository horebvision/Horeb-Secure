'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { isPlatformAdminUser } from '@/modules/users/types';
import {
  Building2,
  Users,
  UserPlus,
  FileSpreadsheet,
  ArrowLeft,
  Shield,
  Layers,
  Radio,
  LogOut,
  CheckCircle2,
} from 'lucide-react';

export function SecretariatNavBanner() {
  const pathname = usePathname();
  const { currentRole, currentUser, authUser } = useSecuria();

  const isPlatformAdmin = React.useMemo(() => {
    if (currentRole !== 'ADMIN') return false;
    return isPlatformAdminUser({
      role: currentRole,
      email: authUser?.email || currentUser?.email,
      organizationId: authUser?.organization_id || currentUser?.organization_id,
      isPlatformAdmin: authUser?.is_platform_admin ?? (currentUser as any)?.is_platform_admin,
    });
  }, [currentRole, authUser, currentUser]);

  const isSupervisorOrAdmin = currentRole === 'ADMIN' || currentRole === 'SECURITY_MANAGER';

  const exitTarget = React.useMemo(() => {
    if (currentRole === 'ADMIN') {
      return isPlatformAdmin ? '/admin' : '/dispatch';
    }
    if (currentRole === 'SECURITY_MANAGER') {
      return '/dispatch';
    }
    return null;
  }, [currentRole, isPlatformAdmin]);

  const exitLabel = React.useMemo(() => {
    if (currentRole === 'ADMIN') {
      return isPlatformAdmin ? 'Retour Superviseur Plateforme' : 'Retour Dispatch SOC';
    }
    if (currentRole === 'SECURITY_MANAGER') {
      return 'Retour Dispatch SOC';
    }
    return null;
  }, [currentRole, isPlatformAdmin]);

  const tabs = [
    {
      href: '/secretariat',
      label: 'Tableau de bord',
      icon: <Building2 className="w-4 h-4 text-amber-400" />,
      exact: true,
    },
    {
      href: '/secretariat/visitors',
      label: 'Registre Visiteurs',
      icon: <Users className="w-4 h-4" />,
      exact: true,
    },
    {
      href: '/secretariat/visitors/new',
      label: '+ Nouvelle Entrée',
      icon: <UserPlus className="w-4 h-4 text-amber-300" />,
      exact: false,
      highlight: true,
    },
    {
      href: '/secretariat/reports',
      label: 'Rapports & Audit',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      exact: false,
    },
  ];

  return (
    <div className="bg-slate-900/90 border-b border-amber-900/30 backdrop-blur-md sticky top-16 z-40 px-4 sm:px-6 lg:px-8 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Partie Gauche : Badge d'espace & Bouton de sortie immédiat */}
        <div className="flex items-center gap-3 flex-wrap">
          {exitTarget && exitLabel && (
            <Link
              href={exitTarget}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 hover:from-cyan-950 hover:to-slate-800 border border-slate-700 hover:border-cyan-500/60 text-cyan-300 text-xs font-bold transition-all shadow-md group"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>{exitLabel}</span>
            </Link>
          )}

          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-950/40 border border-amber-800/40 text-amber-200">
            <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-bold">Espace Secrétariat &amp; Accueil</span>
            {isPlatformAdmin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40">
                Super Admin
              </span>
            )}
            {!isPlatformAdmin && currentRole === 'ADMIN' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40">
                Admin Entreprise
              </span>
            )}
            {currentRole === 'SECURITY_MANAGER' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40">
                Supervision SOC
              </span>
            )}
            {currentRole === 'SECRETARY' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                Hôte d'Accueil
              </span>
            )}
          </div>
        </div>

        {/* Partie Droite : Liens internes au module Secrétariat */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {tabs.map((tab) => {
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                  tab.highlight
                    ? isActive
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-950'
                      : 'bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-700/50'
                    : isActive
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

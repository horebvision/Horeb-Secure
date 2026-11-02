'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldAlert,
  Building,
  PhoneCall,
  Clock,
  User,
  Settings,
  Building2,
  Users,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react';
import { useSecuria } from '@/lib/store/securia-context';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { currentRole, setCurrentRole, activeAlert } = useSecuria();

  const isSecretariatUser = currentRole === 'SECRETARY';
  const isClientUser = currentRole === 'USER';

  // Masquer la barre mobile basse si l'utilisateur n'est ni Client (USER) ni Secrétaire (SECRETARY)
  if (!isClientUser && !isSecretariatUser) {
    return null;
  }

  const isPublicOrAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/unauthorized') ||
    pathname === '/' ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/request-demo');

  if (isPublicOrAuthPage) {
    return null;
  }

  const isSecretariatPage = pathname.startsWith('/secretariat');

  const secretaryNavItems = [
    {
      href: '/secretariat',
      label: 'Présents',
      icon: <Building2 className="w-5 h-5 text-amber-400" />,
      isActive: pathname === '/secretariat',
    },
    {
      href: '/secretariat/visitors',
      label: 'Registre',
      icon: <Users className="w-5 h-5" />,
      isActive: pathname === '/secretariat/visitors',
    },
    {
      href: '/secretariat/visitors/new',
      label: '+ Entrée',
      icon: <UserPlus className="w-5 h-5 text-amber-300" />,
      isActive: pathname === '/secretariat/visitors/new',
      highlight: true,
      amber: true,
    },
    {
      href: '/secretariat/reports',
      label: 'Rapports',
      icon: <FileSpreadsheet className="w-5 h-5" />,
      isActive: pathname === '/secretariat/reports',
    },
    {
      href: '/profile',
      label: 'Profil',
      icon: <User className="w-5 h-5" />,
      isActive: pathname.startsWith('/profile'),
    },
  ];

  const userNavItems = [
    {
      href: '/dashboard',
      label: 'SOS Alerte',
      icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
      isActive: pathname === '/dashboard' || pathname === '/',
      highlight: true,
      amber: false,
    },
    {
      href: '/sites',
      label: 'Mon Domicile',
      icon: <Building className="w-5 h-5" />,
      isActive: pathname.startsWith('/sites'),
    },
    {
      href: '/contacts',
      label: 'Contacts',
      icon: <PhoneCall className="w-5 h-5" />,
      isActive: pathname.startsWith('/contacts'),
    },
    {
      href: '/alerts',
      label: 'Historique',
      icon: <Clock className="w-5 h-5" />,
      isActive: pathname.startsWith('/alerts') || pathname.startsWith('/history') || pathname.startsWith('/alert/'),
    },
    {
      href: '/profile',
      label: 'Profil',
      icon: <User className="w-5 h-5" />,
      isActive: pathname.startsWith('/profile'),
    },
    {
      href: '/settings',
      label: 'Réglages',
      icon: <Settings className="w-5 h-5" />,
      isActive: pathname.startsWith('/settings'),
    },
  ];

  const navItems = (currentRole === 'SECRETARY' || isSecretariatPage) ? secretaryNavItems : userNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 pb-safe shadow-2xl">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-all ${
                item.isActive
                  ? item.highlight
                    ? (item as any).amber
                      ? 'text-amber-400 font-bold scale-105'
                      : 'text-red-400 font-bold scale-105'
                    : 'text-cyan-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  item.isActive && item.highlight
                    ? (item as any).amber
                      ? 'bg-amber-950/80 border border-amber-500/50 shadow-md shadow-amber-950/60'
                      : 'bg-red-950/80 border border-red-500/50 shadow-md shadow-red-950/60'
                    : item.isActive
                    ? 'bg-cyan-950/60 border border-cyan-500/30'
                    : ''
                }`}
              >
                {item.icon}
              </div>
              <span className="mt-0.5 truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

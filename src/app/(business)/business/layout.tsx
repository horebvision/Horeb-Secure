'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  Clock,
  Shield,
  Building2,
  AlertTriangle,
  TrendingUp,
  FileText,
  KeyRound,
  BookOpen,
} from 'lucide-react';

export default function BusinessSubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/business', label: 'Vue Globale', icon: LayoutDashboard, exact: true },
    { href: '/business/operations', label: 'Opérations', icon: Activity },
    { href: '/business/sla', label: 'SLA Analytics', icon: Clock },
    { href: '/business/agents', label: 'Agents', icon: Shield },
    { href: '/business/sites', label: 'Clients & Sites', icon: Building2 },
    { href: '/business/risk', label: 'Risques & Heatmap', icon: AlertTriangle },
    { href: '/business/finance', label: 'Finance & Marges', icon: TrendingUp },
    { href: '/business/reports', label: 'Rapports', icon: FileText },
    { href: '/business/api-keys', label: 'Clés API', icon: KeyRound },
    { href: '/business/api-docs', label: 'Doc API', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Header secondaire Business OS */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase tracking-wider">
                  Security Business OS
                </span>
                <span className="text-xs text-slate-400">Direction &amp; Pilotage Opérationnel</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1 tracking-tight">
                Centre Analytique &amp; Décisionnel
              </h1>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Données Réelles Temps Réel Certifiées</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar pb-2">
            {tabs.map((tab) => {
              const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {children}
      </main>
    </div>
  );
}

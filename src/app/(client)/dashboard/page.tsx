'use client';

import React from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { PanicButton } from '@/components/client/PanicButton';
import {
  ShieldCheck,
  Building,
  PhoneCall,
  Plus,
  Clock,
  ChevronRight,
  MapPin,
  Lock,
  Layers,
  Radio,
  ArrowRight,
} from 'lucide-react';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';

const ALLOWED_ROLES = ['USER', 'SECURITY_MANAGER', 'ADMIN'] as const;

export default function ClientDashboardPage() {
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);
  const { currentUser, currentRole, sites, activeAlert } = useSecuria();

  // Redirection immédiate des secrétaires vers leur espace dédié
  React.useEffect(() => {
    if (currentRole === 'SECRETARY' || currentUser.role === 'SECRETARY') {
      window.location.replace('/secretariat');
    }
  }, [currentRole, currentUser.role]);

  if (isAuthorized === false || currentRole === 'SECRETARY' || currentUser.role === 'SECRETARY') {
    return null;
  }

  const isSuperAdmin = currentUser.role === 'ADMIN' || currentRole === 'ADMIN';
  const isSocManager = currentUser.role === 'SECURITY_MANAGER' || currentRole === 'SECURITY_MANAGER';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Bannière d'information pour profil Super Admin */}
      {isSuperAdmin && (
        <div className="p-4 rounded-2xl bg-purple-950/70 border border-purple-800/80 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-900/60 text-purple-300 shrink-0 mt-0.5 sm:mt-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Aperçu Espace Client Résident</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                  Super Admin
                </span>
              </div>
              <p className="text-purple-300/80 text-[11px] mt-0.5 leading-relaxed">
                Vous visualisez l'écran d'urgence réservé aux clients finaux (Bouton SOS).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/admin"
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition shadow-md shadow-purple-950 flex items-center gap-1"
            >
              <span>Superviseur</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/admin/organizations"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition border border-slate-700"
            >
              Entreprises
            </Link>
          </div>
        </div>
      )}

      {/* Bannière d'information pour profil Centre SOC */}
      {!isSuperAdmin && isSocManager && (
        <div className="p-4 rounded-2xl bg-rose-950/70 border border-rose-800/80 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-900/60 text-rose-300 shrink-0 mt-0.5 sm:mt-0">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>Aperçu Espace Client Résident</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">
                  Centre SOC
                </span>
              </div>
              <p className="text-rose-300/80 text-[11px] mt-0.5 leading-relaxed">
                Vous visualisez l'écran d'urgence réservé aux clients finaux.
              </p>
            </div>
          </div>
          <Link
            href="/dispatch"
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-md shadow-rose-950 flex items-center gap-1 shrink-0"
          >
            <span>Centre Dispatch SOC</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
      {/* En-tête Client Mobile-First */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-sm uppercase shadow-inner">
            {currentUser.full_name && currentUser.full_name !== 'Utilisateur'
              ? (currentUser.full_name.trim().split(/\s+/).length >= 2
                  ? `${currentUser.full_name.trim().split(/\s+/)[0][0]}${currentUser.full_name.trim().split(/\s+/)[1][0]}`.toUpperCase()
                  : currentUser.full_name.slice(0, 2).toUpperCase())
              : 'SC'}
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white">{currentUser.full_name || 'Client Sécuria'}</h1>
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Abonnement Protection Active 24/7</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/client-portal"
            className="p-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/80 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Portail Client</span>
          </Link>

          <Link
            href="/history"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Historique</span>
          </Link>
        </div>
      </div>

      {/* ZONE CENTRALE : LE BOUTON SOS PROÉMINENT */}
      <div className="p-6 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800/90 shadow-2xl">
        <PanicButton />
      </div>

      {/* Mes Sites Protégés */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Mes Sites Protégés ({sites.length})
            </h3>
          </div>
          <Link
            href="/sites"
            className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <span>Gérer</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {sites.map((site) => (
            <div
              key={site.id}
              className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between"
            >
              <div className="flex items-start space-x-2.5">
                <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-white">{site.name}</span>
                    {site.is_default && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-600/30 text-red-300 border border-red-500/40">
                        Principal
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5">{site.address}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contacts d'Urgence */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <PhoneCall className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Contacts Prévenus en Cas d'Urgence
            </h3>
          </div>
          <Link
            href="/contacts"
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
          >
            <span>Gérer</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2">
          {currentUser.emergency_contacts && currentUser.emergency_contacts.length > 0 ? (
            currentUser.emergency_contacts.map((contact, idx) => (
              <div
                key={(contact as any).id || idx}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-white block">{contact.name}</span>
                  <span className="text-slate-400 text-[11px] block">{contact.relation}</span>
                </div>
                <a
                  href={`tel:${contact.phone}`}
                  className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold text-xs flex items-center gap-1 transition-colors"
                >
                  <PhoneCall className="w-3 h-3 text-emerald-400" />
                  <span>{contact.phone}</span>
                </a>
              </div>
            ))
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400 space-y-2">
              <p>Aucun contact d'urgence configuré.</p>
              <Link
                href="/contacts"
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter mes proches</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

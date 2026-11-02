'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, LogOut, Lock } from 'lucide-react';
import { AuthService } from '@/modules/auth/auth.service';
import { useSecuria } from '@/lib/store/securia-context';
import { type UserRole, isPlatformAdminUser } from '@/modules/users/types';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const required = searchParams.get('required') || 'ADMIN';
  const current = (searchParams.get('current') || 'USER') as UserRole;

  const { currentUser, authUser } = useSecuria();

  const handleSignOut = async () => {
    await AuthService.signOut();
    router.push('/login');
    router.refresh();
  };

  const getDestinationForRole = (role: UserRole) => {
    switch (role) {
      case 'ADMIN': {
        const isPlatform = isPlatformAdminUser({
          role,
          email: currentUser?.email || authUser?.email,
          organizationId: currentUser?.organization_id || authUser?.organization_id,
          isPlatformAdmin: currentUser?.is_platform_admin ?? authUser?.is_platform_admin,
        });
        return isPlatform ? '/admin' : '/dispatch';
      }
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
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-slate-900/80 backdrop-blur-xl border border-rose-500/30 rounded-2xl p-8 shadow-2xl shadow-rose-950/40 text-center">
        {/* Glow effect */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-400 mb-6 shadow-inner">
          <ShieldAlert className="w-10 h-10 animate-pulse" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          Accès Strictement Restreint
        </h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Votre compte ne dispose pas des privilèges de sécurité requis pour accéder à cette interface.
          Toutes les tentatives d’accès non autorisé sont consignées dans les journaux d’audit.
        </p>

        {/* Détails du rôle */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 mb-6 text-left space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Rôle actuel détecté :</span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-rose-300 font-mono font-medium">
              {current}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Habilitation requise :</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono font-medium">
              {required.replace(/,/g, ' ou ')}
            </span>
          </div>
          <div className="flex items-center text-[11px] text-slate-500 gap-1.5 pt-1 border-t border-slate-800/80">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Contrôle d’intégrité exécuté côté serveur et base de données.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href={getDestinationForRole(current)}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition-all shadow-lg shadow-cyan-900/40"
          >
            <ArrowLeft className="w-4 h-4" />
            Retourner à mon espace
          </Link>
          <button
            onClick={handleSignOut}
            type="button"
            className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm border border-slate-700 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Vérification des autorisations...
      </div>
    }>
      <UnauthorizedContent />
    </Suspense>
  );
}

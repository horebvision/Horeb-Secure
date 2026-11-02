'use client';

import React from 'react';
import { GatewayRegistryTable } from '@/components/video/GatewayRegistryTable';
import { Server, Video, Activity, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';

export default function VideoGatewaysPage() {
  const { isAuthorized } = useAuthGuard(['SECURITY_MANAGER', 'ADMIN']);

  if (isAuthorized === false) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dispatch"
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">
                Passerelles Vidéo Edge (Réseaux Clients)
              </h1>
              <p className="text-xs text-slate-400">
                Supervision des boîtiers locaux (Raspberry Pi / NUC) pour la découverte ONVIF et le relais streaming
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dispatch/cameras"
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Video className="w-4 h-4 text-cyan-400" />
            <span>Caméras</span>
          </Link>
          <Link
            href="/dispatch/video-events"
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Activity className="w-4 h-4 text-purple-400" />
            <span>Détections</span>
          </Link>
        </div>
      </div>

      {/* Tableau de bord des passerelles */}
      <GatewayRegistryTable />
    </div>
  );
}

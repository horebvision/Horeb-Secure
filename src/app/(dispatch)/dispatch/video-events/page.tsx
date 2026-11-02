'use client';

import React from 'react';
import { VideoEventsFeed } from '@/components/video/VideoEventsFeed';
import { Activity, Video, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';

export default function VideoEventsPage() {
  const { isAuthorized } = useAuthGuard(['SECURITY_MANAGER', 'ADMIN']);

  if (isAuthorized === false) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
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
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">
                Journal Technique des Détections Vidéo
              </h1>
              <p className="text-xs text-slate-400">
                Traçabilité des événements analytiques, de l'idempotence et des corrélations d'alertes
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
            <span>Registre Caméras</span>
          </Link>
        </div>
      </div>

      {/* Feed des événements */}
      <VideoEventsFeed />
    </div>
  );
}

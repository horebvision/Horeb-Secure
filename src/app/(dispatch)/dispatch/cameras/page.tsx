'use client';

import React, { useState } from 'react';
import { CameraRegistryTable } from '@/components/video/CameraRegistryTable';
import { SocVideoCommandCenter } from '@/components/video/SocVideoCommandCenter';
import { Video, ShieldCheck, Activity, ArrowLeft, Server, Radio, Table } from 'lucide-react';
import Link from 'next/link';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';

export default function CamerasPage() {
  const { isAuthorized } = useAuthGuard(['SECURITY_MANAGER', 'ADMIN']);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'REGISTRY'>('LIVE');

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
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">
                Supervision Vidéo & Caméras IP
              </h1>
              <p className="text-xs text-slate-400">
                Centre de commandement SOC et registre des caméras physiques raccordées aux passerelles Edge
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dispatch/video-gateways"
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Server className="w-4 h-4 text-purple-400" />
            <span>Passerelles Edge</span>
          </Link>
          <Link
            href="/dispatch/video-events"
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Journal des Détections</span>
          </Link>
        </div>
      </div>

      {/* Sélecteur d'onglets : Centre Live vs Registre */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('LIVE')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'LIVE'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-lg'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span>Centre de Télésurveillance (LIVE)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REGISTRY')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'REGISTRY'
              ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-lg'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Table className="w-3.5 h-3.5 text-slate-400" />
          <span>Registre des Équipements</span>
        </button>
      </div>

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'LIVE' ? <SocVideoCommandCenter /> : <CameraRegistryTable />}
    </div>
  );
}

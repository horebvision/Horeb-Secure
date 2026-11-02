'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TacticalDispatchMap } from '@/components/dispatch/DynamicTacticalMap';
import { CreateSiteModal } from '@/components/dispatch/CreateSiteModal';
import {
  ArrowLeft,
  Radio,
  Car,
  MapPin,
  ShieldAlert,
  Clock,
  Navigation,
  RefreshCw,
  Layers,
  ChevronRight,
  Plus,
  Building,
} from 'lucide-react';
import { useSecuria } from '@/lib/store/securia-context';

export default function DispatchMapConsolePage() {
  const { alerts, agents } = useSecuria();
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateSiteOpen, setIsCreateSiteOpen] = useState(false);
  const [customFocusedCoords, setCustomFocusedCoords] = useState<[number, number] | null>(null);

  const activeAlerts = alerts.filter(
    (a) => !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
  );

  const focusedCoords: [number, number] | null =
    customFocusedCoords ||
    (selectedAlert && selectedAlert.latitude && selectedAlert.longitude
      ? [selectedAlert.latitude, selectedAlert.longitude]
      : null);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-950 text-white overflow-hidden p-4 space-y-3">
      {/* Barre Supérieure Console Tactique */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl shrink-0">
        <div className="flex items-center space-x-3">
          <Link
            href="/dispatch"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Tableau de bord</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-sm font-black uppercase tracking-wider text-white">
              Console Tactique Cartographique (SOC)
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setIsCreateSiteOpen(true)}
            className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-all"
            title="Ajouter un nouveau site protégé avec coordonnées GPS"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Site</span>
          </button>

          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950 border border-cyan-800 px-2.5 py-1 rounded-full hidden sm:inline-block">
            🛰️ Flux GNSS/GPS Chiffré • Sécurité Restreinte
          </span>
        </div>
      </div>

      {/* Disposition Principale : Panneau Latéral + Carte Plein Écran */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 min-h-0 overflow-hidden">
        {/* Panneau Latéral Gauche : File des incidents et patrouilles (1/4 largeur) */}
        <div className="lg:col-span-1 flex flex-col space-y-3 min-h-0 overflow-y-auto pr-1">
          {/* Incidents en cours */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Incidents Actifs ({activeAlerts.length})</span>
              </span>
            </div>

            <div className="space-y-2">
              {activeAlerts.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Aucun incident actif sur le secteur.
                </div>
              ) : (
                activeAlerts.map((alert) => {
                  const isSelected = selectedAlert?.id === alert.id;
                  return (
                    <div
                      key={alert.id}
                      onClick={() => {
                        setSelectedAlert(alert);
                        setCustomFocusedCoords(null);
                      }}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer text-xs space-y-1 ${
                        isSelected
                          ? 'bg-red-950/60 border-red-500 shadow-md ring-1 ring-red-400'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-red-300">
                          {alert.alert_number}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-900 text-white">
                          {alert.priority}
                        </span>
                      </div>
                      <div className="text-white font-semibold truncate">{alert.type}</div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                        <span>{alert.location_address || 'Position GPS'}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Patrouilleurs en service */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
            <span className="text-xs font-extrabold uppercase text-slate-300 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-cyan-400" />
              <span>Patrouilles Déployées ({agents.length})</span>
            </span>

            <div className="space-y-1.5">
              {agents.map((ag) => {
                const agAny = ag as any;
                const agName =
                  ag.full_name ||
                  agAny.user?.full_name ||
                  agAny.users?.full_name ||
                  agAny.agent_name ||
                  `Agent ${ag.badge_number || 'AGT'}`;

                return (
                  <div
                    key={ag.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white block">{agName}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {ag.badge_number || 'AGT-7501'} • {ag.agent_status || ag.duty_status || 'AVAILABLE'}
                      </span>
                    </div>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        ag.agent_status === 'AVAILABLE'
                          ? 'bg-emerald-400'
                          : ag.agent_status === 'DISPATCHED'
                          ? 'bg-cyan-400 animate-pulse'
                          : 'bg-amber-400'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Console Cartographique Plein Écran (3/4 largeur) */}
        <div className="lg:col-span-3 h-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
          <TacticalDispatchMap
            focusedAlertId={selectedAlert?.id}
            focusedCoordinates={focusedCoords}
            height="100%"
          />
        </div>
      </div>

      {/* Modal Création de Site */}
      <CreateSiteModal
        isOpen={isCreateSiteOpen}
        onClose={() => setIsCreateSiteOpen(false)}
        onSiteCreated={(site) => {
          if (site.latitude && site.longitude) {
            setCustomFocusedCoords([site.latitude, site.longitude]);
          }
        }}
      />
    </div>
  );
}

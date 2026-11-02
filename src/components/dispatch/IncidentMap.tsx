'use client';

import React, { useState } from 'react';
import { Alert } from '@/lib/types/securia';
import { TacticalDispatchMap } from '@/components/dispatch/DynamicTacticalMap';
import { MapPin, Navigation, Maximize2, Plus, Building } from 'lucide-react';
import Link from 'next/link';
import { CreateSiteModal } from '@/components/dispatch/CreateSiteModal';

interface IncidentMapProps {
  alerts: Alert[];
  selectedAlertId?: string;
  onSelectAlert?: (alert: Alert) => void;
}

export function IncidentMap({ alerts, selectedAlertId, onSelectAlert }: IncidentMapProps) {
  const [isCreateSiteOpen, setIsCreateSiteOpen] = useState(false);
  const [customFocusedCoords, setCustomFocusedCoords] = useState<[number, number] | null>(null);

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId);
  const focusedCoords: [number, number] | null =
    customFocusedCoords ||
    (selectedAlert && selectedAlert.latitude && selectedAlert.longitude
      ? [selectedAlert.latitude, selectedAlert.longitude]
      : null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">
            Cartographie Tactique Opérationnelle (Leaflet Production)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateSiteOpen(true)}
            className="py-1 px-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-all"
            title="Ajouter un nouveau site protégé avec coordonnées GPS"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouveau Site</span>
          </button>

          <Link
            href="/dispatch/map"
            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors py-1 px-2 rounded-xl bg-slate-900 border border-slate-800"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Console Plein Écran</span>
          </Link>
        </div>
      </div>

      {/* Carte Leaflet temps réel avec sites, patrouilles, vecteurs et géofencing */}
      <TacticalDispatchMap
        focusedAlertId={selectedAlertId}
        focusedCoordinates={focusedCoords}
        height="440px"
      />

      {/* Modale d'ajout de site immédiat pour le SOC */}
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

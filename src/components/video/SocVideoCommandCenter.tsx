'use client';

import React, { useState, useEffect } from 'react';
import { VideoCamera, VideoGateway } from '@/lib/video/types';
import { CameraPreview } from './CameraPreview';
import { CameraStatusBadge } from './CameraStatusBadge';
import {
  Video,
  VideoOff,
  Building,
  Server,
  RefreshCw,
  Radio,
  Clock,
  Shield,
  Activity,
  Layers,
  Info,
  Maximize2,
  Cpu,
  HardDrive,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface SiteOption {
  id: string;
  name: string;
  address?: string;
}

export function SocVideoCommandCenter() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [cameras, setCameras] = useState<VideoCamera[]>([]);
  const [gateways, setGateways] = useState<VideoGateway[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<VideoCamera | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 1. Chargement des sites et passerelles
  useEffect(() => {
    async function init() {
      setLoadingSites(true);
      try {
        const [sitesRes, gwRes] = await Promise.all([
          authFetch('/api/sites'),
          authFetch('/api/video/gateways'),
        ]);

        if (sitesRes.ok) {
          const s = await sitesRes.json();
          const list: SiteOption[] = s.sites || [];
          setSites(list);
          if (list.length > 0 && !selectedSiteId) {
            setSelectedSiteId(list[0].id);
          }
        }

        if (gwRes.ok) {
          const g = await gwRes.json();
          setGateways(g.gateways || []);
        }
      } catch (err) {
        console.warn('Erreur chargement SOC Command Center:', err);
      } finally {
        setLoadingSites(false);
      }
    }
    init();
  }, [refreshTrigger]);

  // 2. Chargement des caméras du site sélectionné
  useEffect(() => {
    if (!selectedSiteId) {
      setCameras([]);
      setSelectedCamera(null);
      return;
    }

    async function loadSiteCameras() {
      setLoadingCameras(true);
      try {
        const res = await authFetch(`/api/video/cameras?site_id=${selectedSiteId}`);
        if (res.ok) {
          const data = await res.json();
          const list: VideoCamera[] = data.cameras || [];
          setCameras(list);
          if (list.length > 0) {
            // Sélection automatique de la caméra principale ou de la première
            const primary = list.find((c) => c.is_primary) || list[0];
            setSelectedCamera(primary);
          } else {
            setSelectedCamera(null);
          }
        }
      } catch (err) {
        console.warn('Erreur chargement caméras du site:', err);
      } finally {
        setLoadingCameras(false);
      }
    }

    loadSiteCameras();
  }, [selectedSiteId, refreshTrigger]);

  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const associatedGateway = gateways.find(
    (g) => g.id === selectedCamera?.gateway_id || g.protected_site_id === selectedSiteId
  );

  return (
    <div className="space-y-6">
      {/* Barre de contrôle du SOC : Sélecteur de Site */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              <span>POSTE DE TÉLÉSURVEILLANCE EN DIRECT</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                TEMPS RÉEL
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Visualisation WebRTC sub-seconde des flux caméras raccordés aux passerelles Edge
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-1.5">
            <Building className="w-4 h-4 text-cyan-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setRefreshTrigger((k) => k + 1)}
            disabled={loadingCameras}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Rafraîchir les flux"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCameras ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grille principale : Caméra en direct + Inspecteur technique */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche/centrale : Lecteur Live (2/3 de largeur) */}
        <div className="lg:col-span-2 space-y-4">
          {selectedCamera ? (
            <CameraPreview
              key={selectedCamera.id}
              camera={selectedCamera}
              autoConnect={true}
              onRefreshStatus={() => setRefreshTrigger((k) => k + 1)}
            />
          ) : (
            <div className="aspect-video w-full bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
                <VideoOff className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">Aucune caméra sélectionnée</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                {cameras.length === 0
                  ? 'Ce site ne comporte aucun équipement caméra dans le registre.'
                  : 'Sélectionnez une caméra dans la liste latérale pour démarrer le flux.'}
              </p>
            </div>
          )}

          {/* Carrousel des caméras du site */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Caméras sur le site ({cameras.length})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cameras.map((cam) => {
                const isSelected = selectedCamera?.id === cam.id;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setSelectedCamera(cam)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/50 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1.5">
                      <span className="font-mono text-[10px] text-slate-400">{cam.internal_id}</span>
                      <CameraStatusBadge status={cam.status} size="sm" />
                    </div>
                    <span className="text-xs font-bold text-white truncate w-full">{cam.name}</span>
                    <span className="text-[10px] text-slate-500 truncate mt-0.5">
                      {cam.location_description || cam.protocol}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Colonne droite : Fiche d'Inspection Technique SOC (Section 10) */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <Shield className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
                PARAMÈTRES DU CANAL SOC
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Site Protégé</span>
                <p className="font-bold text-slate-200 text-sm mt-0.5">{selectedSite?.name || 'Non défini'}</p>
                {selectedSite?.address && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedSite.address}</p>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Caméra Sélectionnée</span>
                <p className="font-bold text-cyan-300 text-sm mt-0.5">
                  {selectedCamera ? selectedCamera.name : 'Aucune'}
                </p>
                {selectedCamera && (
                  <span className="inline-block mt-1 font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                    ID: {selectedCamera.internal_id} • {selectedCamera.protocol}
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Passerelle Edge (Gateway)</span>
                {associatedGateway ? (
                  <div className="mt-1 p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-300">{associatedGateway.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {associatedGateway.gateway_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Statut : {associatedGateway.status}</span>
                      <span>• v{associatedGateway.version}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 italic mt-0.5">Aucune passerelle associée</p>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Dernier Heartbeat</span>
                <p className="font-mono text-slate-300 mt-0.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {associatedGateway?.last_heartbeat_at
                    ? new Date(associatedGateway.last_heartbeat_at).toLocaleTimeString('fr-FR')
                    : 'En attente'}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">État du Flux (Stream Status)</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-bold text-emerald-400 font-mono text-xs px-2 py-1 rounded bg-emerald-950/60 border border-emerald-500/30">
                    {selectedCamera?.status === 'ONLINE' ? 'LIVE (WebRTC)' : 'NON CONFIGURÉ'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

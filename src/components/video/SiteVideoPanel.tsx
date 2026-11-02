'use client';

import React, { useState, useEffect } from 'react';
import { VideoCamera, CameraStatus } from '@/lib/video/types';
import { CameraPreview } from './CameraPreview';
import { CameraStatusBadge } from './CameraStatusBadge';
import {
  Video,
  VideoOff,
  Plus,
  RefreshCw,
  Sliders,
  Shield,
  Layers,
  Info,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import Link from 'next/link';

interface SiteVideoPanelProps {
  siteId?: string | null;
  siteName?: string;
  onCameraSelect?: (camera: VideoCamera) => void;
  className?: string;
}

export function SiteVideoPanel({
  siteId,
  siteName,
  onCameraSelect,
  className = '',
}: SiteVideoPanelProps) {
  const [cameras, setCameras] = useState<VideoCamera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<VideoCamera | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Chargement des caméras associées à ce site
  useEffect(() => {
    let isCancelled = false;

    async function loadCameras() {
      if (!siteId) {
        setCameras([]);
        setSelectedCamera(null);
        return;
      }

      setLoading(true);
      try {
        const res = await authFetch(`/api/video/cameras?site_id=${siteId}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            const list: VideoCamera[] = data.cameras || [];
            setCameras(list);

            // Sélectionne automatiquement la caméra principale ou la première
            if (list.length > 0) {
              const primary = list.find((c) => c.is_primary) || list[0];
              setSelectedCamera(primary);
              if (onCameraSelect) onCameraSelect(primary);
            } else {
              setSelectedCamera(null);
            }
          }
        }
      } catch (err) {
        console.warn('[SiteVideoPanel] Erreur chargement caméras du site:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    loadCameras();
    return () => {
      isCancelled = true;
    };
  }, [siteId, refreshKey, onCameraSelect]);

  const handleSelect = (cam: VideoCamera) => {
    setSelectedCamera(cam);
    if (onCameraSelect) onCameraSelect(cam);
  };

  const handleTestConnection = async (cameraId: string) => {
    try {
      const res = await authFetch(`/api/video/cameras/${cameraId}/test`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Mise à jour de l'état local
        setCameras((prev) =>
          prev.map((c) => (c.id === cameraId ? { ...c, status: data.status, last_seen_at: data.checked_at } : c))
        );
        if (selectedCamera?.id === cameraId) {
          setSelectedCamera((prev) => (prev ? { ...prev, status: data.status } : null));
        }
      }
    } catch (err) {
      console.warn('[SiteVideoPanel] Échec test connectivité:', err);
    }
  };

  return (
    <div className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl ${className}`}>
      {/* En-tête du Panneau */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
            VIDÉO DU SITE {siteName ? `• ${siteName}` : ''}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Rafraîchir les équipements vidéo"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Link
            href="/dispatch/cameras"
            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors py-1 px-2 rounded-lg bg-slate-800 border border-slate-700/60"
            title="Gérer les caméras dans le registre"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Registre</span>
          </Link>
        </div>
      </div>

      {/* Cas 1 : Aucun site sélectionné */}
      {!siteId && (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-2">
            <Info className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-400">Sélectionnez un site ou une alerte</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Le SOC affichera les caméras périmétriques rattachées.
          </p>
        </div>
      )}

      {/* Cas 2 : Site sélectionné mais aucune caméra connectée (Strictement Zéro Fausse Vidéo) */}
      {siteId && !loading && cameras.length === 0 && (
        <div className="py-8 px-4 flex flex-col items-center justify-center text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2">
            <VideoOff className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-300">Aucune caméra connectée</p>
          <p className="text-[11px] text-slate-500 max-w-xs mt-1">
            Ce site protégé ne possède actuellement aucun équipement vidéo ou NVR rattaché.
          </p>
          <Link
            href="/dispatch/cameras"
            className="mt-3 py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-950"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Associer une caméra</span>
          </Link>
        </div>
      )}

      {/* Cas 3 : Liste des caméras du site & Aperçu */}
      {siteId && cameras.length > 0 && (
        <div className="space-y-4">
          {/* Sélecteur horizontal de caméras */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>CAMÉRAS DU SITE ({cameras.length})</span>
              <span className="text-emerald-400 font-normal">
                {cameras.filter((c) => c.status === 'ONLINE').length} en ligne
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {cameras.map((cam) => {
                const isSelected = selectedCamera?.id === cam.id;
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => handleSelect(cam)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/50 shadow-md shadow-cyan-950/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          cam.status === 'ONLINE'
                            ? 'bg-emerald-400'
                            : cam.status === 'OFFLINE'
                            ? 'bg-rose-500'
                            : 'bg-amber-400'
                        }`}
                      />
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-200 truncate">{cam.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{cam.location_description || cam.internal_id}</p>
                      </div>
                    </div>

                    <CameraStatusBadge status={cam.status} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visualisation de la caméra sélectionnée */}
          {selectedCamera && (
            <CameraPreview
              camera={selectedCamera}
              onRefreshStatus={() => handleTestConnection(selectedCamera.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

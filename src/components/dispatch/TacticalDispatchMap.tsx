'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Shield,
  Car,
  AlertTriangle,
  MapPin,
  Layers,
  Compass,
  Maximize2,
  Clock,
  Radio,
  Key,
  Phone,
  Navigation,
  Video,
  Building,
  X,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { getBrowserClient } from '@/lib/supabase/client';
import { fetchRoadRoute } from '@/lib/geo/geo-engine';
import { authFetch } from '@/lib/utils/api-client';
import { useSecuria } from '@/lib/store/securia-context';

interface TacticalDispatchMapProps {
  focusedAlertId?: string | null;
  focusedCoordinates?: [number, number] | null;
  recommendedAgentId?: string | null;
  height?: string;
  className?: string;
  refreshTrigger?: number | string;
  onSiteClick?: (site: any) => void;
}

export function TacticalDispatchMap({
  focusedAlertId,
  focusedCoordinates,
  recommendedAgentId,
  height = '500px',
  className = '',
  refreshTrigger,
  onSiteClick,
}: TacticalDispatchMapProps) {
  const { authUser } = useSecuria();
  const organizationId = authUser?.organization_id || null;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    sitesGroup: L.LayerGroup;
    agentsGroup: L.LayerGroup;
    camerasGroup: L.LayerGroup;
    vectorsGroup: L.LayerGroup;
    geofenceGroup: L.LayerGroup;
    clientDevicesGroup: L.LayerGroup;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState<any>(null);
  const [recommendation, setRecommendation] = useState<any | null>(null);
  const [quickNavOpen, setQuickNavOpen] = useState<'sites' | 'agents' | null>(null);
  const [activeLayers, setActiveLayers] = useState({
    sites: true,
    agents: true,
    cameras: true,
    interventions: true,
    geofence: true,
  });

  // Chargement de la recommandation Smart Dispatch pour l'alerte active
  useEffect(() => {
    if (!focusedAlertId) {
      setRecommendation(null);
      return;
    }
    let isCancelled = false;
    const loadRec = async () => {
      try {
        const res = await authFetch(`/api/dispatch/recommendation?alert_id=${focusedAlertId}`);
        if (res.ok && !isCancelled) {
          const json = await res.json();
          setRecommendation(json);
        }
      } catch (err) {
        console.warn('[TacticalMap] Erreur chargement recommandation dispatch:', err);
      }
    };
    loadRec();
    return () => {
      isCancelled = true;
    };
  }, [focusedAlertId]);

  // 1. Chargement des données cartographiques sécurisées
  const fetchMapData = async () => {
    try {
      const res = await authFetch('/api/dispatch/map-data');
      if (res.ok) {
        const json = await res.json();
        setMapData(json);
      }
    } catch (err) {
      console.error('[TacticalMap] Erreur chargement map-data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMapData();

    // Écoute immédiate des événements de création, modification ou suppression de site
    const handleSiteSync = (e?: Event) => {
      fetchMapData();
      const customEv = e as CustomEvent;
      if (customEv?.detail && mapInstanceRef.current) {
        const lat = Number(customEv.detail.latitude);
        const lon = Number(customEv.detail.longitude);
        if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
          mapInstanceRef.current.flyTo([lat, lon], 15, { animate: true, duration: 1.2 });
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('securia:site_created', handleSiteSync);
      window.addEventListener('securia:site_updated', handleSiteSync);
      window.addEventListener('securia:site_deleted', handleSiteSync);
      window.addEventListener('securia:refresh_map', handleSiteSync);
      window.addEventListener('securia:agent_location_updated', handleSiteSync);
    }

    // Connexion WebSocket Supabase Realtime (Sub-seconde pour tracking patrouilles & alertes)
    const supabase = getBrowserClient();
    // Canal de tracking cloisonné par organisation (jamais de canal global inter-tenants)
    const trackingChannel = supabase.channel(organizationId ? `realtime_tracking:${organizationId}` : `realtime_tracking:none`);
    trackingChannel.on('broadcast', { event: 'agent_location' }, (payload: any) => {
      const data = payload?.payload;
      if (!data) return;

      setMapData((prev: any) => {
        if (!prev || !prev.agents) return prev;
        const exists = prev.agents.some((ag: any) => ag.id === data.agent_id || ag.badge_number === data.badge_number);
        if (!exists) {
          fetchMapData();
          return prev;
        }
        return {
          ...prev,
          agents: prev.agents.map((ag: any) => {
            if (ag.id === data.agent_id || ag.badge_number === data.badge_number) {
              return {
                ...ag,
                latitude: data.latitude,
                longitude: data.longitude,
                current_latitude: data.latitude,
                current_longitude: data.longitude,
                duty_status: data.duty_status || ag.duty_status,
                last_location_update: data.timestamp || new Date().toISOString(),
                has_gps: true,
                is_at_base: false,
              };
            }
            return ag;
          }),
        };
      });
    });
    trackingChannel.subscribe();

    // Changements d'alertes via postgres_changes : filtrés par les politiques RLS du tenant
    const alertsChannel = supabase.channel(`map_alerts_${organizationId || 'none'}`);
    alertsChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
      fetchMapData();
    });
    alertsChannel.subscribe();

    // Filet de sécurité : alertes et positions arrivent déjà en temps réel. 30 s au lieu de 10 s,
    // suspendu quand l'onglet est masqué (écran SOC en arrière-plan = aucune requête).
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchMapData();
    }, 30000);

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('securia:site_created', handleSiteSync);
        window.removeEventListener('securia:site_updated', handleSiteSync);
        window.removeEventListener('securia:site_deleted', handleSiteSync);
        window.removeEventListener('securia:refresh_map', handleSiteSync);
        window.removeEventListener('securia:agent_location_updated', handleSiteSync);
      }
      try {
        supabase.removeChannel(trackingChannel);
        supabase.removeChannel(alertsChannel);
      } catch (e) {}
    };
  }, [refreshTrigger, organizationId]);

  // 2. Initialisation de la carte Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Création de la carte avec centre sur la Côte d'Ivoire (Abidjan) par défaut
    const map = L.map(mapContainerRef.current, {
      center: [5.3484, -4.0305],
      zoom: 12,
      minZoom: 6,
      maxBounds: [
        [4.0, -9.0],
        [11.0, -2.5],
      ],
      maxBoundsViscosity: 0.9,
      zoomControl: false,
    });

    // 1. Fond de carte Sombre Tactique (ESRI World Dark Gray Canvas - Idéal SOC / Salle de crise, sans clé requise)
    const esriDarkBase = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, OpenStreetMap contributors',
        maxNativeZoom: 16,
        maxZoom: 19,
      }
    );

    const esriDarkRef = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '',
        maxNativeZoom: 16,
        maxZoom: 19,
      }
    );

    const tacticalDarkGroup = L.layerGroup([esriDarkBase, esriDarkRef]).addTo(map);

    // 2. Fond de carte OpenStreetMap Standard (Public & Sans restriction)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });

    // 3. Fond de carte Satellite Haute Résolution (ESRI World Imagery)
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics',
        maxNativeZoom: 18,
        maxZoom: 19,
      }
    );

    // Contrôles en haut à droite : Sélecteur de couches & Zoom
    L.control
      .layers(
        {
          '🌙 Tactique Sombre': tacticalDarkGroup,
          '🗺️ OpenStreetMap': osmLayer,
          '🛰️ Satellite': satelliteLayer,
        },
        undefined,
        { position: 'topright' }
      )
      .addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Groupes de couches
    const sitesGroup = L.layerGroup().addTo(map);
    const agentsGroup = L.layerGroup().addTo(map);
    const camerasGroup = L.layerGroup().addTo(map);
    const vectorsGroup = L.layerGroup().addTo(map);
    const geofenceGroup = L.layerGroup().addTo(map);
    const clientDevicesGroup = L.layerGroup().addTo(map);

    layersRef.current = {
      sitesGroup,
      agentsGroup,
      camerasGroup,
      vectorsGroup,
      geofenceGroup,
      clientDevicesGroup,
    };

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 3. Rendu des couches tactiques (Sites, Agents, Vecteurs, Appareils Clients)
  useEffect(() => {
    if (!mapInstanceRef.current || !layersRef.current || !mapData) return;

    const { sitesGroup, agentsGroup, camerasGroup, vectorsGroup, geofenceGroup, clientDevicesGroup } = layersRef.current;

    // Nettoyage des anciennes couches
    sitesGroup.clearLayers();
    agentsGroup.clearLayers();
    camerasGroup.clearLayers();
    vectorsGroup.clearLayers();
    geofenceGroup.clearLayers();
    clientDevicesGroup.clearLayers();

    // A. COUCHE SITES PROTÉGÉS (Avec Dispersion / Spiderfy des sites à la même adresse)
    if (activeLayers.sites && mapData.sites) {
      const validSites = (mapData.sites || []).filter((s: any) => {
        const lat = Number(s.latitude);
        const lon = Number(s.longitude);
        return !isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0);
      });

      // Regrouper les sites par proximité immédiate (< 0.0008 degrés ~ 90m)
      const clusters: { center: [number, number]; sites: any[] }[] = [];
      validSites.forEach((site: any) => {
        const sLat = Number(site.latitude);
        const sLon = Number(site.longitude);
        let foundCluster = clusters.find((c) => {
          const dLat = Math.abs(c.center[0] - sLat);
          const dLon = Math.abs(c.center[1] - sLon);
          return dLat < 0.0008 && dLon < 0.0008;
        });
        if (foundCluster) {
          foundCluster.sites.push(site);
        } else {
          clusters.push({ center: [sLat, sLon], sites: [site] });
        }
      });

      clusters.forEach((cluster) => {
        const count = cluster.sites.length;
        const isMulti = count > 1;

        // Si plusieurs sites sont superposés au même point cadastral, afficher un repère central de complexe
        if (isMulti) {
          const anchorIcon = L.divIcon({
            className: 'tactical-cluster-anchor',
            html: `
              <div class="px-2 py-0.5 rounded-full bg-cyan-950/95 border-2 border-cyan-400 text-cyan-200 text-[10px] font-black shadow-xl flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform">
                <span>🏢</span>
                <span>${count} sites groupés</span>
              </div>
            `,
            iconSize: [110, 26],
            iconAnchor: [55, 13],
          });
          const anchorMarker = L.marker(cluster.center, { icon: anchorIcon, zIndexOffset: -100 });
          anchorMarker.on('click', () => {
            mapInstanceRef.current?.setView(cluster.center, 16);
          });
          sitesGroup.addLayer(anchorMarker);

          const anchorCircle = L.circle(cluster.center, {
            radius: 50,
            color: '#38bdf8',
            fillColor: '#0284c7',
            fillOpacity: 0.15,
            weight: 1.5,
            dashArray: '3, 3',
          });
          sitesGroup.addLayer(anchorCircle);
        }

        cluster.sites.forEach((site: any, idx: number) => {
          let lat = Number(site.latitude);
          let lon = Number(site.longitude);

          if (isMulti) {
            // Dispersion géométrique en rosace : chaque site a sa propre position visible même à zoom moyen
            const angle = (idx * 2 * Math.PI) / count - Math.PI / 2;
            const radiusDeg = 0.0016; // ~175 mètres de décalage visuel net
            lat = cluster.center[0] + radiusDeg * Math.cos(angle);
            lon = cluster.center[1] + (radiusDeg * 1.15) * Math.sin(angle);

            // Cordon de liaison reliant l'adresse au marqueur déployé
            const tether = L.polyline([cluster.center, [lat, lon]], {
              color: '#38bdf8',
              weight: 2,
              opacity: 0.85,
              dashArray: '3, 4',
            });
            sitesGroup.addLayer(tether);
          }

          const hasAlarm = site.has_active_alert;

          // Marqueur stylisé haute définition avec étiquette du site
          const siteIcon = L.divIcon({
            className: 'tactical-site-icon',
            html: `
              <div class="relative flex flex-col items-center justify-center cursor-pointer group">
                ${
                  hasAlarm
                    ? `<span class="absolute w-8 h-8 rounded-full bg-red-500/40 animate-ping"></span>
                       <div class="relative w-8 h-8 rounded-2xl bg-red-600 border-2 border-white shadow-lg shadow-red-950 flex items-center justify-center text-white">
                         <svg class="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                         </svg>
                       </div>`
                    : `<div class="w-7 h-7 rounded-2xl bg-blue-950/95 border-2 border-cyan-400 shadow-lg shadow-cyan-950/60 flex items-center justify-center text-cyan-300 hover:scale-110 transition-transform">
                         <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                         </svg>
                       </div>`
                }
                <div class="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700/80 text-white font-extrabold text-[9px] whitespace-nowrap shadow-md pointer-events-none">
                  ${site.name}
                </div>
              </div>
            `,
            iconSize: [60, 52],
            iconAnchor: [30, 20],
            popupAnchor: [0, -20],
          });

          const marker = L.marker([lat, lon], { icon: siteIcon });
          marker.on('click', () => onSiteClick?.(site));

          // Popup interactif d'intervention
          const popupContent = `
            <div class="p-1 max-w-[260px] text-slate-100 font-sans">
              ${
                isMulti
                  ? `<div class="p-1.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-200 text-[10px] font-semibold mb-2">
                       🏢 Complexe partagé (${count} sites répertoriés à cette adresse)
                     </div>`
                  : ''
              }
              <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700">
                <span class="font-extrabold text-xs ${hasAlarm ? 'text-red-400' : 'text-cyan-300'}">
                  ${hasAlarm ? '🚨 ALERTE EN COURS' : '🛡️ Site Protégé'}
                </span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono font-bold">
                  ${site.site_type}
                </span>
              </div>
              <div class="space-y-1 text-xs">
                <div class="font-bold text-white text-sm">${site.name}</div>
                <div class="text-slate-400 text-[11px]">${site.address}, ${site.postal_code || ''} ${site.city}</div>
                ${
                  site.access_instructions
                    ? `<div class="p-1.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-200 text-[11px] mt-1.5">
                         <strong>Digicode :</strong> ${site.access_instructions}
                       </div>`
                    : ''
                }
                ${
                  site.owner
                    ? `<div class="text-[11px] text-slate-300 pt-1">
                         Client : <strong>${site.owner.full_name}</strong>
                         ${site.owner.phone ? ` • <a href="tel:${site.owner.phone}" class="text-cyan-400 hover:underline">${site.owner.phone}</a>` : ''}
                       </div>`
                    : ''
                }
                ${
                  hasAlarm
                    ? `<div class="pt-2">
                         <a href="/dispatch/alerts/${site.active_alert.id}" class="block w-full py-1.5 text-center rounded bg-red-600 hover:bg-red-500 text-white font-extrabold text-[11px]">
                           Ouvrir le dossier d'incident →
                         </a>
                       </div>`
                    : ''
                }
              </div>
            </div>
          `;

          marker.bindPopup(popupContent, {
            className: 'tactical-popup-dark',
          });

          sitesGroup.addLayer(marker);

          // Zone de géofencing périmétrique (250m de rayon)
          if (activeLayers.geofence) {
            const circle = L.circle([lat, lon], {
              radius: hasAlarm ? 300 : 150,
              color: hasAlarm ? '#ef4444' : '#06b6d4',
              fillColor: hasAlarm ? '#ef4444' : '#06b6d4',
              fillOpacity: hasAlarm ? 0.15 : 0.05,
              weight: 1,
              dashArray: '4, 4',
            });
            geofenceGroup.addLayer(circle);
          }
        });
      });
    }

    // B. COUCHE AGENTS DE SÉCURITÉ (Patrouilles en temps réel et Postes Base)
    if (activeLayers.agents && mapData.agents) {
      const recAgent = recommendation?.recommended_agent;
      const targetRecId = recommendedAgentId || recAgent?.id;

      mapData.agents.forEach((ag: any) => {
        const agLat = Number(ag.latitude);
        const agLon = Number(ag.longitude);
        if (isNaN(agLat) || isNaN(agLon) || (agLat === 0 && agLon === 0)) return;

        const isAtBase = Boolean(ag.is_at_base || !ag.has_gps);
        const isEnRoute = ag.duty_status === 'DISPATCHED' || ag.duty_status === 'EN_ROUTE';
        const isAvailable = ag.duty_status === 'AVAILABLE';
        const isOnSite = ag.duty_status === 'ON_SITE' || ag.duty_status === 'ARRIVED';
        const isBusy = ag.duty_status === 'BUSY';
        const isOffDuty = ag.duty_status === 'OFF_DUTY';
        const isRecommended = Boolean(targetRecId && ag.id === targetRecId);

        // Fraîcheur GPS
        let gpsLabel = isAtBase ? '📍 Poste Base (En attente signal mobile)' : 'GPS inconnu';
        let gpsColorClass = isAtBase ? 'text-amber-400 font-semibold' : 'text-slate-500';
        if (ag.last_location_update && !isAtBase) {
          const diffSec = Math.max(0, Math.floor((Date.now() - new Date(ag.last_location_update).getTime()) / 1000));
          if (diffSec <= 30) {
            gpsLabel = `📡 GPS ${diffSec}s (Temps réel)`;
            gpsColorClass = 'text-emerald-400 font-bold';
          } else if (diffSec <= 120) {
            gpsLabel = `📡 GPS récent (${diffSec}s)`;
            gpsColorClass = 'text-cyan-400 font-semibold';
          } else if (diffSec <= 900) {
            gpsLabel = `⚠️ GPS ancien (${Math.floor(diffSec / 60)} min)`;
            gpsColorClass = 'text-amber-400 font-semibold';
          } else {
            gpsLabel = `❌ GPS obsolète (> 15 min)`;
            gpsColorClass = 'text-rose-400 font-bold';
          }
        }

        const agentIcon = L.divIcon({
          className: 'tactical-agent-icon',
          html: isRecommended
            ? `
            <div class="relative flex flex-col items-center justify-center cursor-pointer">
              <span class="absolute -inset-3 rounded-full bg-amber-400/40 animate-ping"></span>
              <span class="absolute -inset-1 rounded-full border-2 border-amber-400 animate-pulse"></span>
              <div class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-400 border-2 border-white shadow-[0_0_20px_rgba(245,158,11,0.9)] flex items-center justify-center text-slate-950 font-black">
                <svg class="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div class="mt-1 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[9px] whitespace-nowrap shadow-lg border border-amber-200">
                🥇 ${ag.agent_name}
              </div>
            </div>
            `
            : `
            <div class="relative flex flex-col items-center justify-center cursor-pointer">
              ${
                isEnRoute
                  ? `<span class="absolute w-8 h-8 rounded-full bg-blue-400/40 animate-ping"></span>`
                  : isOnSite
                  ? `<span class="absolute w-8 h-8 rounded-full bg-purple-400/40 animate-pulse"></span>`
                  : ''
              }
              <div class="w-8 h-8 rounded-2xl ${
                isAtBase
                  ? 'bg-slate-800 border-2 border-cyan-400 shadow-cyan-950'
                  : isEnRoute
                  ? 'bg-blue-600 border-2 border-white shadow-blue-950'
                  : isOnSite
                  ? 'bg-purple-600 border-2 border-purple-200 shadow-purple-950'
                  : isAvailable
                  ? 'bg-emerald-600 border border-emerald-300 shadow-emerald-950'
                  : isBusy
                  ? 'bg-amber-600 border border-amber-300 shadow-amber-950'
                  : 'bg-slate-700 border border-slate-500 shadow-slate-950'
              } shadow-lg flex items-center justify-center text-white">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <div class="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-cyan-200 font-bold text-[9px] whitespace-nowrap shadow-md">
                ${isAtBase ? '📍 ' : ''}${ag.agent_name} (${ag.badge_number})
              </div>
            </div>
          `,
          iconSize: [70, 52],
          iconAnchor: [35, 20],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([agLat, agLon], { icon: agentIcon });

        const popupContent = `
          <div class="p-1 max-w-[250px] text-slate-100 font-sans">
            ${
              isRecommended
                ? `<div class="p-2 rounded-xl bg-amber-950/90 border border-amber-500/70 text-amber-200 text-xs font-bold mb-2 shadow">
                     <div class="flex items-center justify-between">
                       <span class="flex items-center gap-1 font-black">🥇 RECOMMANDÉ SMART DISPATCH</span>
                       <span class="font-mono bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-black text-[11px]">${recAgent?.score_breakdown?.total_score ?? '95'}/100</span>
                     </div>
                     ${recAgent?.distance_km !== undefined ? `<div class="text-[10px] text-amber-300/90 mt-1">Distance : <strong>${recAgent.distance_km} km</strong> • ETA : <strong>${recAgent.estimated_eta_minutes} min</strong></div>` : ''}
                   </div>`
                : ''
            }
            <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-700">
              <span class="font-extrabold text-xs text-white">${ag.agent_name}</span>
              <span class="font-mono text-[10px] font-bold text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                ${ag.badge_number}
              </span>
            </div>
            <div class="space-y-1 text-xs">
              <div class="text-slate-300 text-[11px] font-semibold">${ag.patrol_vehicle || 'Véhicule de patrouille'}</div>
              <div class="text-[11px] flex items-center gap-1">
                Statut : <span class="font-bold ${isAvailable ? 'text-emerald-400' : isEnRoute ? 'text-blue-400' : isOnSite ? 'text-purple-400' : isBusy ? 'text-amber-400' : 'text-slate-400'}">${ag.duty_status}</span>
              </div>
              <div class="text-[10px] text-slate-400 font-mono mt-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
                <div>GPS Réel : ${Number(ag.latitude).toFixed(5)}, ${Number(ag.longitude).toFixed(5)}</div>
                <div class="${gpsColorClass} mt-0.5">${gpsLabel}</div>
              </div>
              ${
                ag.assigned_mission
                  ? `<div class="p-1.5 rounded bg-cyan-950/60 border border-cyan-800 text-cyan-200 text-[11px] mt-1">
                       Mission : <strong>${ag.assigned_mission.alert_number}</strong>
                     </div>`
                  : ''
              }
              ${
                ag.phone
                  ? `<div class="pt-1.5">
                       <a href="tel:${ag.phone}" class="block py-1 text-center rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-bold">
                         📞 Contacter l'agent
                       </a>
                     </div>`
                  : ''
              }
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, { className: 'tactical-popup-dark' });
        agentsGroup.addLayer(marker);

        // Si l'agent est recommandé et qu'une alerte est ciblée, tracer le vecteur prévisionnel
        if (isRecommended && focusedCoordinates && focusedCoordinates[0] && focusedCoordinates[1]) {
          const recLine = L.polyline(
            [
              [agLat, agLon],
              [focusedCoordinates[0], focusedCoordinates[1]],
            ],
            {
              color: '#f59e0b',
              weight: 3.5,
              opacity: 0.9,
              dashArray: '8, 8',
            }
          );

          const midLat = (agLat + focusedCoordinates[0]) / 2;
          const midLon = (agLon + focusedCoordinates[1]) / 2;

          const recBadge = L.popup({
            closeButton: false,
            autoClose: false,
            closeOnClick: false,
            className: 'tactical-eta-badge',
          })
            .setLatLng([midLat, midLon])
            .setContent(`
              <div class="px-2.5 py-1 rounded-full bg-amber-950 border-2 border-amber-400 text-amber-300 text-[10px] font-black flex items-center gap-1.5 shadow-xl whitespace-nowrap">
                <span>🥇 Vecteur Recommandé</span>
                ${recAgent?.distance_km !== undefined ? `<span>• ⚡ ${recAgent.distance_km} km</span>` : ''}
                ${recAgent?.estimated_eta_minutes !== undefined ? `<span>• ⏱️ ETA: ${recAgent.estimated_eta_minutes} min</span>` : ''}
              </div>
            `);

          vectorsGroup.addLayer(recLine);
          vectorsGroup.addLayer(recBadge);
        }
      });
    }

    // C. COUCHE VECTEURS D'INTERVENTION (Lignes tactiques et ETA)
    if (activeLayers.interventions && mapData.active_interventions) {
      mapData.active_interventions.forEach((item: any) => {
        const agLat = Number(item.agent?.latitude ?? item.agent?.current_latitude);
        const agLon = Number(item.agent?.longitude ?? item.agent?.current_longitude);
        const siteLat = Number(item.site?.latitude ?? item.alert?.latitude ?? item.alert?.site?.latitude);
        const siteLon = Number(item.site?.longitude ?? item.alert?.longitude ?? item.alert?.site?.longitude);

        if (
          !isNaN(agLat) && !isNaN(agLon) && !(agLat === 0 && agLon === 0) &&
          !isNaN(siteLat) && !isNaN(siteLon) && !(siteLat === 0 && siteLon === 0)
        ) {
          // 1. Ligne tactique initiale reliant l'agent au lieu d'intervention
          let line = L.polyline(
            [
              [agLat, agLon],
              [siteLat, siteLon],
            ],
            {
              color: '#06b6d4',
              weight: 3.5,
              opacity: 0.85,
              dashArray: '6, 8',
            }
          );

          // Info-bulle tactique permanente avec distance & ETA
          const midLat = (agLat + siteLat) / 2;
          const midLon = (agLon + siteLon) / 2;

          const etaBadge = L.popup({
            closeButton: false,
            autoClose: false,
            closeOnClick: false,
            className: 'tactical-eta-badge',
          })
            .setLatLng([midLat, midLon])
            .setContent(`
              <div class="px-2 py-0.5 rounded-full bg-cyan-950/90 border border-cyan-500 text-cyan-300 text-[10px] font-extrabold flex items-center gap-1 shadow-lg whitespace-nowrap">
                <span>⚡ ${item.telemetry?.formattedDistance || 'Calcul...'}</span>
                <span>•</span>
                <span>⏱️ ETA: ${item.telemetry?.formattedEta || 'En cours'}</span>
              </div>
            `);

          vectorsGroup.addLayer(line);
          vectorsGroup.addLayer(etaBadge);

          // 2. Calcul asynchrone du tracé routier réel via OSRM (rues et carrefours réels)
          fetchRoadRoute(
            { latitude: agLat, longitude: agLon },
            { latitude: siteLat, longitude: siteLon }
          )
            .then((route) => {
              if (!vectorsGroup || !mapInstanceRef.current) return;
              if (route.isRoadNetwork && route.coordinates.length > 2) {
                vectorsGroup.removeLayer(line);
                // Tracé routier haute précision épousant la voirie
                line = L.polyline(route.coordinates, {
                  color: '#22d3ee',
                  weight: 4.5,
                  opacity: 0.95,
                });
                vectorsGroup.addLayer(line);

                // Recalcul du milieu du tracé pour positionner le badge sur la route
                const midIndex = Math.floor(route.coordinates.length / 2);
                const roadMid = route.coordinates[midIndex];
                const roadDistKm = (route.distanceMeters / 1000).toFixed(1);
                const roadMinutes = Math.max(1, Math.ceil(route.durationSeconds / 60));

                etaBadge.setLatLng(roadMid).setContent(`
                  <div class="px-2.5 py-0.5 rounded-full bg-cyan-950 border-2 border-cyan-400 text-cyan-200 text-[10px] font-black flex items-center gap-1.5 shadow-xl whitespace-nowrap">
                    <span>🚗 Itinéraire Routier</span>
                    <span>• ⚡ ${roadDistKm} km</span>
                    <span>• ⏱️ ETA: ${roadMinutes} min</span>
                  </div>
                `);
              }
            })
            .catch(() => {});
        }
      });
    }

    // D. COUCHE APPAREILS / CLIENTS EN DÉTRESSE (GPS Réel du Smartphone vs Site Protégé)
    if (mapData.active_alerts && Array.isArray(mapData.active_alerts)) {
      mapData.active_alerts.forEach((alert: any) => {
        const devLat = Number(alert.latitude);
        const devLon = Number(alert.longitude);
        if (isNaN(devLat) || isNaN(devLon) || (devLat === 0 && devLon === 0)) return;

        const deviceIcon = L.divIcon({
          className: 'tactical-client-device-icon',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer">
              <span class="absolute w-10 h-10 rounded-full bg-rose-600/40 animate-ping"></span>
              <div class="relative w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-amber-500 border-2 border-white shadow-xl shadow-red-950 flex items-center justify-center text-white">
                <svg class="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-400 border border-slate-900"></span>
              </span>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -16],
        });

        const devMarker = L.marker([devLat, devLon], { icon: deviceIcon });

        const devPopup = `
          <div class="p-1 max-w-[260px] text-slate-100 font-sans">
            <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700">
              <span class="font-extrabold text-xs text-rose-400">📱 APPAREIL DU CLIENT</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-950 border border-red-500/50 text-red-200 uppercase font-mono font-bold">
                GPS RÉEL
              </span>
            </div>
            <div class="space-y-1 text-xs">
              <div class="font-bold text-white text-sm">${alert.client_name || 'Client Sécuria'}</div>
              <div class="text-[11px] text-slate-300">
                Alerte : <strong class="text-rose-300">${alert.alert_number}</strong> (${alert.type})
              </div>
              <div class="text-[10px] text-slate-400 font-mono mt-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
                <div>Lat : ${devLat.toFixed(6)}</div>
                <div>Lng : ${devLon.toFixed(6)}</div>
                <div class="text-emerald-400 font-semibold mt-0.5">🟢 Précision : Balise GPS Haute Précision</div>
              </div>
              <div class="pt-2">
                <a href="/dispatch/alerts/${alert.id}" class="block w-full py-1.5 text-center rounded bg-red-600 hover:bg-red-500 text-white font-extrabold text-[11px] shadow">
                  Intervenir sur cette position →
                </a>
              </div>
            </div>
          </div>
        `;

        devMarker.bindPopup(devPopup, { className: 'tactical-popup-dark' });
        clientDevicesGroup.addLayer(devMarker);

        // Rayon de précision GPS réel (cercle rouge semi-transparent 25m)
        const accuracyCircle = L.circle([devLat, devLon], {
          radius: 25,
          color: '#f43f5e',
          fillColor: '#f43f5e',
          fillOpacity: 0.18,
          weight: 1.5,
          dashArray: '3, 3',
        });
        clientDevicesGroup.addLayer(accuracyCircle);
      });
    }

    // E. COUCHE CAMÉRAS VIDÉO FIXES (Phase 8 - Distinguée du Site et de l'Agent)
    if (activeLayers.cameras && mapData.cameras && Array.isArray(mapData.cameras)) {
      mapData.cameras.forEach((cam: any) => {
        const camLat = Number(cam.latitude);
        const camLon = Number(cam.longitude);
        if (isNaN(camLat) || isNaN(camLon) || (camLat === 0 && camLon === 0)) return;

        const isOnline = cam.status === 'ONLINE';
        const isOffline = cam.status === 'OFFLINE';

        const cameraIcon = L.divIcon({
          className: 'tactical-camera-icon',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer group">
              ${
                isOnline
                  ? `<span class="absolute w-7 h-7 rounded-full bg-cyan-400/30 animate-pulse"></span>`
                  : ''
              }
              <div class="relative w-6 h-6 rounded-lg ${
                isOnline
                  ? 'bg-purple-950 border border-cyan-400 text-cyan-300 shadow-lg shadow-purple-950'
                  : isOffline
                  ? 'bg-slate-900 border border-rose-500 text-rose-400'
                  : 'bg-slate-900 border border-amber-500 text-amber-400'
              } flex items-center justify-center">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400' : isOffline ? 'bg-rose-500' : 'bg-amber-400'
              } border border-slate-950"></span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -12],
        });

        const camMarker = L.marker([camLat, camLon], { icon: cameraIcon });

        const camPopup = `
          <div class="p-1 max-w-[240px] text-slate-100 font-sans">
            <div class="flex items-center justify-between pb-1 mb-1 border-b border-slate-700">
              <span class="font-extrabold text-xs text-cyan-300">📹 CAMÉRA PÉRIMÉTRIQUE</span>
              <span class="text-[9px] px-1.5 py-0.5 rounded ${
                isOnline ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
              } font-mono font-bold">
                ${cam.status}
              </span>
            </div>
            <div class="space-y-1 text-xs">
              <div class="font-bold text-white">${cam.name} (${cam.internal_id})</div>
              <div class="text-[11px] text-slate-400">${cam.location_description || 'Emplacement fixe'}</div>
              <div class="text-[10px] text-slate-400 font-mono mt-1 bg-slate-900/90 p-1.5 rounded border border-slate-800">
                <div>GPS Fixe Caméra : ${camLat.toFixed(5)}, ${camLon.toFixed(5)}</div>
                <div class="text-purple-400 font-semibold mt-0.5">Protocole : ${cam.protocol}</div>
              </div>
              <div class="pt-2">
                <a href="/dispatch/cameras" class="block w-full py-1 text-center rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-[10px] border border-slate-700">
                  Gérer dans le Registre →
                </a>
              </div>
            </div>
          </div>
        `;

        camMarker.bindPopup(camPopup, { className: 'tactical-popup-dark' });
        camerasGroup.addLayer(camMarker);
      });
    }
  }, [mapData, activeLayers, recommendation, recommendedAgentId, focusedCoordinates]);

  // 4. Centrage dynamique sur les coordonnées demandées (ex: clic sur [VOIR LA CARTE])
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (focusedCoordinates && focusedCoordinates[0] && focusedCoordinates[1]) {
      mapInstanceRef.current.flyTo(focusedCoordinates, 15, {
        duration: 1.5,
      });
    }
  }, [focusedCoordinates]);

  // Recadrage automatique pour afficher l'ensemble des sites et agents du réseau
  const handleFitBounds = () => {
    if (!mapInstanceRef.current || !mapData) return;
    mapInstanceRef.current.invalidateSize();
    const allCoords: [number, number][] = [];

    (mapData.sites || []).forEach((s: any) => {
      const lat = Number(s.latitude);
      const lon = Number(s.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        allCoords.push([lat, lon]);
      }
    });

    (mapData.agents || []).forEach((a: any) => {
      const lat = Number(a.latitude);
      const lon = Number(a.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        allCoords.push([lat, lon]);
      }
    });

    (mapData.active_alerts || []).forEach((al: any) => {
      const lat = Number(al.latitude);
      const lon = Number(al.longitude);
      if (!isNaN(lat) && !isNaN(lon) && !(lat === 0 && lon === 0)) {
        allCoords.push([lat, lon]);
      }
    });

    // Bounding box stricte Côte d'Ivoire : Lat [4.0, 11.0], Lon [-9.0, -2.0]
    const isInsideCI = (lat: number, lon: number) =>
      typeof lat === 'number' && typeof lon === 'number' &&
      lat >= 4.0 && lat <= 11.0 && lon >= -9.0 && lon <= -2.0;

    const ciCoords = allCoords.filter(([lat, lon]) => isInsideCI(lat, lon));

    if (ciCoords.length > 0) {
      if (ciCoords.length === 1) {
        mapInstanceRef.current.setView(ciCoords[0], 14);
      } else {
        const bounds = L.latLngBounds(ciCoords);
        mapInstanceRef.current.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 15,
        });
      }
    } else if (mapData.center?.latitude && mapData.center?.longitude && isInsideCI(mapData.center.latitude, mapData.center.longitude)) {
      mapInstanceRef.current.setView(
        [mapData.center.latitude, mapData.center.longitude],
        mapData.center.default_zoom || 13
      );
    } else {
      mapInstanceRef.current.setView([5.3484, -4.0305], 13);
    }
  };

  const initialFitDoneRef = useRef(false);

  // Auto-ajustement de la vue sur l'ensemble des éléments dès réception des données
  useEffect(() => {
    if (!mapInstanceRef.current || !mapData) return;
    if (!focusedCoordinates && !initialFitDoneRef.current) {
      const timer = setTimeout(() => {
        handleFitBounds();
        initialFitDoneRef.current = true;
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [mapData, focusedCoordinates]);

  const totalSitesCount = mapData?.sites?.length || 0;
  const totalAgentsCount = mapData?.summary?.total_agents ?? (mapData?.agents?.length || 0);
  const activeGpsCount = mapData?.summary?.active_agents_located ?? (mapData?.agents || []).filter((a: any) => a.has_gps).length;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl ${className}`}
      style={{ height }}
    >
      {/* Conteneur DOM de la carte Leaflet */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* En-tête Tactique Flottant (Haut à Gauche) */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2 px-3 shadow-2xl max-w-[calc(100%-24px)]">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-xs font-black tracking-wider uppercase text-white">
          RADAR OPÉRATIONNEL HOREB SECURE
        </span>
        {mapData && (
          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 border border-cyan-800 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 shadow-inner">
            <span>🛡️ {totalSitesCount} sites</span>
            <span>•</span>
            <span>👮 {totalAgentsCount} agents {activeGpsCount > 0 ? `(${activeGpsCount} GPS live)` : ''}</span>
            <span>•</span>
            <span>⚡ {mapData?.summary?.ongoing_interventions || 0} interventions</span>
          </span>
        )}
      </div>

      {/* Barre d'Action Rapide & Navigation Instantanée (Haut à Droite) */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-2xl p-1.5 shadow-2xl">
        <button
          type="button"
          onClick={() => setQuickNavOpen(quickNavOpen === 'sites' ? null : 'sites')}
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            quickNavOpen === 'sites'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
          title="Liste et ciblage direct des sites protégés"
        >
          <Building className="w-3.5 h-3.5 text-cyan-400" />
          <span>Sites ({totalSitesCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickNavOpen(quickNavOpen === 'agents' ? null : 'agents')}
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            quickNavOpen === 'agents'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
          title="Liste et localisation des patrouilles"
        >
          <Car className="w-3.5 h-3.5 text-blue-400" />
          <span>Agents ({totalAgentsCount})</span>
        </button>

        <button
          type="button"
          onClick={handleFitBounds}
          className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-black shadow-md flex items-center gap-1 transition-all"
          title="Recadrer la carte sur l'ensemble des sites et agents"
        >
          <Maximize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Vue Complète</span>
        </button>
      </div>

      {/* Popover Sélecteur Rapide des Sites */}
      {quickNavOpen === 'sites' && (
        <div className="absolute top-14 right-3 z-20 w-80 max-h-80 overflow-y-auto bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-black uppercase text-cyan-300 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5" />
              <span>Sites Enregistrés ({totalSitesCount})</span>
            </span>
            <button
              type="button"
              onClick={() => setQuickNavOpen(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {(mapData?.sites || []).length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
                Aucun site protégé enregistré en base pour cette organisation.
              </div>
            ) : (
              (mapData?.sites || []).map((s: any) => (
              <div
                key={s.id}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                    <span>{s.name}</span>
                    {s.has_active_alert && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700 font-black animate-pulse">
                        ALERTE
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {s.address}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current && s.latitude && s.longitude) {
                      mapInstanceRef.current.flyTo([Number(s.latitude), Number(s.longitude)], 17, {
                        animate: true,
                        duration: 1.2,
                      });
                      setQuickNavOpen(null);
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 text-[10px] font-bold shrink-0"
                >
                  Cibler 🎯
                </button>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* Popover Sélecteur Rapide des Agents */}
      {quickNavOpen === 'agents' && (
        <div className="absolute top-14 right-3 z-20 w-80 max-h-80 overflow-y-auto bg-slate-950/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3 shadow-2xl space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-black uppercase text-blue-300 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" />
              <span>Flotte Agents ({totalAgentsCount})</span>
            </span>
            <button
              type="button"
              onClick={() => setQuickNavOpen(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {(mapData?.agents || []).map((ag: any) => (
              <div
                key={ag.id}
                className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                    <span>{ag.agent_name}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-cyan-300 font-mono">
                      {ag.badge_number}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                    <span className={ag.has_gps ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                      {ag.has_gps ? '📡 GPS Live' : '📍 Poste Base'}
                    </span>
                    <span>•</span>
                    <span>{ag.duty_status}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current && ag.latitude && ag.longitude) {
                      mapInstanceRef.current.flyTo([Number(ag.latitude), Number(ag.longitude)], 16, {
                        animate: true,
                        duration: 1.2,
                      });
                      setQuickNavOpen(null);
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-950 hover:bg-blue-900 border border-blue-700 text-blue-300 text-[10px] font-bold shrink-0"
                >
                  Localiser 🎯
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barre de Filtres de Couches (Bas à Gauche) */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-1.5 shadow-xl">
        <button
          type="button"
          onClick={() =>
            setActiveLayers((prev) => ({ ...prev, sites: !prev.sites }))
          }
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
            activeLayers.sites
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <MapPin className="w-3 h-3" />
          <span>Sites protégés</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveLayers((prev) => ({ ...prev, agents: !prev.agents }))
          }
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
            activeLayers.agents
              ? 'bg-cyan-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Car className="w-3 h-3" />
          <span>Patrouilles</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveLayers((prev) => ({ ...prev, cameras: !prev.cameras }))
          }
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
            activeLayers.cameras
              ? 'bg-purple-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Video className="w-3 h-3" />
          <span>Caméras</span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveLayers((prev) => ({
              ...prev,
              interventions: !prev.interventions,
            }))
          }
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
            activeLayers.interventions
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-3 h-3" />
          <span>Vecteurs ETA</span>
        </button>

        <button
          type="button"
          onClick={handleFitBounds}
          title="Recentrer la vue d'ensemble sur tous les sites et agents"
          className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Indicateur de chargement */}
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-300">
              Synchronisation des flux cartographiques...
            </span>
          </div>
        </div>
      )}

      {/* Style global pour les popups Leaflet en mode sombre */}
      <style jsx global>{`
        .leaflet-popup-content-wrapper {
          background: #090d16 !important;
          border: 1px solid #1e293b !important;
          border-radius: 16px !important;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.8) !important;
          padding: 8px !important;
        }
        .leaflet-popup-tip {
          background: #090d16 !important;
          border: 1px solid #1e293b !important;
        }
        .tactical-eta-badge .leaflet-popup-content-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .tactical-eta-badge .leaflet-popup-tip-container {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

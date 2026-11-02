'use client';

import React, { useState, useEffect } from 'react';
import { VideoCamera, CameraStatus, VideoProtocol, CameraType } from '@/lib/video/types';
import { CameraStatusBadge } from './CameraStatusBadge';
import {
  Video,
  Plus,
  RefreshCw,
  Search,
  Filter,
  PowerOff,
  CheckCircle2,
  AlertTriangle,
  Building,
  Sliders,
  MapPin,
  ExternalLink,
  ShieldAlert,
  Radio,
  X,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface SiteOption {
  id: string;
  name: string;
  address: string;
}

export function CameraRegistryTable() {
  const [cameras, setCameras] = useState<VideoCamera[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [testingId, setTestingId] = useState<string | null>(null);

  // Modal d'ajout de caméra
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    internal_id: '',
    protected_site_id: '',
    manufacturer: '',
    model: '',
    camera_type: 'FIXED' as CameraType,
    protocol: 'ONVIF' as VideoProtocol,
    location_description: '',
    is_primary: false,
    latitude: '',
    longitude: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [camRes, siteRes] = await Promise.all([
        authFetch('/api/video/cameras'),
        authFetch('/api/sites'),
      ]);

      if (camRes.ok) {
        const d = await camRes.json();
        setCameras(d.cameras || []);
      }
      if (siteRes.ok) {
        const s = await siteRes.json();
        setSites(s.sites || []);
      }
    } catch (err) {
      console.warn('[CameraRegistry] Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestConnection = async (cameraId: string) => {
    setTestingId(cameraId);
    try {
      const res = await authFetch(`/api/video/cameras/${cameraId}/test`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCameras((prev) =>
          prev.map((c) => (c.id === cameraId ? { ...c, status: data.status, last_seen_at: data.checked_at } : c))
        );
      }
    } catch (err) {
      console.warn('Erreur test caméra:', err);
    } finally {
      setTestingId(null);
    }
  };

  const handleDisableCamera = async (cameraId: string) => {
    if (!confirm('Désactiver cette caméra du registre opérationnel ?')) return;
    try {
      const res = await authFetch(`/api/video/cameras/${cameraId}`, { method: 'DELETE' });
      if (res.ok) {
        setCameras((prev) =>
          prev.map((c) => (c.id === cameraId ? { ...c, status: 'DISABLED' } : c))
        );
      }
    } catch (err) {
      console.warn('Erreur désactivation:', err);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.internal_id || !formData.protected_site_id) {
      alert('Veuillez renseigner les champs obligatoires.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await authFetch('/api/video/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setFormData({
          name: '',
          internal_id: '',
          protected_site_id: '',
          manufacturer: '',
          model: '',
          camera_type: 'FIXED',
          protocol: 'ONVIF',
          location_description: '',
          is_primary: false,
          latitude: '',
          longitude: '',
        });
        await loadData();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de l’enregistrement de la caméra.');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredCameras = cameras.filter((cam) => {
    if (statusFilter !== 'ALL' && cam.status !== statusFilter) return false;
    if (siteFilter !== 'ALL' && cam.protected_site_id !== siteFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchName = cam.name.toLowerCase().includes(q);
      const matchId = cam.internal_id.toLowerCase().includes(q);
      const matchLoc = cam.location_description?.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchLoc) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Barre d'outils et filtres */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Recherche textuelle */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par nom, ID interne, emplacement..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Filtre par statut */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ONLINE">En ligne (ONLINE)</option>
            <option value="OFFLINE">Hors ligne (OFFLINE)</option>
            <option value="DEGRADED">Dégradé (DEGRADED)</option>
            <option value="DISABLED">Désactivé (DISABLED)</option>
          </select>

          {/* Filtre par site */}
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 max-w-[180px] truncate"
          >
            <option value="ALL">Tous les sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Rafraîchir le registre"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-cyan-950 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Caméra</span>
          </button>
        </div>
      </div>

      {/* Tableau des caméras */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Équipement & Emplacement</th>
                <th className="py-3 px-4">Site Protégé</th>
                <th className="py-3 px-4">Protocole / Matériel</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Dernière Vérification</th>
                <th className="py-3 px-4 text-right">Actions SOC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredCameras.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Aucune caméra trouvée dans le registre correspondant aux critères.
                  </td>
                </tr>
              ) : (
                filteredCameras.map((cam) => {
                  const site = sites.find((s) => s.id === cam.protected_site_id);
                  const isTesting = testingId === cam.id;
                  return (
                    <tr key={cam.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Video className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-100">{cam.name}</span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {cam.internal_id}
                              </span>
                              {cam.is_primary && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  PRIMARY
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {cam.location_description || 'Non renseigné'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-semibold">{site?.name || 'Site rattaché'}</span>
                        </div>
                        {site?.address && (
                          <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{site.address}</p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-400 border border-slate-700">
                            {cam.protocol}
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {cam.manufacturer || 'IP Générique'} {cam.model || ''}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <CameraStatusBadge status={cam.status} />
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {cam.last_seen_at ? (
                          <span>{new Date(cam.last_seen_at).toLocaleTimeString('fr-FR')}</span>
                        ) : (
                          <span className="text-slate-600">Jamais</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTestConnection(cam.id)}
                            disabled={isTesting || cam.status === 'DISABLED'}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors disabled:opacity-40"
                            title="Tester la connexion"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                          </button>

                          {cam.status !== 'DISABLED' && (
                            <button
                              type="button"
                              onClick={() => handleDisableCamera(cam.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-800 transition-colors"
                              title="Désactiver l’équipement"
                            >
                              <PowerOff className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'ajout de nouvelle caméra */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Video className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Enregistrer une Caméra au Registre</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Nom opérationnel *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : Caméra Périmètre Ouest"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Identifiant interne / Canal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex : CAM-01 ou CH-02"
                    value={formData.internal_id}
                    onChange={(e) => setFormData({ ...formData, internal_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Site Protégé Rattaché *</label>
                  <select
                    required
                    value={formData.protected_site_id}
                    onChange={(e) => setFormData({ ...formData, protected_site_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Sélectionnez un site...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Fabricant</label>
                  <input
                    type="text"
                    placeholder="Dahua, Hikvision, Axis, ONVIF..."
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Modèle</label>
                  <input
                    type="text"
                    placeholder="Réf. équipement"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Protocole d'intégration</label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ONVIF">ONVIF Profile S/T</option>
                    <option value="HTTP_API">API Passerelle / VMS</option>
                    <option value="RTSP_INTERNAL">RTSP Interne (Relayé)</option>
                    <option value="TEST_SIMULATOR">TEST_SIMULATOR (Simulation)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Type de caméra</label>
                  <select
                    value={formData.camera_type}
                    onChange={(e) => setFormData({ ...formData, camera_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="FIXED">Fixe (Périmètre)</option>
                    <option value="DOME">Dôme (Intérieur / Entrée)</option>
                    <option value="PTZ">PTZ (Motorisée Pan-Tilt-Zoom)</option>
                    <option value="BULLET">Bullet (Longue portée)</option>
                    <option value="THERMAL">Thermique</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Emplacement sur site</label>
                <input
                  type="text"
                  placeholder="Ex : Entrée principale, parking visiteurs, portail nord"
                  value={formData.location_description}
                  onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_primary"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="is_primary" className="text-slate-300 font-semibold cursor-pointer">
                  Définir comme caméra principale du site (Aperçu prioritaire SOC)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold transition-all shadow-md shadow-cyan-950 disabled:opacity-50"
                >
                  {formSubmitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

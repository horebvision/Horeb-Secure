'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Building,
  Key,
  Shield,
  Home,
  Briefcase,
  Store,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  LocateFixed,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface EditSiteModalProps {
  isOpen: boolean;
  site: any | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  organizations: Array<{ id: string; name: string; commercial_name?: string | null }>;
  isPlatformAdmin: boolean;
  users?: Array<{ id: string; full_name: string; email: string }>;
}

export function EditSiteModal({
  isOpen,
  site,
  onClose,
  onSuccess,
  organizations,
  isPlatformAdmin,
  users = [],
}: EditSiteModalProps) {
  const [name, setName] = useState('');
  const [siteType, setSiteType] = useState<'RESIDENCE' | 'COMMERCE' | 'ENTREPRISE' | 'AUTRE'>('RESIDENCE');
  const [organizationId, setOrganizationId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (site) {
      setName(site.name || '');
      setSiteType(site.site_type || 'RESIDENCE');
      setOrganizationId(site.organization_id || '');
      setOwnerId(site.owner_id || '');
      setAddress(site.address || '');
      setCity(site.city || 'Abidjan');
      setPostalCode(site.postal_code || 'BP 01');
      setLatitude(site.latitude != null ? String(site.latitude) : '5.3484');
      setLongitude(site.longitude != null ? String(site.longitude) : '-4.0305');
      setAccessInstructions(site.access_instructions || '');
      setIsDefault(!!site.is_default);
      setErrorMsg('');
    }
  }, [site]);

  if (!isOpen || !site) return null;

  const handleUseAbidjanDefault = () => {
    setLatitude('5.3484');
    setLongitude('-4.0305');
  };

  const handleGetCurrentLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6));
          setLongitude(pos.coords.longitude.toFixed(6));
        },
        () => {
          setErrorMsg('Impossible d’obtenir la géolocalisation de l’appareil.');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Le nom du site protégé est obligatoire.');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('L’adresse physique du site est obligatoire.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        id: site.id,
        name: name.trim(),
        site_type: siteType,
        address: address.trim(),
        city: city.trim() || 'Abidjan',
        postal_code: postalCode.trim() || 'BP 01',
        access_instructions: accessInstructions.trim() || null,
        is_default: isDefault,
      };

      if (latitude && longitude) {
        payload.latitude = parseFloat(latitude);
        payload.longitude = parseFloat(longitude);
      }

      if (isPlatformAdmin) {
        payload.organization_id = organizationId || null;
      }

      if (ownerId && ownerId.trim()) {
        payload.owner_id = ownerId.trim();
      }

      const res = await authFetch('/api/sites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour du site');
      }

      onSuccess(data.message || `Site "${name}" mis à jour avec succès.`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de mettre à jour le site protégé.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white space-y-5 max-h-[90vh] overflow-y-auto">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Modifier le Site Protégé</h3>
              <p className="text-xs text-slate-400">{site.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-800 text-xs text-rose-200 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom du site & Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nom du site *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Type de site protégé *
              </label>
              <select
                value={siteType}
                onChange={(e) => setSiteType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
              >
                <option value="RESIDENCE">Résidence / Domicile privé</option>
                <option value="COMMERCE">Commerce / Magasin / Agence</option>
                <option value="ENTREPRISE">Entreprise / Siège / Entrepôt</option>
                <option value="AUTRE">Autre site surveillé</option>
              </select>
            </div>
          </div>

          {/* Rattachement Entreprise & Propriétaire */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Entreprise de rattachement
              </label>
              <select
                disabled={!isPlatformAdmin}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold ${
                  !isPlatformAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {isPlatformAdmin && <option value="">Choisir une organisation...</option>}
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.commercial_name ? `(${org.commercial_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Client / Propriétaire
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="">Attribué au compte administrateur</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Adresse & Ville */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Adresse physique complète *
              </label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ville
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Coordonnées GPS */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                <span>Géolocalisation GPS</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleUseAbidjanDefault}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-semibold"
                >
                  Abidjan Centre
                </button>
                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  className="px-2 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-[10px] text-cyan-300 font-semibold flex items-center gap-1"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>Ma Position</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 font-mono">
                  Latitude
                </label>
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 font-mono">
                  Longitude
                </label>
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Consignes d'accès & Digicode */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Consignes d'accès & Digicode</span>
            </label>
            <textarea
              rows={2}
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Site par défaut */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultSiteEdit"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 bg-slate-950 border-slate-700"
            />
            <label htmlFor="isDefaultSiteEdit" className="text-xs font-semibold text-slate-300 cursor-pointer">
              Définir comme site principal par défaut
            </label>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-cyan-950 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Enregistrement...' : 'Enregistrer les modifications'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useSecuria } from '@/lib/store/securia-context';
import { SiteType, ProtectedSite } from '@/lib/types/securia';
import {
  Building,
  MapPin,
  Compass,
  Navigation,
  Key,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSiteCreated?: (site: ProtectedSite) => void;
  defaultCity?: string;
  defaultCoordinates?: [number, number];
}

export function CreateSiteModal({
  isOpen,
  onClose,
  onSiteCreated,
  defaultCity = 'Abidjan',
  defaultCoordinates,
}: CreateSiteModalProps) {
  const { addSite } = useSecuria();

  const [name, setName] = useState('');
  const [siteType, setSiteType] = useState<SiteType>('RESIDENCE');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [postalCode, setPostalCode] = useState('BP 01');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Coordonnées GPS explicites
  const [latitude, setLatitude] = useState<string>(
    defaultCoordinates ? String(defaultCoordinates[0]) : '5.3484'
  );
  const [longitude, setLongitude] = useState<string>(
    defaultCoordinates ? String(defaultCoordinates[1]) : '-4.0305'
  );

  const [isGeolocating, setIsGeolocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoMessage, setGeoMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  // 1. Détection GPS locale du navigateur
  const handleUseCurrentPosition = () => {
    if (!navigator.geolocation) {
      setGeoMessage({
        type: 'error',
        text: 'La géolocalisation n’est pas supportée par votre navigateur.',
      });
      return;
    }

    setIsGeolocating(true);
    setGeoMessage({ type: 'info', text: 'Acquisition du signal GPS haute précision...' });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lon = parseFloat(pos.coords.longitude.toFixed(6));
        setLatitude(String(lat));
        setLongitude(String(lon));
        setIsGeolocating(false);
        setGeoMessage({
          type: 'success',
          text: `Position GPS fixée avec succès (${lat}, ${lon}) - Précision ±${Math.round(pos.coords.accuracy)}m`,
        });
      },
      (err) => {
        setIsGeolocating(false);
        let errorMsg = 'Signal GPS faible ou indisponible.';
        if (err.code === 1 || err.message?.toLowerCase().includes('denied')) {
          errorMsg = 'Autorisation refusée. Veuillez autoriser la localisation dans les paramètres du navigateur ou de votre téléphone, ou cliquez sur « Géocoder adresse ».';
        } else if (err.code === 2) {
          errorMsg = 'Position GPS indisponible. Vérifiez que la localisation de votre appareil est bien activée.';
        } else if (err.code === 3) {
          errorMsg = 'Délai dépassé pour capter le signal GPS. Veuillez réessayer en extérieur ou utiliser le géocodage.';
        }
        setGeoMessage({
          type: 'error',
          text: `Échec GPS : ${errorMsg}`,
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // 2. Géocodage automatique à partir de l'adresse et de la ville
  const handleGeocodeAddress = async () => {
    if (!address.trim()) {
      setGeoMessage({ type: 'error', text: 'Veuillez saisir une adresse avant de lancer le géocodage.' });
      return;
    }

    setIsGeocoding(true);
    setGeoMessage({ type: 'info', text: 'Recherche des coordonnées géographiques...' });

    try {
      const query = encodeURIComponent(`${address}, ${city || 'Abidjan'}, Côte d'Ivoire`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
        headers: { 'Accept-Language': 'fr' },
      });

      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(parseFloat(results[0].lat).toFixed(6));
          const lon = parseFloat(parseFloat(results[0].lon).toFixed(6));
          setLatitude(String(lat));
          setLongitude(String(lon));
          setGeoMessage({
            type: 'success',
            text: `Adresse géocodée : [${lat}, ${lon}] (${results[0].display_name.substring(0, 50)}...)`,
          });
          return;
        }
      }

      // Si l'adresse exacte n'est pas répertoriée dans le cadastre OSM local, centrer sur le district avec message
      setGeoMessage({
        type: 'info',
        text: 'Adresse non répertoriée dans le cadastre mondial OSM. Coordonnées régionales appliquées, ajustez manuellement si nécessaire.',
      });
      setLatitude('5.3484');
      setLongitude('-4.0305');
    } catch {
      setGeoMessage({
        type: 'error',
        text: 'Service de géocodage indisponible. Saisissez les coordonnées ou utilisez le GPS.',
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  // 3. Soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Le nom du site est obligatoire.');
      return;
    }

    if (!address.trim()) {
      setFormError("L'adresse du site est obligatoire.");
      return;
    }

    const numLat = parseFloat(latitude);
    const numLon = parseFloat(longitude);

    if (isNaN(numLat) || isNaN(numLon)) {
      setFormError('Les coordonnées GPS (latitude et longitude) doivent être des nombres valides.');
      return;
    }

    if (numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
      setFormError('Les coordonnées GPS sont hors des limites terrestres valides.');
      return;
    }

    if (numLat === 0 && numLon === 0) {
      setFormError('Les coordonnées (0, 0) ne représentent pas une localisation opérationnelle valide.');
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await addSite({
        name: name.trim(),
        site_type: siteType,
        address: address.trim(),
        city: (city || 'Abidjan').trim(),
        postal_code: (postalCode || 'BP 01').trim(),
        latitude: numLat,
        longitude: numLon,
        access_instructions: accessInstructions.trim(),
        is_default: isDefault,
      });

      onSiteCreated?.(created);
      onClose();

      // Reset
      setName('');
      setAddress('');
      setCity(defaultCity);
      setPostalCode('BP 01');
      setAccessInstructions('');
      setIsDefault(false);
      setGeoMessage(null);
    } catch (err: any) {
      setFormError(err.message || "Erreur lors de l'enregistrement du site");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left space-y-5">
        {/* En-tête */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider">
                Nouveau Site Protégé (Dispatch / SOC)
              </h3>
              <p className="text-xs text-slate-400">
                Enregistre un lieu couvert avec repérage GPS certifié pour la carte tactique
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-500/60 text-red-200 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Nom du site & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-300 mb-1">
                Nom du site / Résidence <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex : Résidence Principale Cocody, Siège Pro..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Type de site</label>
              <select
                value={siteType}
                onChange={(e) => setSiteType(e.target.value as SiteType)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="RESIDENCE">Résidence</option>
                <option value="COMMERCE">Commerce</option>
                <option value="ENTREPRISE">Entreprise</option>
                <option value="AUTRE">Autre site</option>
              </select>
            </div>
          </div>

          {/* Adresse & Ville */}
          <div className="space-y-2">
            <div>
              <label className="block font-bold text-slate-300 mb-1">
                Adresse complète <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Numéro et nom de rue (ex : Rue des Jardins, Lot 45)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Ville / Commune</label>
                <input
                  type="text"
                  placeholder="Abidjan (Cocody, Plateau...)"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-300 mb-1">Code postal / Secteur</label>
                <input
                  type="text"
                  placeholder="BP 01"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section Coordonnées GPS (Priorité Étape 3) */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-extrabold uppercase text-cyan-300 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>Positionnement GPS pour la Carte</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseCurrentPosition}
                  disabled={isGeolocating}
                  className="py-1 px-2.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
                  title="Utiliser la géolocalisation du navigateur"
                >
                  {isGeolocating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
                  <span>Mon GPS</span>
                </button>

                <button
                  type="button"
                  onClick={handleGeocodeAddress}
                  disabled={isGeocoding}
                  className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                  title="Résoudre les coordonnées depuis l'adresse"
                >
                  {isGeocoding ? <Loader2 className="w-3 h-3 animate-spin text-amber-400" /> : <MapPin className="w-3 h-3 text-amber-400" />}
                  <span>Géocoder adresse</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Latitude <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="5.3484"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Longitude <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="-4.0305"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {geoMessage && (
              <div
                className={`p-2.5 rounded-xl text-[11px] leading-tight flex items-start gap-2 ${
                  geoMessage.type === 'success'
                    ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200'
                    : geoMessage.type === 'error'
                    ? 'bg-red-950/80 border border-red-500/50 text-red-200'
                    : 'bg-slate-900 border border-slate-800 text-slate-300'
                }`}
              >
                {geoMessage.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{geoMessage.text}</span>
              </div>
            )}
          </div>

          {/* Consignes d'accès */}
          <div>
            <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Consignes d'accès patrouille (Digicode, clé, alarme)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Ex : Digicode portail A: 4892B. Interphone Sécuria. Gardien de nuit."
              value={accessInstructions}
              onChange={(e) => setAccessInstructions(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Site par défaut */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultSite"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-cyan-500 rounded"
            />
            <label htmlFor="isDefaultSite" className="text-slate-300 cursor-pointer font-medium">
              Définir comme site principal d'intervention
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black shadow-lg shadow-cyan-950 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Enregistrer le Site</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

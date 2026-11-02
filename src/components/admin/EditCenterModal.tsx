'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  Shield,
  Phone,
  Mail,
  MapPin,
  Navigation,
  LocateFixed,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Users,
  Radio,
  Car,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface EditCenterModalProps {
  isOpen: boolean;
  center: any | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  organizations: Array<{ id: string; name: string; commercial_name?: string | null }>;
  isPlatformAdmin: boolean;
}

export function EditCenterModal({
  isOpen,
  center,
  onClose,
  onSuccess,
  organizations,
  isPlatformAdmin,
}: EditCenterModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (center) {
      setName(center.name || '');
      setCode(center.code || '');
      setOrganizationId(center.organization_id || '');
      setPhone(center.phone || '');
      setEmail(center.email || '');
      setAddress(center.address || '');
      setCity(center.city || '');
      setPostalCode(center.postal_code || '');
      setLatitude(center.latitude !== null && center.latitude !== undefined ? String(center.latitude) : '');
      setLongitude(center.longitude !== null && center.longitude !== undefined ? String(center.longitude) : '');
      setIsActive(center.is_active !== false);
      setErrorMsg('');
    }
  }, [center]);

  if (!isOpen || !center) return null;

  const hasActiveInterventions = (center.active_interventions_count || 0) > 0;
  const attachedAgents: any[] = Array.isArray(center.agents) ? center.agents : [];

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
      setErrorMsg('Le nom du centre de sécurité est obligatoire.');
      return;
    }
    if (!code.trim()) {
      setErrorMsg('Le code unique du centre est obligatoire.');
      return;
    }

    if (!isActive && hasActiveInterventions) {
      setErrorMsg(
        `Impossible de désactiver ce centre : ${center.active_interventions_count} intervention(s) sont en cours d'exécution.`
      );
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, any> = {
        id: center.id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        phone: phone.trim() || null,
        email: email.trim().toLowerCase() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        is_active: isActive,
      };

      if (isPlatformAdmin && organizationId && organizationId !== center.organization_id) {
        payload.organization_id = organizationId;
      }

      const res = await authFetch('/api/admin/centers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Erreur lors de la modification du centre de sécurité.');
        setLoading(false);
        return;
      }

      onSuccess(data.message || `Centre "${name}" mis à jour avec succès.`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Une erreur réseau est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Modifier le Centre de Sécurité
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-cyan-400 border border-slate-700">
                  {center.code}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {center.organization?.name || 'Organisation'} • ID: {center.id.substring(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire défilable */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-200 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Alerte intervention active */}
          {hasActiveInterventions && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2.5">
              <Radio className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-semibold">Missions en cours d’exécution : </span>
                Ce centre gère actuellement {center.active_interventions_count} intervention(s) active(s).
                La désactivation ou le transfert vers une autre organisation est strictement verrouillé.
              </div>
            </div>
          )}

          {/* Section 1 : Identification du Centre */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400/90 flex items-center gap-2">
              <Building className="w-4 h-4" />
              Identification & Rattachement
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nom du centre <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Code unique (matricule) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono tracking-wider text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>

            {/* Organisation */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Organisation propriétaire
              </label>
              {isPlatformAdmin ? (
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  disabled={attachedAgents.length > 0}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-60"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.commercial_name ? `(${org.commercial_name})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  disabled
                  value={center.organization?.name || 'Organisation'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-sm cursor-not-allowed"
                />
              )}
              {isPlatformAdmin && attachedAgents.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Le changement d'organisation est désactivé car des agents sont déjà rattachés à ce centre.
                </p>
              )}
            </div>
          </div>

          {/* Section 2 : Coordonnées de Contact */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Phone className="w-4 h-4 text-cyan-400" />
              Contacts Directs SOC
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Téléphone direct
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+225 27 20 00 00 00"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Adresse e-mail SOC
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="soc@horebsecure.ci"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 : Localisation */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Localisation Physique
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseAbidjanDefault}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                >
                  <Navigation className="w-3 h-3" />
                  Abidjan Centre
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleGetCurrentLocation}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  <LocateFixed className="w-3 h-3" />
                  Ma position
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Adresse physique
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Ville
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Code Postal
                </label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Latitude
                </label>
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Longitude
                </label>
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-700/80 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
            </div>
          </div>

          {/* Section 4 : Agents Rattachés au Centre */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Agents Rattachés ({attachedAgents.length})
              </h3>
            </div>

            {attachedAgents.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-950/30 border border-slate-800 text-center">
                Aucun agent de sécurité n’est actuellement affecté à ce centre.
              </p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                {attachedAgents.map((ag) => (
                  <div
                    key={ag.id}
                    className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xs font-mono font-bold">
                        {ag.badge_number?.substring(0, 4) || 'AGT'}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{ag.user?.full_name || 'Agent'}</p>
                        <p className="text-[11px] text-slate-400">{ag.user?.phone || ag.badge_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ag.duty_status === 'AVAILABLE'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : ag.duty_status === 'BUSY' || ag.duty_status === 'DISPATCHED'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {ag.duty_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5 : Statut Opérationnel */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white">Statut opérationnel du centre</p>
              <p className="text-[11px] text-slate-400">
                {hasActiveInterventions
                  ? 'Verrouillé : impossible de désactiver avec des interventions actives'
                  : 'Désactiver rend le centre indisponible pour de nouvelles affectations'}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                disabled={hasActiveInterventions}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer disabled:cursor-not-allowed"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50"></div>
            </label>
          </div>

          {/* Pied de formulaire */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-sm font-semibold shadow-lg shadow-cyan-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Sauvegarder</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

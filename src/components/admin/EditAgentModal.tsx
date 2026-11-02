'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Mail,
  User,
  Phone,
  Shield,
  Building,
  Car,
  CheckCircle2,
  AlertTriangle,
  Power,
  Radio,
  MapPin,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface EditAgentModalProps {
  isOpen: boolean;
  agent: any | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  organizations: Array<{ id: string; name: string; commercial_name?: string | null }>;
  securityCenters: Array<{ id: string; name: string; code: string; organization_id: string }>;
  isPlatformAdmin: boolean;
}

export function EditAgentModal({
  isOpen,
  agent,
  onClose,
  onSuccess,
  organizations,
  securityCenters,
  isPlatformAdmin,
}: EditAgentModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [patrolVehicle, setPatrolVehicle] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [securityCenterId, setSecurityCenterId] = useState('');
  const [dutyStatus, setDutyStatus] = useState<'OFF_DUTY' | 'AVAILABLE' | 'BUSY' | 'DISPATCHED'>('OFF_DUTY');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (agent) {
      setFullName(agent.user?.full_name || '');
      setPhone(agent.user?.phone || '');
      setBadgeNumber(agent.badge_number || '');
      setPatrolVehicle(agent.patrol_vehicle || '');
      setOrganizationId(agent.organization_id || '');
      setSecurityCenterId(agent.security_center_id || '');
      setDutyStatus(agent.duty_status || 'OFF_DUTY');
      setIsActive(agent.is_active !== false);
      setErrorMsg('');
    }
  }, [agent]);

  if (!isOpen || !agent) return null;

  const hasActiveMission = Boolean(agent.active_mission);
  const currentOrgId = organizationId || agent.organization_id;
  const filteredCenters = securityCenters.filter((sc) => sc.organization_id === currentOrgId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Le nom complet de l\'agent est obligatoire.');
      return;
    }
    if (!badgeNumber.trim()) {
      setErrorMsg('Le matricule (badge) de l\'agent est obligatoire.');
      return;
    }

    if (hasActiveMission && (!isActive || dutyStatus === 'OFF_DUTY')) {
      setErrorMsg(
        'Impossible de désactiver ou mettre hors service cet agent : une intervention opérationnelle est actuellement en cours. Veuillez réassigner la mission avant de modifier ce statut.'
      );
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        id: agent.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        badge_number: badgeNumber.trim(),
        patrol_vehicle: patrolVehicle.trim() || null,
        security_center_id: securityCenterId || null,
        duty_status: dutyStatus,
        is_active: isActive,
      };

      if (isPlatformAdmin) {
        payload.organization_id = organizationId || null;
      }

      const res = await authFetch('/api/admin/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour de l\'agent');
      }

      onSuccess(data.message || `Fiche agent ${badgeNumber} mise à jour avec succès.`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de mettre à jour l\'agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto space-y-5">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Gestion de l'Agent de Sécurité</span>
                <span className="font-mono text-xs text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                  {agent.badge_number}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Affectation opérationnelle, base SOC, matricule et statut de service
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message d'erreur */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Alerte si mission en cours */}
        {hasActiveMission && (
          <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Intervention Opérationnelle Active</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Cet agent est actuellement mobilisé sur une mission d'urgence (Statut:{' '}
              <span className="font-bold text-white">{agent.active_mission.status}</span>). La désactivation du
              compte ou le passage en statut hors service est temporairement bloqué pour préserver l'intervention.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email (Lecture seule / Identifiant Auth) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>Adresse Email (Compte Authentifié)</span>
            </label>
            <input
              type="email"
              value={agent.user?.email || ''}
              disabled
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-400 cursor-not-allowed font-mono"
            />
          </div>

          {/* Nom complet & Téléphone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Nom complet *</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="ex: Jean-Marc Koffi"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-cyan-400" />
                <span>Téléphone mobile</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="ex: +225 07 00 00 00 00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Organisation & Centre de Sécurité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-400" />
                <span>Entreprise (Tenant)</span>
              </label>
              {isPlatformAdmin ? (
                <select
                  value={organizationId}
                  onChange={(e) => {
                    setOrganizationId(e.target.value);
                    setSecurityCenterId('');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
                >
                  <option value="">Sélectionner une entreprise...</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name || org.commercial_name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={agent.organization?.name || 'Organisation locale'}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 cursor-not-allowed"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-400" />
                <span>Centre SOC / Base de Rattachement</span>
              </label>
              <select
                value={securityCenterId}
                onChange={(e) => setSecurityCenterId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
              >
                <option value="">Aucun centre attribué</option>
                {filteredCenters.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} ({sc.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Matricule & Véhicule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                <span>Matricule / Badge professionnel *</span>
              </label>
              <input
                type="text"
                required
                value={badgeNumber}
                onChange={(e) => setBadgeNumber(e.target.value.toUpperCase())}
                placeholder="ex: AGT-ABJ-042"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-cyan-400" />
                <span>Véhicule / Moyen de patrouille</span>
              </label>
              <input
                type="text"
                value={patrolVehicle}
                onChange={(e) => setPatrolVehicle(e.target.value)}
                placeholder="ex: Moto Yamaha 250 / Duster 4x4"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Statut Opérationnel (duty_status) */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="block text-xs font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Statut Opérationnel de Service</span>
              </span>
              <span className="text-[10px] text-slate-400">Contrôle régulateur & supervision</span>
            </label>

            <select
              value={dutyStatus}
              onChange={(e) => setDutyStatus(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold cursor-pointer"
            >
              <option value="OFF_DUTY">Hors Service / Repos (OFF_DUTY)</option>
              <option value="AVAILABLE">En Service / Disponible pour mission (AVAILABLE)</option>
              <option value="BUSY">En Intervention / Occupé sur site (BUSY)</option>
              <option value="DISPATCHED">En Route vers incident (DISPATCHED)</option>
            </select>
            <p className="text-[11px] text-slate-400 leading-normal">
              Note : L'activation d'un compte ne le passe jamais automatiquement en disponible. L'agent prend son service depuis son interface terrain.
            </p>
          </div>

          {/* Coordonnées GPS actuelles (lecture informative) */}
          {agent.current_latitude && agent.current_longitude && (
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-slate-400 text-[11px] block">Dernière position connue :</span>
                  <span className="font-mono text-cyan-300 font-semibold">
                    {agent.current_latitude.toFixed(4)}, {agent.current_longitude.toFixed(4)}
                  </span>
                </div>
              </div>
              {agent.last_location_update && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(agent.last_location_update).toLocaleTimeString('fr-FR')}
                </span>
              )}
            </div>
          )}

          {/* Statut Compte (Actif / Inactif) */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Power className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span>Compte Actif sur la Plateforme</span>
              </span>
              <p className="text-[11px] text-slate-400">
                Un agent désactivé ne peut plus se connecter ni recevoir d'affectation
              </p>
            </div>
            <button
              type="button"
              disabled={hasActiveMission}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hasActiveMission
                  ? 'bg-slate-800 opacity-50 cursor-not-allowed'
                  : isActive
                  ? 'bg-emerald-600'
                  : 'bg-slate-800'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-cyan-950 transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enregistrer les modifications</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

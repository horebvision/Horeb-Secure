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
  ShieldAlert,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface EditUserModalProps {
  isOpen: boolean;
  user: any | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  organizations: Array<{ id: string; name: string; commercial_name?: string | null }>;
  isPlatformAdmin: boolean;
  isSelf: boolean;
}

export function EditUserModal({
  isOpen,
  user,
  onClose,
  onSuccess,
  organizations,
  isPlatformAdmin,
  isSelf,
}: EditUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'USER' | 'AGENT' | 'SECURITY_MANAGER' | 'SECRETARY' | 'ADMIN'>('USER');
  const [organizationId, setOrganizationId] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [patrolVehicle, setPatrolVehicle] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setRole(user.role || 'USER');
      setOrganizationId(user.organization_id || '');
      setIsActive(user.is_active !== false);

      const agentData = Array.isArray(user.security_agents) ? user.security_agents[0] : user.security_agents;
      setBadgeNumber(agentData?.badge_number || '');
      setPatrolVehicle(agentData?.patrol_vehicle || '');
      setErrorMsg('');
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Le nom complet est obligatoire.');
      return;
    }

    if (isSelf && !isActive) {
      setErrorMsg('Vous ne pouvez pas désactiver votre propre compte administrateur.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        id: user.id,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        role,
        is_active: isActive,
      };

      if (isPlatformAdmin) {
        payload.organization_id = organizationId || null;
      }

      if (role === 'AGENT') {
        payload.badge_number = badgeNumber.trim() || null;
        payload.patrol_vehicle = patrolVehicle.trim() || null;
      }

      const res = await authFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la modification');
      }

      onSuccess(data.message || `Compte ${user.email} mis à jour avec succès.`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de mettre à jour le compte.');
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
              <h3 className="text-base font-extrabold text-white">Modifier le Compte Utilisateur</h3>
              <p className="text-xs text-slate-400 font-mono">{user.email}</p>
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
          {/* Email non modifiable */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Mail className="w-4 h-4 text-slate-500" />
              <span>Identifiant Email :</span>
              <span className="font-mono text-purple-300 font-bold">{user.email}</span>
            </div>
            {isSelf && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                VOTRE COMPTE
              </span>
            )}
          </div>

          {/* Identité & Téléphone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nom complet *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Numéro de téléphone
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  placeholder="ex: +225 07 00 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Rôle & Entreprise */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Rôle plateforme
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <select
                  disabled={isSelf}
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold ${
                    isSelf ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <option value="USER">Client Abonné (Résident / Entreprise)</option>
                  <option value="AGENT">Agent Patrouilleur Terrain</option>
                  <option value="SECURITY_MANAGER">Régulateur / Opérateur SOC</option>
                  <option value="SECRETARY">Secrétariat & Facturation</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>
              {isSelf && (
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Impossible de modifier votre propre rôle d'administrateur
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Entreprise de rattachement
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <select
                  disabled={!isPlatformAdmin}
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-semibold ${
                    !isPlatformAdmin ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  {isPlatformAdmin && <option value="">Plateforme SaaS Globale (Sans organisation)</option>}
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} {org.commercial_name ? `(${org.commercial_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Paramètres Patrouilleur */}
          {role === 'AGENT' && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-800/60 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                <Car className="w-4 h-4" />
                <span>Paramètres Patrouilleur Terrain</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Matricule agent (Badge)
                  </label>
                  <input
                    type="text"
                    value={badgeNumber}
                    onChange={(e) => setBadgeNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Véhicule de patrouille
                  </label>
                  <input
                    type="text"
                    value={patrolVehicle}
                    onChange={(e) => setPatrolVehicle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Statut d'activation */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-white block">
                Statut du compte : {isActive ? (
                  <span className="text-emerald-400">ACTIF & OPÉRATIONNEL</span>
                ) : (
                  <span className="text-rose-400">DÉSACTIVÉ (ACCÈS BLOQUÉ)</span>
                )}
              </span>
              <p className="text-[11px] text-slate-400">
                {isActive
                  ? 'L’utilisateur peut se connecter et exécuter ses missions.'
                  : 'L’utilisateur ne peut plus s’authentifier ni interagir avec le système.'}
              </p>
            </div>

            <button
              type="button"
              disabled={isSelf}
              onClick={() => setIsActive(!isActive)}
              className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                isSelf
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : isActive
                  ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700'
                  : 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isActive ? 'Désactiver' : 'Activer'}</span>
            </button>
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

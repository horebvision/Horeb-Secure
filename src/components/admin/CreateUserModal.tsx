'use client';

import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Mail,
  User,
  Phone,
  Shield,
  Building,
  Car,
  Key,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  organizations: Array<{ id: string; name: string; commercial_name?: string | null }>;
  isPlatformAdmin: boolean;
  defaultOrganizationId?: string | null;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
  organizations,
  isPlatformAdmin,
  defaultOrganizationId,
}: CreateUserModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'USER' | 'AGENT' | 'SECURITY_MANAGER' | 'SECRETARY' | 'ADMIN'>('USER');
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId || '');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [patrolVehicle, setPatrolVehicle] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Le nom complet est obligatoire.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Une adresse email valide est obligatoire.');
      return;
    }
    if (password && password.trim().length < 6) {
      setErrorMsg('Le mot de passe temporaire doit comporter au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, any> = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        role,
        is_active: isActive,
      };

      if (isPlatformAdmin) {
        payload.organization_id = organizationId || null;
      } else if (defaultOrganizationId) {
        payload.organization_id = defaultOrganizationId;
      }

      if (role === 'AGENT') {
        payload.badge_number = badgeNumber.trim() || null;
        payload.patrol_vehicle = patrolVehicle.trim() || null;
      }

      if (password.trim()) {
        payload.password = password.trim();
      }

      const res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du compte');
      }

      onSuccess(data.message || `Compte ${email} créé avec succès.`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Impossible de créer le compte utilisateur.');
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
            <div className="p-2.5 rounded-2xl bg-purple-950/80 border border-purple-800 text-purple-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Nouveau Compte Utilisateur</h3>
              <p className="text-xs text-slate-400">Création et affectation de rôle sur HOREB SECURE</p>
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
          {/* Identité */}
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
                  placeholder="ex: Cédric Ahossan"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email de connexion *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  placeholder="ex: agent.patrouille@horebsecure.ci"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Rôle attribué *
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer font-semibold"
                >
                  <option value="USER">Client Abonné (Résident / Entreprise)</option>
                  <option value="AGENT">Agent Patrouilleur Terrain</option>
                  <option value="SECURITY_MANAGER">Régulateur / Opérateur SOC</option>
                  <option value="SECRETARY">Secrétariat & Facturation</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>
            </div>
          </div>

          {/* Rattachement Entreprise */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Entreprise de rattachement (Tenant)
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <select
                disabled={!isPlatformAdmin}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-semibold ${
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

          {/* Configuration Spécifique Patrouilleur */}
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
                    placeholder="ex: AGT-042 ou AGT-SEC"
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
                    placeholder="ex: Toyota Hilux Alpha 1"
                    value={patrolVehicle}
                    onChange={(e) => setPatrolVehicle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mot de passe initial & Statut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mot de passe temporaire
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  placeholder="Par défaut: HorebSecure@2026!"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Statut initial du compte
              </label>
              <div className="flex items-center gap-3 h-9">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-950 border-slate-700"
                  />
                  <span>Compte actif et opérationnel</span>
                </label>
              </div>
            </div>
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
              className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-purple-950 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>{loading ? 'Création en cours...' : 'Créer le compte'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Play,
  Trash2,
  X,
  Mail,
  ChevronRight,
  ArrowLeft,
  MoreVertical,
  Building,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  MessageSquare,
  Smartphone,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useAuthGuard } from '@/lib/auth/use-auth-guard';
import { authFetch } from '@/lib/utils/api-client';
import type { UserRole } from '@/modules/users/types';

const ALLOWED_ROLES = ['ADMIN', 'SECURITY_MANAGER'] as const;

interface OrgUser {
  id: string;
  email: string;
  fullName: string;
  full_name?: string;
  role: UserRole;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED';
  createdAt: string;
  created_at?: string;
  phone?: string;
  updatedAt?: string;
}

interface CreatedCredentials {
  email: string;
  fullName: string;
  role: UserRole;
  roleLabel?: string;
  badgeNumber?: string;
  patrolVehicle?: string;
  temporaryPassword: string;
  loginUrl: string;
  activationUrl?: string;
}

export default function OrganizationUsersPage() {
  const { isAuthorized } = useAuthGuard(ALLOWED_ROLES as any);

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Recherche & Filtres
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Modal Invitation
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    role: 'SECURITY_MANAGER' as UserRole,
    phone: '',
    badgeNumber: '',
    patrolVehicle: '',
    password: '',
  });
  const [inviteLoading, setInviteLoading] = useState(false);

  // Identifiants générés après création / invitation
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal Modification Rôle
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('AGENT');
  const [actionLoading, setActionLoading] = useState(false);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Fallback
    }
  };

  const getWhatsAppMessage = (creds: CreatedCredentials) => {
    let header = '🔑 ACCÈS COLLABORATEUR — HOREB SECURE';
    let instructions = 'Connectez-vous pour accéder à votre espace de travail.';

    if (creds.role === 'SECRETARY') {
      header = '📋 ACCÈS POSTE SECRÉTARIAT & REGISTRE DES VISITEURS — HOREB SECURE';
      instructions =
        '👉 INSTRUCTIONS D\'ACCÈS :\n' +
        '1. Ouvrez le lien sur votre ordinateur ou tablette d\'accueil\n' +
        '2. Connectez-vous avec vos identifiants ci-dessous\n' +
        '3. Vous accéderez directement au Registre Numérique des Visiteurs (/secretariat) pour enregistrer les arrivées, scanner les pièces d\'identité et collecter les signatures.';
    } else if (creds.role === 'SECURITY_MANAGER') {
      header = '🚨 ACCÈS CONTRÔLEUR DISPATCH / RÉGULATEUR SOC — HOREB SECURE';
      instructions =
        '👉 INSTRUCTIONS DE PRISE DE POSTE :\n' +
        '1. Ouvrez le lien sur votre poste de supervision ou tablette\n' +
        '2. Connectez-vous avec vos identifiants ci-dessous\n' +
        '3. Vous accéderez directement à la Salle de Contrôle (/dispatch) pour superviser la carte tactique en temps réel, gérer les alertes d\'urgence et affecter les patrouilles.';
    } else if (creds.role === 'AGENT') {
      header = '🛡️ ACCÈS POSTE AGENT TERRAIN — HOREB SECURE';
      instructions =
        '👉 INSTRUCTIONS DE PRISE DE SERVICE :\n' +
        '1. Ouvrez le lien sur votre smartphone\n' +
        '2. Connectez-vous (accès direct à votre Poste Agent /agent)\n' +
        '3. Cliquez sur "🟢 Disponible" pour activer votre vacation et recevoir les missions d\'intervention.';
    } else if (creds.role === 'ADMIN') {
      header = '👑 ACCÈS ADMINISTRATEUR D\'ENTREPRISE — HOREB SECURE';
      instructions =
        '👉 INSTRUCTIONS D\'ACCÈS :\n' +
        '1. Connectez-vous sur votre espace de gestion\n' +
        '2. Vous aurez le contrôle intégral sur les sites protégés, les collaborateurs, la flotte et la facturation.';
    }

    return (
      `${header}\n\n` +
      `Bonjour ${creds.fullName},\n` +
      `Votre compte collaborateur (${creds.roleLabel || creds.role}) a été activé sur la plateforme HOREB SECURE.\n\n` +
      `📱 Lien de connexion : ${creds.loginUrl}\n` +
      (creds.activationUrl ? `🔗 Lien d'activation rapide : ${creds.activationUrl}\n` : '') +
      `👤 Identifiant (Email) : ${creds.email}\n` +
      `🔑 Mot de passe : ${creds.temporaryPassword}\n` +
      (creds.badgeNumber ? `🏷️ Matricule : ${creds.badgeNumber}\n` : '') +
      (creds.patrolVehicle ? `🚗 Véhicule : ${creds.patrolVehicle}\n` : '') +
      `\n${instructions}`
    );
  };

  // Détection du paramètre d'URL ?role=... pour pré-filtrer ou ouvrir directement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      if (roleParam && ['ADMIN', 'SECURITY_MANAGER', 'SECRETARY', 'AGENT', 'USER'].includes(roleParam)) {
        setRoleFilter(roleParam);
        setInviteForm((prev) => ({ ...prev, role: roleParam as UserRole }));
      }
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/organization/users');
      const data = await res.json();
      if (data.success) {
        const normalized: OrgUser[] = (data.users || []).map((u: any) => {
          const displayName = u.fullName || u.full_name || u.email?.split('@')[0] || 'Collaborateur';
          return {
            id: u.id,
            email: u.email || '',
            fullName: displayName,
            full_name: displayName,
            role: (u.role as UserRole) || 'USER',
            status: (u.status || (u.is_active ? 'ACTIVE' : 'SUSPENDED')) as OrgUser['status'],
            createdAt: u.createdAt || u.created_at || new Date().toISOString(),
            created_at: u.created_at || u.createdAt || new Date().toISOString(),
            phone: u.phone || '',
          };
        });
        setUsers(normalized);
      } else {
        setError(data.error || 'Erreur lors du chargement des membres');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) {
      fetchUsers();
    }
  }, [isAuthorized, fetchUsers]);

  // Filtrage
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.id.toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [users, roleFilter, searchQuery]);

  // Soumission invitation
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await authFetch('/api/organization/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(data.message || `Collaborateur ${inviteForm.fullName || inviteForm.email} enregistré`);
        setIsInviteOpen(false);

        // Si identifiants retournés, ouvrir le modal de remise des accès
        if (data.credentials) {
          setCreatedCredentials(data.credentials);
        }

        setInviteForm({
          fullName: '',
          email: '',
          role: 'SECURITY_MANAGER',
          phone: '',
          badgeNumber: '',
          patrolVehicle: '',
          password: '',
        });
        await fetchUsers();
      } else {
        setError(data.error || 'Erreur lors de l\'invitation');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de communication');
    } finally {
      setInviteLoading(false);
    }
  };

  // Modifier rôle
  const handleRoleChange = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await authFetch(`/api/organization/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();

      if (data.success) {
        const targetName = selectedUser.fullName || selectedUser.email;
        setSuccessMsg(`Rôle modifié avec succès : ${targetName} est désormais ${newRole}`);
        
        // Mise à jour immédiate optimiste de l'état local
        setUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u))
        );
        setSelectedUser(null);
        await fetchUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(data.error || 'Impossible de modifier le rôle');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la modification');
    } finally {
      setActionLoading(false);
    }
  };

  // Basculer statut (Suspendre / Réactiver)
  const handleToggleStatus = async (user: OrgUser) => {
    const nextStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setError(null);

    try {
      const res = await authFetch(`/api/organization/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Statut mis à jour pour ${user.fullName || user.email}`);
        await fetchUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(data.error || 'Erreur lors de la mise à jour');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Révoquer accès et supprimer le profil
  const handleRevoke = async (user: OrgUser) => {
    const targetName = user.fullName || user.email;
    if (!confirm(`Confirmez-vous la suppression et révocation définitive du profil de ${targetName} ?`)) {
      return;
    }
    setError(null);

    try {
      const res = await authFetch(`/api/organization/users/${user.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(`Profil de ${targetName} supprimé avec succès`);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        await fetchUsers();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(data.error || 'Erreur lors de la suppression');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/settings/organization" className="hover:text-slate-200">
            Mon Entreprise
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">Utilisateurs & Collaborateurs</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-400" />
              <span>Utilisateurs de l'Entreprise</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Gérez les administrateurs, régulateurs SOC et agents de terrain rattachés à votre espace sécurisé.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="p-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-300 transition"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            <button
              onClick={() => {
                setInviteForm((prev) => ({ ...prev, role: 'SECRETARY' }));
                setIsInviteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 rounded-xl text-emerald-300 font-bold text-xs transition"
              title="Inviter une secrétaire pour l'accueil et le registre des visiteurs"
            >
              <Building className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Secrétaire</span>
            </button>

            <button
              onClick={() => {
                setInviteForm((prev) => ({ ...prev, role: 'SECURITY_MANAGER' }));
                setIsInviteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 rounded-xl text-amber-300 font-bold text-xs transition"
              title="Créer un contrôleur dispatch / régulateur SOC"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Contrôleur Dispatch</span>
            </button>

            <button
              onClick={() => {
                setInviteForm((prev) => ({ ...prev, role: 'AGENT' }));
                setIsInviteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 rounded-xl text-cyan-300 font-bold text-xs transition"
              title="Ajouter un agent de terrain à la flotte"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Agent Terrain</span>
            </button>

            <button
              onClick={() => setIsInviteOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-white shadow-lg shadow-blue-500/20 transition text-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Inviter Collaborateur</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-800/60 rounded-xl flex items-center gap-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-950/60 border border-red-800/60 rounded-xl flex items-center justify-between text-red-300 text-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Recherche et Filtres */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
            <input
              type="text"
              placeholder="Rechercher par nom ou email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['ALL', 'ADMIN', 'SECURITY_MANAGER', 'SECRETARY', 'AGENT', 'USER'].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
                  roleFilter === r
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {r === 'ALL'
                  ? 'Tous'
                  : r === 'ADMIN'
                  ? 'Admin'
                  : r === 'SECURITY_MANAGER'
                  ? 'SOC Manager'
                  : r === 'SECRETARY'
                  ? 'Secrétaire'
                  : r === 'AGENT'
                  ? 'Agent'
                  : 'Client'}
              </button>
            ))}
          </div>
        </div>

        {/* Tableau des Utilisateurs */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-4">Collaborateur</th>
                  <th className="px-4 py-4">Rôle</th>
                  <th className="px-4 py-4">Statut</th>
                  <th className="px-4 py-4">Date d'ajout</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const getRoleStyle = (r: UserRole) => {
                    switch (r) {
                      case 'ADMIN':
                        return 'bg-purple-950/80 text-purple-300 border-purple-800';
                      case 'SECURITY_MANAGER':
                        return 'bg-amber-950/80 text-amber-300 border-amber-800';
                      case 'SECRETARY':
                        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
                      case 'AGENT':
                        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
                      default:
                        return 'bg-slate-800 text-slate-300 border-slate-700';
                    }
                  };

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white">{u.fullName}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span>{u.email}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold border ${getRoleStyle(
                            u.role
                          )}`}
                        >
                          {u.role === 'SECURITY_MANAGER'
                            ? 'SOC MANAGER'
                            : u.role === 'SECRETARY'
                            ? 'SECRÉTAIRE'
                            : u.role}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : u.status === 'INVITED'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : u.status === 'SUSPENDED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.status === 'ACTIVE'
                                ? 'bg-emerald-400'
                                : u.status === 'INVITED'
                                ? 'bg-blue-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          {u.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedUser(u);
                              setNewRole(u.role);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                            title="Modifier le rôle"
                          >
                            <Shield className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(u)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-lg transition"
                            title={u.status === 'SUSPENDED' ? 'Réactiver l\'utilisateur' : 'Suspendre l\'accès'}
                          >
                            {u.status === 'SUSPENDED' ? (
                              <Play className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Ban className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            onClick={() => handleRevoke(u)}
                            className="p-1.5 hover:bg-red-950/40 text-slate-400 hover:text-red-400 rounded-lg transition"
                            title="Révoquer l'accès"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-500">
                      Aucun collaborateur trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Invitation */}
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <UserPlus className="w-5 h-5 text-blue-400" />
                  <div>
                    <h2 className="text-base font-bold text-white">Créer / Inviter un Collaborateur</h2>
                    <p className="text-[11px] text-slate-400">Configurez l'accès et les identifiants pour ce poste</p>
                  </div>
                </div>
                <button onClick={() => setIsInviteOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleInviteSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Rôle Attribué <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="SECURITY_MANAGER">🚨 Contrôleur Dispatch / Régulateur SOC (Salle de Contrôle)</option>
                    <option value="SECRETARY">📋 Secrétaire / Accueil (Registre Visiteurs)</option>
                    <option value="AGENT">🛡️ Agent Terrain / Patrouilleur (Poste Mobile)</option>
                    <option value="ADMIN">👑 Administrateur de l'Entreprise</option>
                    <option value="USER">👤 Client Final / Résident</option>
                  </select>
                </div>

                {/* Explications contextuelles selon le rôle sélectionné */}
                {inviteForm.role === 'SECURITY_MANAGER' && (
                  <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
                    <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Poste Contrôleur Dispatch / Régulateur SOC</p>
                      <p className="text-slate-300 mt-0.5">
                        Ce collaborateur pilotera la Salle de Contrôle (<strong className="text-amber-300">/dispatch</strong>) : supervision de la carte tactique en direct, évaluation des SLA, affectation des interventions et communication radio avec les patrouilles.
                      </p>
                    </div>
                  </div>
                )}

                {inviteForm.role === 'SECRETARY' && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5">
                    <Building className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Poste Secrétariat & Accueil Numérique</p>
                      <p className="text-slate-300 mt-0.5">
                        Ce collaborateur aura accès exclusif au Registre des Visiteurs (<strong className="text-emerald-300">/secretariat</strong>) pour l'enregistrement d'accueil, le scan des pièces d'identité (CNI, Passeport), les signatures numériques et la remise de badges.
                      </p>
                    </div>
                  </div>
                )}

                {inviteForm.role === 'AGENT' && (
                  <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-xs text-cyan-300 flex items-start gap-2.5">
                    <Users className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">Poste Agent Terrain / Patrouille</p>
                      <p className="text-slate-300 mt-0.5">
                        L'agent utilisera son smartphone sur son Poste Terrain (<strong className="text-cyan-300">/agent</strong>) pour recevoir les missions d'intervention d'urgence, transmettre sa position GPS en temps réel et valider ses fiches d'intervention.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nom Complet <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Bakary Touré"
                      value={inviteForm.fullName}
                      onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Adresse Email <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="collaborateur@entreprise.ci"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Téléphone opérationnel
                    </label>
                    <input
                      type="tel"
                      placeholder="+225 07 00 00 00"
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Mot de passe initial
                    </label>
                    <input
                      type="text"
                      placeholder="HorebSecure@2026 (par défaut)"
                      value={inviteForm.password}
                      onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {inviteForm.role === 'AGENT' && (
                  <div className="space-y-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
                      Affectation Terrain & Patrouille
                    </span>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Badge / Matricule</label>
                        <input
                          type="text"
                          placeholder="AGT-ABJ-01"
                          value={inviteForm.badgeNumber}
                          onChange={(e) => setInviteForm({ ...inviteForm, badgeNumber: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Véhicule de patrouille</label>
                        <input
                          type="text"
                          placeholder="Patrouille Alpha"
                          value={inviteForm.patrolVehicle}
                          onChange={(e) => setInviteForm({ ...inviteForm, patrolVehicle: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsInviteOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow transition flex items-center gap-2"
                  >
                    {inviteLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enregistrement...
                      </>
                    ) : (
                      'Créer et Générer les Accès'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal d'Affichage et Remise des Identifiants Créés */}
        {createdCredentials && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-emerald-200">
                    Compte configuré avec succès pour {createdCredentials.fullName} !
                  </h3>
                  <p className="text-xs text-emerald-300/80 mt-0.5">
                    Rôle certifié : <strong>{createdCredentials.roleLabel || createdCredentials.role}</strong>. Transmettez-lui ses identifiants ci-dessous pour sa prise de fonction.
                  </p>
                </div>
              </div>

              {/* Boîte des identifiants */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" /> Identifiants de Connexion
                  </span>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                    {createdCredentials.role}
                  </span>
                </div>

                {/* Lien direct de connexion */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Lien direct de connexion
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdCredentials.loginUrl}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdCredentials.loginUrl, 'url')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                    >
                      {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'url' ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Identifiant (Email)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdCredentials.email}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                    >
                      {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'email' ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                </div>

                {/* Mot de passe */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Mot de passe initial
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative w-full">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        readOnly
                        value={createdCredentials.temporaryPassword}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-300 font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(createdCredentials.temporaryPassword, 'password')}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                    >
                      {copiedField === 'password' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === 'password' ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                </div>

                {/* Lien d'activation facultatif */}
                {createdCredentials.activationUrl && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Lien d'activation pour choisir son propre mot de passe
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdCredentials.activationUrl}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(createdCredentials.activationUrl!, 'actUrl')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg shrink-0 flex items-center gap-1.5 transition"
                      >
                        {copiedField === 'actUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedField === 'actUrl' ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton de copie du message complet WhatsApp / SMS */}
              <button
                type="button"
                onClick={() => copyToClipboard(getWhatsAppMessage(createdCredentials), 'msg')}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition"
              >
                {copiedField === 'msg' ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Message complet copié dans le presse-papier !</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" />
                    <span>Copier le message d'accès complet (WhatsApp / SMS / Email)</span>
                  </>
                )}
              </button>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCreatedCredentials(null)}
                  className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  Fermer &amp; Voir les Utilisateurs
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Modification Rôle */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-white text-sm">Modifier le Rôle</h3>
                <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Attribuer un nouveau niveau d'habilitation à{' '}
                  <strong className="text-white">
                    {selectedUser.fullName || selectedUser.full_name || selectedUser.email}
                  </strong>
                  .
                </p>

                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="AGENT">Agent Terrain / Patrouilleur</option>
                  <option value="SECRETARY">Secrétaire / Accueil (Registre Visiteurs)</option>
                  <option value="SECURITY_MANAGER">Régulateur SOC / Dispatch</option>
                  <option value="ADMIN">Administrateur de l'Entreprise</option>
                  <option value="USER">Client Final / Résident</option>
                </select>

                {newRole === 'SECRETARY' && (
                  <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Donne l'accès direct à l'espace Secrétariat et au registre numérique des visiteurs.</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleRoleChange}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition flex items-center gap-2"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

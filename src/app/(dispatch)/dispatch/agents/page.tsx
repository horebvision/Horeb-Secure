'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { AgentDutyStatus } from '@/lib/types/securia';
import {
  Users,
  Car,
  Phone,
  Shield,
  ArrowLeft,
  CheckCircle,
  Clock,
  Radio,
  RefreshCw,
  MapPin,
  ExternalLink,
  UserPlus,
  X,
  Key,
  BadgeCheck,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

interface AgentCredentials {
  email: string;
  fullName: string;
  role: string;
  badgeNumber?: string;
  patrolVehicle?: string;
  temporaryPassword: string;
  loginUrl: string;
}

export default function DispatchAgentsPage() {
  const { agents, refreshAgents, updateAgentDuty, alerts, currentUser } = useSecuria();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal Création d'Agent
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Identifiants générés pour l'agent
  const [createdCredentials, setCreatedCredentials] = useState<AgentCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [agentForm, setAgentForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    badgeNumber: '',
    patrolVehicle: 'Patrouille Alpha Horeb Secure',
    password: '',
  });

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch {
      // Fallback
    }
  };

  const getWhatsAppMessage = (creds: AgentCredentials) => {
    return (
      `🚨 ACCÈS POSTE AGENT TERRAIN — HOREB SECURE\n\n` +
      `Bonjour ${creds.fullName},\n` +
      `Votre profil d'agent de sécurité a été créé sur la plateforme HOREB SECURE.\n\n` +
      `📱 Lien de connexion : ${creds.loginUrl}\n` +
      `👤 Identifiant (Email) : ${creds.email}\n` +
      `🔑 Mot de passe : ${creds.temporaryPassword}\n` +
      (creds.badgeNumber ? `🏷️ Matricule : ${creds.badgeNumber}\n` : '') +
      (creds.patrolVehicle ? `🚗 Véhicule : ${creds.patrolVehicle}\n` : '') +
      `\n👉 INSTRUCTIONS POUR VOTRE VACATION :\n` +
      `1. Ouvrez le lien sur votre smartphone\n` +
      `2. Connectez-vous avec vos identifiants (vous accéderez automatiquement à votre Poste Agent Mobile)\n` +
      `3. Activez votre statut sur "Disponible" pour recevoir les alertes et missions d'intervention.`
    );
  };

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshAgents();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.fullName.trim() || !agentForm.email.trim()) {
      setFeedback({ type: 'error', message: 'Le nom et l\'adresse email de l\'agent sont requis.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await authFetch('/api/organization/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: agentForm.fullName.trim(),
          email: agentForm.email.trim(),
          phone: agentForm.phone.trim(),
          role: 'AGENT',
          badgeNumber: agentForm.badgeNumber.trim() || undefined,
          patrolVehicle: agentForm.patrolVehicle.trim() || 'Patrouille Alpha Horeb Secure',
          password: agentForm.password.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || `Agent ${agentForm.fullName} enregistré avec succès dans votre flotte !`,
        });
        if (data.credentials) {
          setCreatedCredentials(data.credentials);
        } else {
          setIsAddModalOpen(false);
        }
        setAgentForm({
          fullName: '',
          email: '',
          phone: '',
          badgeNumber: '',
          patrolVehicle: 'Patrouille Alpha Horeb Secure',
          password: '',
        });
        await refreshAgents();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la création de l\'agent.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossible de joindre le serveur.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgent = async (agent: any) => {
    const agentName =
      agent.full_name ||
      agent.user?.full_name ||
      agent.users?.full_name ||
      agent.agent_name ||
      agent.badge_number ||
      'cet agent';
    if (!confirm(`Confirmez-vous le retrait définitif de l'agent ${agentName} (${agent.badge_number || 'AGT'}) de votre flotte d'intervention ?`)) {
      return;
    }

    setDeletingId(agent.id);
    setFeedback(null);

    try {
      const targetId = agent.user_id || agent.id;
      const res = await authFetch(`/api/organization/users/${targetId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide.' }));

      if (data.success) {
        setFeedback({
          type: 'success',
          message: `L'agent ${agentName} a été retiré de votre flotte avec succès.`,
        });
        await refreshAgents();
        setTimeout(() => setFeedback(null), 5000);
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Erreur lors du retrait de l\'agent.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Impossible de joindre le serveur.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const canManageAgents = currentUser?.role === 'ADMIN' || currentUser?.role === 'SECURITY_MANAGER';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dispatch"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Salle de contrôle</span>
        </Link>
        <Link
          href="/dispatch/map"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-950/60 border border-cyan-800 px-3 py-1.5 rounded-xl"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Voir la carte tactique</span>
        </Link>
      </div>

      {/* Message de notification / feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/80 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">Flotte des Agents & Patrouilles</h1>
              <p className="text-xs text-slate-400">
                Gestion de la disponibilité et affectation opérationnelle des intervenants ({agents.length} agent{agents.length > 1 ? 's' : ''})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {canManageAgents && (
              <button
                onClick={() => {
                  setFeedback(null);
                  setIsAddModalOpen(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Nouvel Agent</span>
              </button>
            )}

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {/* Liste des agents */}
        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-950/60 border border-slate-800 text-slate-400">
              <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-60" />
              <h3 className="text-sm font-bold text-white mb-1">Aucun agent répertorié pour le moment</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                Les agents connectés ou enregistrés avec le profil AGENT apparaissent ici automatiquement avec leur géolocalisation en temps réel.
              </p>
              <button
                onClick={handleRefresh}
                className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recharger la flotte</span>
              </button>
            </div>
          ) : (
            agents.map((agent: any) => {
              const currentAssignment = alerts.find(
                (a) =>
                  a.assigned_agent_id === agent.id &&
                  !['RESOLVED', 'CANCELLED', 'FALSE_ALARM'].includes(a.status)
              );

              const hasGps = agent.latitude != null && agent.longitude != null && !isNaN(Number(agent.latitude));
              const latNum = hasGps ? Number(agent.latitude).toFixed(5) : null;
              const lonNum = hasGps ? Number(agent.longitude).toFixed(5) : null;

              const agentName =
                agent.full_name ||
                agent.user?.full_name ||
                agent.users?.full_name ||
                agent.agent_name ||
                `Agent ${agent.badge_number || 'AGT'}`;
              const agentPhone = agent.phone || agent.user?.phone || agent.users?.phone || '';
              const agentEmail = agent.email || agent.user?.email || agent.users?.email || '';
              const initials = (agentName.trim().split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2) || 'AG').toUpperCase();

              return (
                <div
                  key={agent.id}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start space-x-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-cyan-400 text-base shrink-0">
                      {initials}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-white">{agentName}</h3>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {agent.badge_number || 'AGT'}
                        </span>
                        {hasGps && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>GPS Actif</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        {agentPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{agentPhone}</span>
                          </span>
                        )}
                        {agentEmail && (
                          <>
                            {agentPhone && <span>•</span>}
                            <span>{agentEmail}</span>
                          </>
                        )}
                        {agent.patrol_vehicle && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300">{agent.patrol_vehicle}</span>
                          </>
                        )}
                      </div>

                      {hasGps && (
                        <div className="text-[11px] text-cyan-300 font-mono flex items-center gap-1.5 pt-0.5">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span>Position : {latNum}, {lonNum}</span>
                          <Link
                            href="/dispatch/map"
                            className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5 ml-1"
                          >
                            <span>Localiser</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        </div>
                      )}

                      {currentAssignment && (
                        <div className="pt-1">
                          <Link
                            href={`/dispatch/alerts/${currentAssignment.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:underline"
                          >
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                            <span>Engagé sur : {currentAssignment.alert_number} ({currentAssignment.type})</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sélecteur de statut de garde & Actions */}
                  <div className="flex items-center space-x-2 self-end md:self-center shrink-0">
                    {(['AVAILABLE', 'BUSY', 'OFF_DUTY'] as AgentDutyStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => updateAgentDuty(agent.id, st)}
                        className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                          (agent.duty_status || agent.agent_status) === st
                            ? st === 'AVAILABLE'
                              ? 'bg-emerald-600 text-white font-bold shadow shadow-emerald-950'
                              : st === 'BUSY'
                              ? 'bg-amber-600 text-white font-bold shadow shadow-amber-950'
                              : 'bg-slate-700 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {st === 'AVAILABLE'
                          ? '🟢 Disponible'
                          : st === 'BUSY'
                          ? '🟡 Occupé'
                          : '⚪ Hors service'}
                      </button>
                    ))}

                    {/* Bouton Retirer / Supprimer l'agent de la flotte */}
                    {canManageAgents && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAgent(agent)}
                        disabled={deletingId === agent.id}
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-900 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 transition disabled:opacity-50"
                        title="Retirer cet agent de la flotte"
                      >
                        <Trash2 className={`w-4 h-4 ${deletingId === agent.id ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Création Nouvel Agent */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5 text-left animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">Nouveau Profil Agent</h2>
                  <p className="text-xs text-slate-400">Intégrez un patrouilleur à votre flotte d'intervention</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setCreatedCredentials(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdCredentials ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-200">
                      Agent {createdCredentials.fullName} enregistré avec succès !
                    </h3>
                    <p className="text-xs text-emerald-300/80 mt-1">
                      Son profil est opérationnel. Transmettez-lui ses identifiants ci-dessous pour sa première connexion sur son smartphone.
                    </p>
                  </div>
                </div>

                {/* Carte des identifiants */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-400" /> Identifiants de Connexion
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                      Matricule : {createdCredentials.badgeNumber || 'AGT-AUTO'}
                    </span>
                  </div>

                  {/* URL */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Lien d'accès (Poste Mobile)
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
                </div>

                {/* Bouton de copie du message complet WhatsApp / SMS */}
                <button
                  type="button"
                  onClick={() => copyToClipboard(getWhatsAppMessage(createdCredentials), 'msg')}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition"
                >
                  {copiedField === 'msg' ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Message WhatsApp / SMS Copié dans le presse-papier !</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4" />
                      <span>Copier le message complet (WhatsApp / SMS) pour l'agent</span>
                    </>
                  )}
                </button>

                {/* Rappel des étapes */}
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-400">
                  <div className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400" /> Guide de prise de service :
                  </div>
                  <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] text-slate-400">
                    <li>L'agent ouvre son lien de connexion sur son smartphone.</li>
                    <li>Il saisit son email et son mot de passe initial.</li>
                    <li>Il arrive immédiatement sur son <strong>Poste Terrain (/agent)</strong>.</li>
                    <li>Il clique sur <strong>"🟢 Disponible"</strong> pour activer sa vacation et recevoir les missions.</li>
                  </ol>
                </div>

                {/* Bouton Terminer */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setCreatedCredentials(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                  >
                    Fermer &amp; Voir la Flotte
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAgent} className="space-y-4">
              {/* Nom & Prénom */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nom et prénom de l'agent <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Kouassi Jean-Marc"
                  value={agentForm.fullName}
                  onChange={(e) => setAgentForm({ ...agentForm, fullName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Email & Téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Email de connexion <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="agent.kouassi@horebsecure.ci"
                    value={agentForm.email}
                    onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Téléphone opérationnel
                  </label>
                  <input
                    type="tel"
                    placeholder="+225 07 00 00 00 00"
                    value={agentForm.phone}
                    onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Badge & Véhicule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Numéro de matricule / Badge
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: AGT-ABJ-04"
                    value={agentForm.badgeNumber}
                    onChange={(e) => setAgentForm({ ...agentForm, badgeNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Généré automatiquement si vide</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Véhicule affecté
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Toyota Hilux #02"
                    value={agentForm.patrolVehicle}
                    onChange={(e) => setAgentForm({ ...agentForm, patrolVehicle: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Mot de passe de premier accès */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Mot de passe temporaire initial
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="HorebSecure@2026 (par défaut)"
                    value={agentForm.password}
                    onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Permettra à l'agent de se connecter sur l'espace Poste Mobile Terrain (/agent)
                </span>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-cyan-950 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Création en cours...</span>
                    </>
                  ) : (
                    <>
                      <BadgeCheck className="w-4 h-4" />
                      <span>Créer &amp; Intégrer à la Flotte</span>
                    </>
                  )}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

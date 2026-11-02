'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import {
  Users,
  Building,
  UserPlus,
  Shield,
  ArrowLeft,
  Search,
  Plus,
  MapPin,
  Phone,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Archive,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Building2,
  X,
  Copy,
  Check,
  Send,
  Lock,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { Client, ClientType, ClientStatus } from '@/lib/clients/types';

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'ENTREPRISE', label: 'Entreprise' },
  { value: 'PARTICULIER', label: 'Particulier' },
  { value: 'RESIDENCE', label: 'Résidence Privée' },
  { value: 'COPROPRIETE', label: 'Copropriété' },
  { value: 'COMMERCE', label: 'Commerce' },
  { value: 'HOTEL', label: 'Hôtel' },
  { value: 'BANQUE', label: 'Banque' },
  { value: 'INDUSTRIE', label: 'Industrie' },
  { value: 'INSTITUTION', label: 'Institution' },
  { value: 'AUTRE', label: 'Autre' },
];

export default function DispatchClientsPage() {
  const { currentUser, sites, loadSites } = useSecuria();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Stats & Quota
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; max: number; plan: string }>({
    used: 0,
    max: 50,
    plan: 'PROFESSIONNEL',
  });

  // Modal Création Client
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Formulaire nouveau client
  const [newClient, setNewClient] = useState({
    name: '',
    client_type: 'ENTREPRISE' as ClientType,
    primary_contact_name: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    city: 'Abidjan',
    country: 'Côte d’Ivoire',
    notes: '',
    // Site initial optionnel
    create_initial_site: false,
    site_name: '',
    site_address: '',
    site_city: 'Abidjan',
    site_latitude: '5.3484',
    site_longitude: '-4.0305',
    // Invitation optionnelle
    invite_contact_now: true,
  });

  // Modal Invitation Utilisateur pour un client existant
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    full_name: '',
    phone: '',
    allowed_site_ids: [] as string[],
  });
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Client Users & Sites dans le drawer de détail
  const [clientUsers, setClientUsers] = useState<any[]>([]);
  const [loadingClientDetails, setLoadingClientDetails] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/clients');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.clients)) {
          setClients(data.clients);
          setQuotaInfo({
            used: data.count || data.clients.length,
            max: data.clients.length > 50 ? 100 : 50,
            plan: 'PROFESSIONNEL',
          });
        }
      }
    } catch (err) {
      console.warn('Erreur chargement clients:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Charger les utilisateurs d'un client sélectionné
  const loadClientUsers = useCallback(async (clientId: string) => {
    try {
      setLoadingClientDetails(true);
      const res = await authFetch(`/api/clients/${clientId}/users`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClientUsers(data.users || []);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement utilisateurs client:', err);
    } finally {
      setLoadingClientDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadClientUsers(selectedClient.id);
    } else {
      setClientUsers([]);
    }
  }, [selectedClient, loadClientUsers]);

  // Filtrage des clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.city && c.city.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clients, searchQuery, statusFilter]);

  // Soumission de la création rapide de client (Sections 9 & 10)
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name.trim()) {
      setFeedback({ type: 'error', message: 'La raison sociale ou nom du client est obligatoire.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await authFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClient.name.trim(),
          client_type: newClient.client_type,
          primary_contact_name: newClient.primary_contact_name.trim() || undefined,
          email: newClient.email.trim() || undefined,
          phone: newClient.phone.trim() || undefined,
          whatsapp: newClient.whatsapp.trim() || undefined,
          address: newClient.address.trim() || undefined,
          city: newClient.city.trim() || 'Abidjan',
          country: newClient.country.trim() || 'Côte d’Ivoire',
          notes: newClient.notes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 402 || data.code === 'QUOTA_EXCEEDED') {
          setFeedback({
            type: 'error',
            message:
              'Votre forfait actuel a atteint sa limite de clients. Contactez HOREB SECURE pour augmenter votre capacité.',
          });
        } else {
          setFeedback({ type: 'error', message: data.error || 'Erreur lors de la création du client.' });
        }
        setIsSubmitting(false);
        return;
      }

      const createdClientId = data.client.id;

      // Étape optionnelle : création du premier site si demandé
      if (newClient.create_initial_site && newClient.site_name.trim()) {
        try {
          await authFetch(`/api/clients/${createdClientId}/sites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newClient.site_name.trim(),
              address: newClient.site_address.trim() || newClient.address.trim() || 'Abidjan',
              city: newClient.site_city.trim() || 'Abidjan',
              latitude: parseFloat(newClient.site_latitude) || 5.3484,
              longitude: parseFloat(newClient.site_longitude) || -4.0305,
              site_type: 'RESIDENCE',
            }),
          });
          loadSites();
        } catch (sErr) {
          console.warn('Erreur création site initial:', sErr);
        }
      }

      // Étape optionnelle : invitation immédiate du contact principal
      let inviteUrl: string | null = null;
      if (newClient.invite_contact_now && newClient.email.trim()) {
        try {
          const invRes = await authFetch(`/api/clients/${createdClientId}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: newClient.email.trim(),
              full_name: newClient.primary_contact_name.trim() || newClient.name.trim(),
              phone: newClient.phone.trim() || undefined,
            }),
          });
          const invData = await invRes.json();
          if (invData.success && invData.inviteUrl) {
            inviteUrl = `${window.location.origin}${invData.inviteUrl}`;
          }
        } catch (iErr) {
          console.warn('Erreur invitation contact initial:', iErr);
        }
      }

      setFeedback({
        type: 'success',
        message: `Client "${data.client.name}" créé avec succès !${
          inviteUrl ? ' Lien d’invitation généré.' : ''
        }`,
      });

      if (inviteUrl) {
        setGeneratedInviteLink(inviteUrl);
      }

      // Réinitialiser le formulaire
      setNewClient({
        name: '',
        client_type: 'ENTREPRISE',
        primary_contact_name: '',
        email: '',
        phone: '',
        whatsapp: '',
        address: '',
        city: 'Abidjan',
        country: 'Côte d’Ivoire',
        notes: '',
        create_initial_site: false,
        site_name: '',
        site_address: '',
        site_city: 'Abidjan',
        site_latitude: '5.3484',
        site_longitude: '-4.0305',
        invite_contact_now: true,
      });

      setIsCreateModalOpen(false);
      setCreateStep(1);
      await loadClients();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Impossible de joindre le serveur.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Envoi d'une invitation client
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    if (!inviteForm.email.trim() || !inviteForm.full_name.trim()) {
      setFeedback({ type: 'error', message: 'Nom et adresse email sont obligatoires.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/clients/${selectedClient.id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          full_name: inviteForm.full_name.trim(),
          phone: inviteForm.phone.trim() || undefined,
          allowed_site_ids: inviteForm.allowed_site_ids,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const fullInviteUrl = `${window.location.origin}${data.inviteUrl}`;
        setGeneratedInviteLink(fullInviteUrl);
        setFeedback({
          type: 'success',
          message: `Invitation générée pour ${inviteForm.full_name} (${inviteForm.email}).`,
        });
        setIsInviteModalOpen(false);
        setInviteForm({ email: '', full_name: '', phone: '', allowed_site_ids: [] });
        loadClientUsers(selectedClient.id);
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la génération de l’invitation.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Changement de statut d'un client (Suspendre, Réactiver, Archiver)
  const handleStatusChange = async (clientId: string, newStatus: ClientStatus) => {
    try {
      const res = await authFetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Statut du client mis à jour vers "${newStatus}".`,
        });
        if (selectedClient && selectedClient.id === clientId) {
          setSelectedClient(data.client);
        }
        loadClients();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Échec de la mise à jour.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    }
  };

  // Suppression définitive d'un client
  const handleDeleteClient = async (clientId: string, clientName: string) => {
    if (
      !confirm(
        `Confirmez-vous la suppression DÉFINITIVE du client "${clientName}" ?\n\nCette action supprimera la fiche client, révoquera ses accès et détachera ses sites sans affecter l'historique d'audit.`
      )
    ) {
      return;
    }

    try {
      const res = await authFetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Client "${clientName}" supprimé définitivement avec succès.`,
        });
        setSelectedClient(null);
        await loadClients();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Erreur lors de la suppression du client.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erreur réseau lors de la suppression.',
      });
    }
  };

  // Sites rattachés au client sélectionné
  const clientSites = useMemo(() => {
    if (!selectedClient) return [];
    return sites.filter((s: any) => s.client_id === selectedClient.id);
  }, [selectedClient, sites]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barre de retour et Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dispatch"
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 mb-1">
              <Building2 className="w-3 h-3 text-cyan-400" />
              <span>Multi-Tenant Portfolio Clients</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Clients de la Société de Sécurité
            </h1>
            <p className="text-xs text-slate-400">
              Gérez vos entreprises et particuliers abonnés, attribuez leurs sites et invitez leurs utilisateurs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadClients}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setFeedback(null);
              setIsCreateModalOpen(true);
            }}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Client</span>
          </button>
        </div>
      </div>

      {/* Bannière de Quota & Métriques Multi-Tenant (Section 11 & 12) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Clients Abonnés</span>
            <Building className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">{clients.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Actifs : {clients.filter((c) => c.status === 'ACTIVE').length}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Quota Clients</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{quotaInfo.used}</span>
              <span className="text-xs text-slate-500 font-bold">/ {quotaInfo.max}</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.round((quotaInfo.used / quotaInfo.max) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sites Protégés</span>
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">
              {clients.reduce((acc, c) => acc + (c.sites_count || 0), 0)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Rattachés aux clients</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Accès Portail</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-white">
              {clients.reduce((acc, c) => acc + (c.users_count || 0), 0)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Utilisateurs finaux</span>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bannière Lien Invitation Généré */}
      {generatedInviteLink && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border border-cyan-700/60 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Lien d’activation généré pour le contact client</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono break-all">
              {generatedInviteLink}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(generatedInviteLink);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copié !' : 'Copier le lien'}</span>
            </button>
            <button
              onClick={() => setGeneratedInviteLink(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filtres et Recherche */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, contact, ville..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                statusFilter === st
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              {st === 'ALL'
                ? 'Tous'
                : st === 'ACTIVE'
                ? 'Actifs'
                : st === 'PENDING'
                ? 'En attente'
                : st === 'SUSPENDED'
                ? 'Suspendus'
                : 'Archivés'}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des Clients */}
      {loading && clients.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Chargement du portefeuille clients sécurisé...</span>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900/60 border border-slate-800/80 text-center space-y-3">
          <Building className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">Aucun client trouvé</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? 'Aucun résultat ne correspond à votre filtre de recherche.'
              : 'Commencez par ajouter votre premier client pour organiser ses sites et ses comptes d’accès.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Ajouter un client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const isSelected = selectedClient?.id === client.id;
            return (
              <div
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 shadow-xl shadow-cyan-950/30'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-cyan-400 uppercase tracking-wider">
                        {client.client_type}
                      </span>
                      <h3 className="text-base font-extrabold text-white mt-1.5 flex items-center gap-1.5">
                        {client.name}
                      </h3>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        client.status === 'ACTIVE'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                          : client.status === 'PENDING'
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                          : client.status === 'SUSPENDED'
                          ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {client.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 mb-4">
                    {client.primary_contact_name && (
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-slate-300 font-medium">{client.primary_contact_name}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{client.city}, {client.country || 'Côte d’Ivoire'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-slate-400 font-mono">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      <strong>{client.sites_count || 0}</strong> sites
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-400 font-mono">
                      <Users className="w-3 h-3 text-cyan-400" />
                      <strong>{client.users_count || 0}</strong> users
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClient(client.id, client.name);
                      }}
                      className="text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title={`Supprimer définitivement ${client.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClient(client);
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <span>Détails</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DRAWER LATÉRAL DE DÉTAIL CLIENT */}
      {selectedClient && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-slate-950 border-l border-slate-800 shadow-2xl z-50 overflow-y-auto p-6 sm:p-8 animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 uppercase">
                {selectedClient.client_type}
              </span>
              <h2 className="text-xl font-black text-white mt-1">{selectedClient.name}</h2>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="py-6 space-y-6">
            {/* Actions de Statut */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Statut Actuel</span>
                <span className="text-xs font-black text-white">{selectedClient.status}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedClient.status !== 'ACTIVE' && (
                  <button
                    onClick={() => handleStatusChange(selectedClient.id, 'ACTIVE')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold hover:bg-emerald-600/30 transition-colors"
                  >
                    Activer
                  </button>
                )}
                {selectedClient.status !== 'SUSPENDED' && (
                  <button
                    onClick={() => handleStatusChange(selectedClient.id, 'SUSPENDED')}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-400 text-xs font-bold hover:bg-amber-600/30 transition-colors"
                  >
                    Suspendre
                  </button>
                )}
                {selectedClient.status !== 'ARCHIVED' && (
                  <button
                    onClick={() => handleStatusChange(selectedClient.id, 'ARCHIVED')}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 text-rose-400 text-xs font-bold hover:bg-rose-600/30 transition-colors cursor-pointer"
                  >
                    Archiver
                  </button>
                )}
                <button
                  onClick={() => handleDeleteClient(selectedClient.id, selectedClient.name)}
                  className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-bold hover:bg-red-900/60 transition-colors flex items-center gap-1.5 cursor-pointer ml-1"
                  title="Supprimer définitivement ce client"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Coordonnées</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Contact Principal</span>
                  <span className="text-white font-medium">{selectedClient.primary_contact_name || 'Non renseigné'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Téléphone</span>
                  <span className="text-white font-medium">{selectedClient.phone || 'Non renseigné'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Email</span>
                  <span className="text-white font-medium truncate block">{selectedClient.email || 'Non renseigné'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Ville / Pays</span>
                  <span className="text-white font-medium">{selectedClient.city}, {selectedClient.country}</span>
                </div>
              </div>
            </div>

            {/* Sites Protégés du Client (Section 4) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sites Protégés ({clientSites.length})</span>
                </h4>
                <Link
                  href="/sites"
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  + Ajouter un site
                </Link>
              </div>

              {clientSites.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center text-xs text-slate-400">
                  Aucun site n’est encore directement rattaché à ce client.
                </div>
              ) : (
                <div className="space-y-2">
                  {clientSites.map((site: any) => (
                    <div
                      key={site.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">{site.name}</span>
                        <span className="text-[11px] text-slate-400">{site.address}, {site.city}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold">
                        Surveillé
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Utilisateurs du Client (Section 5 & 6) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Utilisateurs Clients ({clientUsers.length})</span>
                </h4>
                <button
                  onClick={() => {
                    setInviteForm({
                      email: selectedClient.email || '',
                      full_name: selectedClient.primary_contact_name || '',
                      phone: selectedClient.phone || '',
                      allowed_site_ids: clientSites.map((s: any) => s.id),
                    });
                    setIsInviteModalOpen(true);
                  }}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
                >
                  + Inviter un utilisateur
                </button>
              </div>

              {loadingClientDetails ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Chargement des utilisateurs...
                </div>
              ) : clientUsers.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center text-xs text-slate-400">
                  Aucun compte utilisateur actif. Cliquez sur "Inviter un utilisateur" pour accorder l’accès au Portail Client.
                </div>
              ) : (
                <div className="space-y-2">
                  {clientUsers.map((u: any) => (
                    <div
                      key={u.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white block">{u.full_name}</span>
                        <span className="text-[11px] text-slate-400">{u.email}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono font-bold">
                        CLIENT (USER)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CRÉATION RAPIDE DE CLIENT (Section 9 & 10) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Nouveau Client Abonné</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="mt-6 space-y-4">
              {/* Étape 1 : Informations Client */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Raison Sociale / Nom du Client *
                </label>
                <input
                  type="text"
                  required
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  placeholder="Ex: Hôtel Ivoire, Résidence Les Palmiers..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Type de Client</label>
                  <select
                    value={newClient.client_type}
                    onChange={(e) => setNewClient({ ...newClient, client_type: e.target.value as ClientType })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {CLIENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Ville</label>
                  <input
                    type="text"
                    value={newClient.city}
                    onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nom du Contact</label>
                  <input
                    type="text"
                    value={newClient.primary_contact_name}
                    onChange={(e) => setNewClient({ ...newClient, primary_contact_name: e.target.value })}
                    placeholder="Ex: M. Kouamé"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Email Contact</label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    placeholder="contact@client.ci"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    placeholder="+225 07 00 00 00 00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">WhatsApp</label>
                  <input
                    type="tel"
                    value={newClient.whatsapp}
                    onChange={(e) => setNewClient({ ...newClient, whatsapp: e.target.value })}
                    placeholder="+225 07 00 00 00 00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Optionnel : Premier Site Protégé */}
              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={newClient.create_initial_site}
                    onChange={(e) => setNewClient({ ...newClient, create_initial_site: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Créer simultanément le premier site protégé de ce client</span>
                </label>

                {newClient.create_initial_site && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Nom du Site</label>
                      <input
                        type="text"
                        value={newClient.site_name}
                        onChange={(e) => setNewClient({ ...newClient, site_name: e.target.value })}
                        placeholder="Ex: Siège Principal / Entrepôt Zone 4"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">Adresse</label>
                        <input
                          type="text"
                          value={newClient.site_address}
                          onChange={(e) => setNewClient({ ...newClient, site_address: e.target.value })}
                          placeholder="Boulevard de Marseille"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">Ville</label>
                        <input
                          type="text"
                          value={newClient.site_city}
                          onChange={(e) => setNewClient({ ...newClient, site_city: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optionnel : Invitation immédiate */}
              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={newClient.invite_contact_now}
                    onChange={(e) => setNewClient({ ...newClient, invite_contact_now: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Générer un lien d’activation sécurisé pour le contact principal</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-950 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Créer la fiche client</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INVITATION UTILISATEUR CLIENT (Section 6) */}
      {isInviteModalOpen && selectedClient && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">Inviter un Utilisateur Client</h3>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              L'utilisateur recevra un lien d'activation sécurisé pour accéder au Portail Client de{' '}
              <strong className="text-white">{selectedClient.name}</strong>. Rôle strict: <strong>USER</strong>.
            </p>

            <form onSubmit={handleInviteUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nom Complet *</label>
                <input
                  type="text"
                  required
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                  placeholder="Ex: Jean Kouassi"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Adresse Email Professionnelle *</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="jean.kouassi@entreprise.ci"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={inviteForm.phone}
                  onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  placeholder="+225 07 00 00 00 00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-950 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Génération...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Générer le lien d’activation</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

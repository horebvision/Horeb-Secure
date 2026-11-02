'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Webhook,
  Plus,
  RefreshCw,
  Send,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Key,
  Copy,
  ExternalLink,
  RotateCcw,
  Check,
  Eye,
  EyeOff,
  Activity,
  Layers,
  FileText,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import { IntegrationPartner, WebhookDelivery, WebhookEventType } from '@/lib/webhooks/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PartnerWithStats extends IntegrationPartner {
  stats?: {
    total_deliveries: number;
    success_count: number;
    failure_count: number;
    last_delivery_at: string | null;
  };
}

export default function IntegrationsPage() {
  const [partners, setPartners] = useState<PartnerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal Création / Édition
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedPartner, setSelectedPartner] = useState<PartnerWithStats | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'INSURER',
    endpoint_url: '',
    events: ['REPORT_VALIDATED'] as WebhookEventType[],
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Modal Secret affiché une seule fois
  const [newSecretModal, setNewSecretModal] = useState<{ open: boolean; secret: string; partnerName: string }>({
    open: false,
    secret: '',
    partnerName: '',
  });
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Modal Journal des Livraisons
  const [deliveriesModal, setDeliveriesModal] = useState<{ open: boolean; partner: PartnerWithStats | null }>({
    open: false,
    partner: null,
  });
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // État de test webhook
  const [testingPartnerId, setTestingPartnerId] = useState<string | null>(null);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch('/api/integrations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du chargement des partenaires');
      setPartners(data.partners || []);
    } catch (err: any) {
      setError(err.message || 'Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedPartner(null);
    setFormData({
      name: '',
      type: 'INSURER',
      endpoint_url: '',
      events: ['REPORT_VALIDATED'],
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: PartnerWithStats) => {
    setModalMode('edit');
    setSelectedPartner(p);
    setFormData({
      name: p.name,
      type: p.type,
      endpoint_url: p.endpoint_url,
      events: p.events || ['REPORT_VALIDATED'],
      status: p.status,
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormSubmitting(true);
      setError(null);

      if (modalMode === 'create') {
        const res = await authFetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur création partenaire');

        setIsModalOpen(false);
        setNewSecretModal({
          open: true,
          secret: data.secret,
          partnerName: formData.name,
        });
        await fetchPartners();
      } else if (selectedPartner) {
        const res = await authFetch(`/api/integrations/${selectedPartner.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur modification');

        setIsModalOpen(false);
        setSuccessMsg(`Partenaire "${formData.name}" mis à jour`);
        await fetchPartners();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (partner: PartnerWithStats) => {
    const newStatus = partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await authFetch(`/api/integrations/${partner.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur mise à jour');
      }
      setSuccessMsg(`Partenaire ${newStatus === 'ACTIVE' ? 'activé' : 'désactivé'}`);
      await fetchPartners();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRotateSecret = async (partner: PartnerWithStats) => {
    if (!confirm(`Régénérer le secret webhook pour ${partner.name} ? L'ancien secret sera immédiatement révoqué.`)) {
      return;
    }
    try {
      const res = await authFetch(`/api/integrations/${partner.id}/rotate-secret`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur régénération');

      setNewSecretModal({
        open: true,
        secret: data.secret,
        partnerName: partner.name,
      });
      setSuccessMsg('Secret HMAC régénéré');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestWebhook = async (partner: PartnerWithStats) => {
    try {
      setTestingPartnerId(partner.id);
      setError(null);
      const res = await authFetch(`/api/integrations/${partner.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du test');

      if (data.success) {
        setSuccessMsg(`Test réussi : HTTP ${data.delivery.response_code} vers ${partner.endpoint_url}`);
      } else {
        setError(`Échec test : ${data.delivery.last_error || 'Erreur inconnue'}`);
      }
      await fetchPartners();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingPartnerId(null);
    }
  };

  const openDeliveriesModal = async (partner: PartnerWithStats) => {
    setDeliveriesModal({ open: true, partner });
    try {
      setLoadingDeliveries(true);
      const res = await authFetch(`/api/integrations/${partner.id}/deliveries`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur chargement journal');
      setDeliveries(data.deliveries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleRetryDelivery = async (deliveryId: string) => {
    if (!deliveriesModal.partner) return;
    try {
      setRetryingId(deliveryId);
      const res = await authFetch(`/api/integrations/${deliveriesModal.partner.id}/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur réessai');

      setSuccessMsg('Réessai exécuté avec succès');
      // Rafraîchir livraisons
      const res2 = await authFetch(`/api/integrations/${deliveriesModal.partner.id}/deliveries`);
      const data2 = await res2.json();
      setDeliveries(data2.deliveries || []);
      await fetchPartners();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const toggleEventCheckbox = (evt: WebhookEventType) => {
    if (formData.events.includes(evt)) {
      if (formData.events.length === 1) return; // Garder au moins 1
      setFormData({ ...formData, events: formData.events.filter(e => e !== evt) });
    } else {
      setFormData({ ...formData, events: [...formData.events, evt] });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dispatch"
              className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition"
              title="Retour au Command Center"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Webhook className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Partenaires & Webhooks
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Phase 4 Production
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Transmission automatique des Proof of Intervention aux assureurs et systèmes tiers avec signature HMAC-SHA256
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchPartners}
              disabled={loading}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              title="Actualiser"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-sm transition shadow-lg shadow-emerald-950/40"
            >
              <Plus className="w-4 h-4" />
              Nouveau Partenaire
            </button>
          </div>
        </div>

        {/* Bannières Messages */}
        {error && (
          <div className="mt-4 p-4 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-3 text-red-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-3 text-emerald-200 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Chargement des intégrations partenaires...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="p-16 bg-slate-900/40 border border-slate-800/80 rounded-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Webhook className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Aucun partenaire configuré</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
              Connectez vos partenaires d'assurance ou vos systèmes tiers pour transmettre automatiquement les rapports validés et signés.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" />
              Configurer un premier partenaire
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {partners.map((partner) => {
              const stats = partner.stats;
              const isActive = partner.status === 'ACTIVE';

              return (
                <div
                  key={partner.id}
                  className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-5 hover:border-slate-700 transition"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/70">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl border ${isActive ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                        <Webhook className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-bold text-white">{partner.name}</h2>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                            isActive
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}>
                            {isActive ? 'ACTIF' : 'INACTIF'}
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-blue-500/10 border border-blue-500/20 text-blue-300">
                            {partner.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                          <span className="truncate max-w-md">{partner.endpoint_url}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Rapides */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleTestWebhook(partner)}
                        disabled={testingPartnerId === partner.id || !isActive}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition disabled:opacity-50"
                        title="Envoyer un événement synthétique test: true"
                      >
                        <Send className={`w-3.5 h-3.5 ${testingPartnerId === partner.id ? 'animate-pulse text-emerald-400' : ''}`} />
                        {testingPartnerId === partner.id ? 'Test en cours...' : 'Tester'}
                      </button>

                      <button
                        onClick={() => openDeliveriesModal(partner)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
                      >
                        <Activity className="w-3.5 h-3.5 text-blue-400" />
                        Livraisons ({stats?.total_deliveries || 0})
                      </button>

                      <button
                        onClick={() => handleRotateSecret(partner)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                        title="Régénérer le secret HMAC"
                      >
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        Secret
                      </button>

                      <button
                        onClick={() => openEditModal(partner)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                      >
                        Modifier
                      </button>

                      <button
                        onClick={() => handleToggleStatus(partner)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          isActive
                            ? 'bg-red-950/40 border-red-800/60 text-red-300 hover:bg-red-900/50'
                            : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50'
                        }`}
                      >
                        {isActive ? 'Désactiver' : 'Activer'}
                      </button>
                    </div>
                  </div>

                  {/* Ligne Info : Événements & Stats */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-1">Événements souscrits :</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {partner.events?.map((evt) => (
                          <span
                            key={evt}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono"
                          >
                            {evt}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-start md:justify-end gap-6 text-slate-400">
                      <div>
                        <span>Succès : </span>
                        <strong className="text-emerald-400 font-semibold">{stats?.success_count || 0}</strong>
                      </div>
                      <div>
                        <span>Échecs : </span>
                        <strong className="text-red-400 font-semibold">{stats?.failure_count || 0}</strong>
                      </div>
                      <div>
                        <span>Dernière : </span>
                        <span className="text-slate-300 font-mono">
                          {stats?.last_delivery_at
                            ? format(new Date(stats.last_delivery_at), 'dd/MM HH:mm', { locale: fr })
                            : 'Aucune'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CRÉATION / MODIFICATION PARTENAIRE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">
              {modalMode === 'create' ? 'Nouveau Partenaire Webhook' : `Modifier ${selectedPartner?.name}`}
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Configuration sécurisée du point de terminaison HTTPS et des souscriptions d'événements.
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nom de l'organisation partenaire</label>
                <input
                  type="text"
                  required
                  placeholder="Ex : AXA Assurances Incidents"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Type de partenaire</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="INSURER">Compagnie d'Assurance</option>
                  <option value="CLIENT_SYSTEM">Système Métier Client</option>
                  <option value="SECURITY_PARTNER">Partenaire Sécurité Tiers</option>
                  <option value="OTHER">Autre Intégration</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">URL du Webhook (HTTPS obligatoire)</label>
                <input
                  type="url"
                  required
                  placeholder="https://api.partenaire.com/horebsecure/webhooks"
                  value={formData.endpoint_url}
                  onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Protection anti-SSRF active. Les adresses IP privées et métadonnées cloud sont rejetées.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Événements déclencheurs</label>
                <div className="space-y-2">
                  {[
                    { id: 'REPORT_VALIDATED', label: 'Rapport Opérationnel Validé par SOC' },
                    { id: 'REPORT_SIGNED', label: 'Rapport Signé par le Client' },
                    { id: 'INTERVENTION_RESOLVED', label: 'Intervention Résolue' },
                  ].map((evt) => (
                    <label key={evt.id} className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(evt.id as WebhookEventType)}
                        onChange={() => toggleEventCheckbox(evt.id as WebhookEventType)}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span>{evt.label}</span>
                      <span className="font-mono text-[10px] text-slate-500">({evt.id})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition disabled:opacity-50"
                >
                  {formSubmitting ? 'Enregistrement...' : modalMode === 'create' ? 'Générer & Activer' : 'Mettre à jour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SECRET CRÉÉ / RÉGÉNÉRÉ (AFFICHÉ UNE SEULE FOIS) */}
      {newSecretModal.open && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <Key className="w-6 h-6" />
              <h2 className="text-lg font-bold text-white">Secret Webhook Généré</h2>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Voici le secret de signature HMAC pour <strong className="text-white">{newSecretModal.partnerName}</strong>.
              Conservez-le immédiatement dans vos variables d'environnement. Pour des raisons de sécurité,{' '}
              <strong className="text-amber-400">ce secret ne sera plus jamais affiché</strong>.
            </p>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl mb-4 flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-emerald-300 break-all select-all">
                {newSecretModal.secret}
              </code>
              <button
                onClick={() => copyToClipboard(newSecretModal.secret)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1.5"
                title="Copier le secret"
              >
                {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSecret ? 'Copié !' : 'Copier'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1 mb-6">
              <div className="font-semibold text-slate-300">En-têtes HTTP envoyés :</div>
              <div><code>X-SECURIA-Signature</code> : Hash HMAC-SHA256 hexadécimal</div>
              <div><code>X-SECURIA-Timestamp</code> : Timestamp Unix millisecondes (fenêtre max 300s)</div>
            </div>

            <button
              onClick={() => setNewSecretModal({ open: false, secret: '', partnerName: '' })}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
            >
              J'ai copié et sauvegardé le secret en sécurité
            </button>
          </div>
        </div>
      )}

      {/* MODAL JOURNAL DES LIVRAISONS & RETRIES */}
      {deliveriesModal.open && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-400" />
                <div>
                  <h2 className="text-lg font-bold text-white">Journal des Livraisons</h2>
                  <p className="text-xs text-slate-400">
                    Historique des webhooks pour <strong className="text-white">{deliveriesModal.partner?.name}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeliveriesModal({ open: false, partner: null })}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Tableau Livraisons */}
            <div className="flex-1 overflow-y-auto mt-4 pr-1">
              {loadingDeliveries ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mb-2" />
                  <span className="text-xs">Chargement de l'historique...</span>
                </div>
              ) : deliveries.length === 0 ? (
                <div className="text-center p-12 text-slate-400 text-xs">
                  Aucun événement n'a encore été délivré à ce partenaire.
                </div>
              ) : (
                <div className="space-y-2">
                  {deliveries.map((delivery) => {
                    const isSuccess = delivery.status === 'SUCCESS';
                    const isRetrying = delivery.status === 'RETRYING';
                    const isFailed = delivery.status === 'FAILED';

                    return (
                      <div
                        key={delivery.id}
                        className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] border ${
                              isSuccess
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : isRetrying
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                              {delivery.status}
                            </span>
                            <span className="font-mono text-slate-300 font-semibold">{delivery.event_type}</span>
                            <span className="text-slate-500 font-mono text-[10px]">{delivery.event_id}</span>
                          </div>

                          <div className="text-slate-400 flex items-center gap-4 text-[11px]">
                            <span>HTTP {delivery.response_code || 'N/A'}</span>
                            <span>Essai #{delivery.attempt_count}</span>
                            <span>
                              {delivery.sent_at
                                ? format(new Date(delivery.sent_at), 'dd/MM/yyyy HH:mm:ss', { locale: fr })
                                : 'En attente'}
                            </span>
                          </div>

                          {delivery.last_error && (
                            <div className="text-red-400 text-[11px] font-mono">
                              Erreur : {delivery.last_error}
                            </div>
                          )}
                          {isRetrying && delivery.next_retry_at && (
                            <div className="text-amber-400 text-[11px]">
                              Prochain essai prévu à : {format(new Date(delivery.next_retry_at), 'HH:mm:ss', { locale: fr })}
                            </div>
                          )}
                        </div>

                        {/* Action Réessayer si échec ou retrying */}
                        {(isFailed || isRetrying) && (
                          <button
                            onClick={() => handleRetryDelivery(delivery.id)}
                            disabled={retryingId === delivery.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition self-start md:self-center disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retryingId === delivery.id ? 'animate-spin text-emerald-400' : ''}`} />
                            <span>{retryingId === delivery.id ? 'Réessai...' : 'Réessayer'}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

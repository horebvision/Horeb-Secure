'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Building,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Download,
  Calendar,
  Shield,
  FileText,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  X,
  Send,
  HelpCircle,
} from 'lucide-react';
import { useSecuria } from '@/lib/store/securia-context';
import type { SubscriptionWithPlan, Invoice, UsageSummary } from '@/lib/billing/types';
import { authFetch } from '@/lib/utils/api-client';

export default function BillingPage() {
  const { currentUser, currentRole } = useSecuria();

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadBillingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, usageRes, invRes] = await Promise.all([
        authFetch('/api/billing/subscription'),
        authFetch('/api/billing/usage'),
        authFetch('/api/billing/invoices'),
      ]);

      if (subRes.ok) {
        const subData = await subRes.json();
        const resolvedSub = subData.subscription
          ? { ...subData.subscription, plan: subData.plan || subData.subscription.plan }
          : subData;
        setSubscription(resolvedSub);
      }
      if (usageRes.ok) {
        const usageData = await usageRes.json();
        const rawUsage = usageData.usage || usageData;
        const m = rawUsage.metrics || usageData.stats?.metrics;
        const normalizedUsage: UsageSummary = {
          users: rawUsage.users || {
            used: m?.maxUsers?.current || 0,
            limit: m?.maxUsers?.max || 25,
            percentage: m?.maxUsers?.percentage || 0,
          },
          agents: rawUsage.agents || {
            used: m?.maxAgents?.current || 0,
            limit: m?.maxAgents?.max || 50,
            percentage: m?.maxAgents?.percentage || 0,
          },
          sites: rawUsage.sites || {
            used: m?.maxSites?.current || 0,
            limit: m?.maxSites?.max || 25,
            percentage: m?.maxSites?.percentage || 0,
          },
          clients: rawUsage.clients || {
            used: m?.maxClients?.current || 0,
            limit: m?.maxClients?.max || 50,
            percentage: m?.maxClients?.percentage || 0,
          },
          interventions: rawUsage.interventions || {
            used: m?.maxInterventionsMonth?.current || 0,
            limit: m?.maxInterventionsMonth?.max || 100,
            percentage: m?.maxInterventionsMonth?.percentage || 0,
          },
          apiKeys: rawUsage.apiKeys || {
            used: m?.maxApiKeys?.current || 0,
            limit: m?.maxApiKeys?.max || 5,
            percentage: m?.maxApiKeys?.percentage || 0,
          },
          webhooks: rawUsage.webhooks || {
            used: m?.maxWebhooks?.current || 0,
            limit: m?.maxWebhooks?.max || 5,
            percentage: m?.maxWebhooks?.percentage || 0,
          },
        };
        setUsage(normalizedUsage);
      }
      if (invRes.ok) {
        const invData = await invRes.json();
        const invList = Array.isArray(invData)
          ? invData
          : Array.isArray(invData?.invoices)
          ? invData.invoices
          : [];
        setInvoices(invList);
      }
    } catch (err: any) {
      setError('Impossible de charger les données de facturation.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingData();
  }, []);

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const res = await authFetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CANCEL',
          reason: cancelReason || 'Non précisé',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la demande d&apos;annulation');
      }

      setIsCancelModalOpen(false);
      setActionSuccess('Votre abonnement restera actif jusqu&apos;à la fin de la période en cours.');
      await loadBillingData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const formatPrice = (amount?: number | null) => {
    return new Intl.NumberFormat('fr-FR').format(amount || 0);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            Abonnement Actif
          </span>
        );
      case 'TRIAL':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-800">
            Période d&apos;Essai
          </span>
        );
      case 'PAST_DUE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-800 animate-pulse">
            Facture en Retard
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-950/80 text-red-400 border border-red-800">
            Compte Suspendu
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
            Résilié
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            RÉGLÉE
          </span>
        );
      case 'PENDING':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800">
            EN ATTENTE
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800">
            ÉCHUE
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/business" className="hover:text-slate-200 transition-colors">
              Business OS
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold">Abonnement & Facturation</span>
          </div>

          <button
            onClick={loadBillingData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>

        {/* Header Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Abonnement & Facturation SaaS
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gérez votre forfait HOREB SECURE, vos quotas d&apos;exploitation et vos règlements en FCFA.
          </p>
        </div>

        {/* Notifications / Alerts */}
        {actionSuccess && (
          <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-emerald-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {subscription?.status === 'TRIAL' && (
          <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-800/80 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-white">Votre organisation est en période d&apos;essai gratuit.</span>
                <p className="text-amber-300/80 text-[11px] mt-0.5">
                  Fin de l&apos;essai : {subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString('fr-FR') : 'Non défini'}.
                  Activez un forfait payant pour garantir la continuité opérationnelle.
                </p>
              </div>
            </div>
            <Link
              href="/billing/upgrade"
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0"
            >
              <span>Activer un abonnement</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Section 1 : Carte Plan Actuel & Quotas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Carte Plan */}
          <div className="lg:col-span-1 rounded-2xl bg-slate-900/80 border border-slate-800 p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Plan Actuel
                </span>
                {subscription ? getStatusBadge(subscription.status) : null}
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">
                {subscription?.plan?.name || 'PLAN ACTIF'}
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                {subscription?.plan?.description || 'Gestion des opérations de sécurité.'}
              </p>

              <div className="mb-6 p-4 rounded-xl bg-slate-950/70 border border-slate-800/60">
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Montant d&apos;abonnement</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-extrabold text-white">
                    {subscription?.amount ? formatPrice(subscription.amount) : '499 000'}
                  </span>
                  <span className="text-xs font-bold text-cyan-400">
                    {subscription?.currency || 'FCFA'} / {(subscription?.billingCycle || (subscription as any)?.billing_cycle) === 'YEARLY' ? 'an' : 'mois'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Échéance :{' '}
                    {(subscription?.currentPeriodEnd || (subscription as any)?.current_period_end)
                      ? new Date(subscription?.currentPeriodEnd || (subscription as any)?.current_period_end).toLocaleDateString('fr-FR')
                      : 'Non renseigné'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-slate-800/80">
              <Link
                href="/billing/upgrade"
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-cyan-950/50"
              >
                <span>Changer de Plan / Mettre à niveau</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  Coordonnées bancaires
                </button>
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className="py-2 px-3 rounded-lg bg-slate-950 hover:bg-red-950/50 border border-slate-800 hover:border-red-800 text-slate-400 hover:text-red-300 text-xs font-medium transition-colors"
                >
                  Résiliation
                </button>
              </div>
            </div>
          </div>

          {/* Carte Consommation des Quotas */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/80 border border-slate-800 p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Utilisation & Quotas du Plan</h3>
                  <p className="text-xs text-slate-400">
                    Consommation en temps réel des ressources allouées à votre organisation.
                  </p>
                </div>
                <Link
                  href="/settings/usage"
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <span>Détail complet</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Barres de progression des quotas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
                {/* Agents */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">Agents Terrain</span>
                    <span className="font-bold text-white">
                      {usage?.agents?.used ?? 0} / {usage?.agents?.limit === -1 ? 'Illimités' : (usage?.agents?.limit ?? 50)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        (usage?.agents?.percentage ?? 0) >= 90
                          ? 'bg-rose-500'
                          : (usage?.agents?.percentage ?? 0) >= 75
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(usage?.agents?.percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Sites */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">Sites Protégés</span>
                    <span className="font-bold text-white">
                      {usage?.sites?.used ?? 0} / {usage?.sites?.limit === -1 ? 'Illimités' : (usage?.sites?.limit ?? 25)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        (usage?.sites?.percentage ?? 0) >= 90
                          ? 'bg-rose-500'
                          : (usage?.sites?.percentage ?? 0) >= 75
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(usage?.sites?.percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Utilisateurs */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">Utilisateurs Superviseurs</span>
                    <span className="font-bold text-white">
                      {usage?.users?.used ?? 0} / {usage?.users?.limit === -1 ? 'Illimités' : (usage?.users?.limit ?? 25)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-cyan-500 transition-all duration-500"
                      style={{ width: `${Math.min(usage?.users?.percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Interventions */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">Interventions du mois</span>
                    <span className="font-bold text-white">
                      {usage?.interventions?.used ?? 0} /{' '}
                      {usage?.interventions?.limit === -1 ? 'Illimitées' : (usage?.interventions?.limit ?? 100)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-cyan-500 transition-all duration-500"
                      style={{ width: `${Math.min(usage?.interventions?.percentage ?? 0, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Multi-Tenant & RLS Actif — Données strictement isolées pour votre société.</span>
              </div>
              <Link
                href="/settings/organization"
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Paramètres organisation &rarr;
              </Link>
            </div>
          </div>
        </div>

        {/* Section 2 : Historique des Factures */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">Factures & Justificatifs de Paiement</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Factures normalisées avec TVA (18%) et mentions légales Côte d&apos;Ivoire.
              </p>
            </div>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
              <span>Modalités de Paiement CI</span>
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">Aucune facture enregistrée pour le moment</p>
              <p className="text-xs text-slate-500 mt-1">
                Vos prochaines factures d&apos;abonnement apparaîtront ici à chaque cycle de facturation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px] font-bold">
                    <th className="pb-3 pl-2">Numéro</th>
                    <th className="pb-3">Date d&apos;émission</th>
                    <th className="pb-3">Période</th>
                    <th className="pb-3">Montant TTC</th>
                    <th className="pb-3">Statut</th>
                    <th className="pb-3 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(invoices || []).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 pl-2 font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-cyan-400" />
                        <span>{inv.invoiceNumber || inv.invoice_number || 'INV-000'}</span>
                      </td>
                      <td className="py-3.5 text-slate-300">
                        {inv.createdAt || inv.created_at
                          ? new Date(inv.createdAt || inv.created_at).toLocaleDateString('fr-FR')
                          : '-'}
                      </td>
                      <td className="py-3.5 text-slate-400">
                        {inv.periodStart || inv.period_start
                          ? new Date(inv.periodStart || inv.period_start).toLocaleDateString('fr-FR')
                          : '-'}{' '}
                        au{' '}
                        {inv.periodEnd || inv.period_end
                          ? new Date(inv.periodEnd || inv.period_end).toLocaleDateString('fr-FR')
                          : '-'}
                      </td>
                      <td className="py-3.5 font-bold text-white">
                        {formatPrice(inv.total)} <span className="text-cyan-400">{inv.currency || 'XOF'}</span>
                      </td>
                      <td className="py-3.5">{getInvoiceStatusBadge(inv.status)}</td>
                      <td className="py-3.5 pr-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                        >
                          Détails & Proforma
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Détails Facture */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-white">
                  Facture {(selectedInvoice as any).invoiceNumber || selectedInvoice.invoice_number || 'INV-000'}
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Émise le {((selectedInvoice as any).createdAt || selectedInvoice.created_at) ? new Date((selectedInvoice as any).createdAt || selectedInvoice.created_at).toLocaleDateString('fr-FR') : '-'} — Échéance :{' '}
                {((selectedInvoice as any).dueDate || selectedInvoice.due_date) ? new Date((selectedInvoice as any).dueDate || selectedInvoice.due_date).toLocaleDateString('fr-FR') : '-'}
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Sous-total HT :</span>
                <span className="font-bold text-white">
                  {formatPrice(selectedInvoice.subtotal)} {selectedInvoice.currency}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">TVA Côte d&apos;Ivoire (18%) :</span>
                <span className="font-bold text-white">
                  {formatPrice(selectedInvoice.tax)} {selectedInvoice.currency}
                </span>
              </div>
              {(selectedInvoice.discount ?? 0) > 0 && (
                <div className="flex justify-between py-1 border-b border-slate-800/60 text-emerald-400">
                  <span>Remise accordée :</span>
                  <span>
                    -{formatPrice(selectedInvoice.discount)} {selectedInvoice.currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 text-sm">
                <span className="font-bold text-white">Total TTC :</span>
                <span className="font-black text-cyan-400">
                  {formatPrice(selectedInvoice.total)} {selectedInvoice.currency}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <a
                href={`/api/fiscal/invoices/${selectedInvoice.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-cyan-800/40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger Facture PDF</span>
              </a>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Fermer
              </button>
              {selectedInvoice.status !== 'PAID' && (
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    setIsPaymentModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Régler cette facture</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Coordonnées Bancaires & Paiement Local */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <button
              onClick={() => setIsPaymentModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building className="w-5 h-5 text-cyan-400" />
                <span>Modalités de Règlement — Côte d&apos;Ivoire</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Paiement direct sécurisé pour les entreprises de sécurité et gardiennage.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              {/* Virement Bancaire */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="font-bold text-white mb-2 flex items-center justify-between">
                  <span>1. Virement Bancaire UEMOA (Recommandé)</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded">BACI / SGCI</span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                  <div>Bénéficiaire : HOREB SECURE TECHNOLOGIES CI</div>
                  <div>Banque : Banque Atlantique Côte d&apos;Ivoire (BACI)</div>
                  <div>IBAN / RIB : CI092 01001 002345678901 45</div>
                  <div>Code Guichet : 01001 | Code Banque : CI092</div>
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  Mentionnez votre numéro de facture en référence de virement (ex: SEC-2026-XXXXXX).
                </div>
              </div>

              {/* Mobile Money */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="font-bold text-white mb-2 flex items-center justify-between">
                  <span>2. Paiement en Ligne (Mobile Money)</span>
                  <span className="text-[10px] text-amber-400 bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 rounded">
                    Configuration en cours
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  Passerelles Orange / Wave / MTN en cours de validation opérateur.
                </p>
                <div className="mt-1 text-[10px] text-slate-400">
                  Paiement disponible sur validation administrative / confirmation de facture par nos services comptables.
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
              >
                J&apos;ai compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Résiliation */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Résilier l&apos;abonnement</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Votre organisation conservera tous ses accès jusqu&apos;à la fin de la période en cours.
                Vos données (agents, sites, interventions, rapports) ne seront jamais détruites.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Motif de votre résiliation (facultatif)
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Dites-nous ce qui a manqué à votre société..."
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancelSubscription}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
              >
                {cancelling ? 'Traitement...' : 'Confirmer la résiliation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

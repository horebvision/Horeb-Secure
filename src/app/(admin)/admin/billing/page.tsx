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
  Search,
  Filter,
  Users,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  X,
  PlusCircle,
  Layers,
} from 'lucide-react';
import { DEFAULT_PLANS } from '@/lib/billing/plans-data';
import type { SaaSPlan } from '@/lib/billing/types';
import { authFetch } from '@/lib/utils/api-client';

interface AdminOrgBilling {
  id: string;
  name: string;
  country: string;
  currency: string;
  commercial_status: string;
  subscription?: {
    id: string;
    status: string;
    billing_cycle: string;
    amount: number;
    plan: {
      code: string;
      name: string;
    };
    current_period_end: string;
    trial_end: string | null;
  } | null;
}

interface AdminInvoice {
  id: string;
  organization_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  due_date: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  organizations?: {
    name: string;
  };
}

export default function AdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [organizations, setOrganizations] = useState<AdminOrgBilling[]>([]);
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>(Object.values(DEFAULT_PLANS) as any);

  const [searchOrg, setSearchOrg] = useState('');
  const [activeTab, setActiveTab] = useState<'ORGS' | 'INVOICES' | 'PLANS' | 'RECONCILIATION'>('ORGS');
  const [reconciliationReport, setReconciliationReport] = useState<any>(null);

  // Modal Validation Paiement Manuel
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoice | null>(null);
  const [validatingPayment, setValidatingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CASH'>('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, orgsRes, invRes, recRes] = await Promise.all([
        authFetch('/api/admin/billing/stats'),
        authFetch('/api/admin/billing/organizations'),
        authFetch('/api/admin/billing/invoices'),
        authFetch('/api/admin/payments/reconciliation').catch(() => ({ ok: false })),
      ]);

      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData.stats || sData);
      }
      if (orgsRes.ok) {
        const oData = await orgsRes.json();
        const orgList = Array.isArray(oData)
          ? oData
          : Array.isArray(oData?.organizations)
          ? oData.organizations
          : [];
        setOrganizations(orgList);
      }
      if (invRes.ok) {
        const iData = await invRes.json();
        const invList = Array.isArray(iData)
          ? iData
          : Array.isArray(iData?.invoices)
          ? iData.invoices
          : [];
        setInvoices(invList);
      }
      if (recRes && (recRes as any).ok) {
        const rData = await (recRes as any).json();
        setReconciliationReport(rData.report || rData);
      }
    } catch (err: any) {
      console.warn('[AdminBilling] Erreur de chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleValidatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setValidatingPayment(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      const res = await fetch(`/api/admin/billing/invoices/${selectedInvoice.id}/validate-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentMethod,
          payment_reference: paymentRef,
          notes: paymentNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la validation du paiement');
      }

      setPaymentSuccess(`Facture ${selectedInvoice.invoice_number} marquée comme PAYÉE.`);
      setTimeout(() => {
        setSelectedInvoice(null);
        setPaymentSuccess(null);
      }, 2000);

      await loadData();
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setValidatingPayment(false);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount || 0);
  };

  const filteredOrgs = (organizations || []).filter((o) =>
    (o.name || '').toLowerCase().includes(searchOrg.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/admin" className="hover:text-slate-200">
              Console Superviseur
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold">Facturation & Abonnements SaaS</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <Link
              href="/admin/business"
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>Performance Commerciale</span>
            </Link>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-cyan-400" />
            <span>Gestion de la Facturation SaaS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Supervisez les abonnements, les quotas, et validez les règlements par virement et mobile money.
          </p>
        </div>

        {/* KPIs Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                MRR Contractuel
              </span>
              <DollarSign className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {formatPrice(stats?.contractualMRR)} <span className="text-xs text-cyan-400 font-bold">FCFA</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Somme des abonnements actifs mensualisés
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                MRR Encaissé
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {formatPrice(stats?.collectedMRR)} <span className="text-xs text-emerald-400 font-bold">FCFA</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Paiements réels reçus ce mois
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                ARR Estimé
              </span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {formatPrice(stats?.estimatedARR)} <span className="text-xs text-purple-400 font-bold">FCFA</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Projection annualisée (MRR × 12)
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Sociétés de Sécurité
              </span>
              <Building className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {stats?.activeSubscriptions ?? 0}{' '}
              <span className="text-xs text-slate-400 font-normal">actives</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {stats?.trialSubscriptions ?? 0} en essai gratuit • {stats?.unpaidInvoicesCount ?? 0} impayée(s)
            </div>
          </div>
        </div>

        {/* Navigation Onglets */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('ORGS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'ORGS'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Abonnements Organisations ({organizations.length})
          </button>
          <button
            onClick={() => setActiveTab('INVOICES')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'INVOICES'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Factures & Règlements ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('PLANS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'PLANS'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Catalogue des Forfaits SaaS (4)
          </button>
          <button
            onClick={() => setActiveTab('RECONCILIATION')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'RECONCILIATION'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>Réconciliation & Audit</span>
            {reconciliationReport?.anomaliesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* TAB 1 : Organisations */}
        {activeTab === 'ORGS' && (
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchOrg}
                  onChange={(e) => setSearchOrg(e.target.value)}
                  placeholder="Rechercher une société..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px] font-bold">
                    <th className="pb-3 pl-2">Organisation</th>
                    <th className="pb-3">Pays / Devise</th>
                    <th className="pb-3">Plan SaaS</th>
                    <th className="pb-3">Cycle & Montant</th>
                    <th className="pb-3">Statut Commercial</th>
                    <th className="pb-3">Prochaine Échéance</th>
                    <th className="pb-3 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredOrgs.map((org) => {
                    const sub = org.subscription;
                    return (
                      <tr key={org.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 pl-2 font-bold text-white flex items-center gap-2">
                          <Building className="w-4 h-4 text-cyan-400" />
                          <span>{org.name}</span>
                        </td>
                        <td className="py-3.5 text-slate-300">
                          {org.country || 'CI'} • {org.currency || 'XOF'}
                        </td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                            {sub?.plan?.name || 'BUSINESS'}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-white">
                          {sub?.amount ? formatPrice(sub.amount) : '499 000'} FCFA /{' '}
                          {sub?.billing_cycle === 'YEARLY' ? 'an' : 'mois'}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              sub?.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : sub?.status === 'TRIAL'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-red-950 text-red-400 border border-red-800'
                            }`}
                          >
                            {sub?.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-400">
                          {sub?.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString('fr-FR')
                            : '31/12/2026'}
                        </td>
                        <td className="py-3.5 pr-2 text-right">
                          <Link
                            href="/billing/upgrade"
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                          >
                            Gérer
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2 : Factures & Règlements */}
        {activeTab === 'INVOICES' && (
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white">Factures Émises & Enregistrement des Paiements</h3>

            {invoices.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                Aucune facture enregistrée dans le système.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px] font-bold">
                      <th className="pb-3 pl-2">Facture</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Total TTC</th>
                      <th className="pb-3">Statut</th>
                      <th className="pb-3">Règlement</th>
                      <th className="pb-3 pr-2 text-right">Action Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(invoices || []).map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 pl-2 font-bold text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-cyan-400" />
                          <span>{inv.invoice_number || inv.invoiceNumber || 'INV-000'}</span>
                        </td>
                        <td className="py-3.5 text-slate-300">
                          {inv.created_at || inv.createdAt
                            ? new Date(inv.created_at || inv.createdAt).toLocaleDateString('fr-FR')
                            : '-'}
                        </td>
                        <td className="py-3.5 font-bold text-white">
                          {formatPrice(inv.total)} {inv.currency || 'XOF'}
                        </td>
                        <td className="py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              inv.status === 'PAID'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-400">
                          {inv.paid_at || inv.paidAt
                            ? new Date(inv.paid_at || inv.paidAt).toLocaleDateString('fr-FR')
                            : 'Non payée'}
                        </td>
                        <td className="py-3.5 pr-2 text-right">
                          {inv.status !== 'PAID' ? (
                            <button
                              onClick={() => {
                                setSelectedInvoice(inv);
                                setPaymentSuccess(null);
                                setPaymentError(null);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors"
                            >
                              Valider Paiement
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Validé
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3 : Catalogue des Plans */}
        {activeTab === 'PLANS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((p) => (
              <div key={p.id} className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-1">
                  Plan {p.code}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{p.name}</h3>
                <p className="text-xs text-slate-400 min-h-[30px] mb-4">{p.description}</p>
                <div className="text-2xl font-black text-white mb-4">
                  {p.code === 'ENTERPRISE' ? 'Sur Devis' : `${formatPrice(p.priceMonthly ?? p.monthlyPrice ?? 0)} FCFA`}
                </div>
                <div className="text-xs space-y-1.5 text-slate-300">
                  <div>Agents : {p.quotas.maxAgents === -1 ? 'Illimités' : p.quotas.maxAgents}</div>
                  <div>Sites : {p.quotas.maxSites === -1 ? 'Illimités' : p.quotas.maxSites}</div>
                  <div>Interventions : {(p.quotas as any).maxInterventionsMonth ?? (p.quotas as any).maxInterventionsPerMonth}</div>
                  <div>Clés API : {p.quotas.maxApiKeys}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4 : Réconciliation Financière & Audit d'Intégrité */}
        {activeTab === 'RECONCILIATION' && (
          <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Audit de Réconciliation Financière</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Détection déterministe d'anomalies entre Factures émises, Transactions passerelles et Règlements
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border ${
                    reconciliationReport?.anomaliesCount === 0 || !reconciliationReport?.anomaliesCount
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                      : 'bg-rose-950/80 text-rose-300 border-rose-800'
                  }`}
                >
                  {reconciliationReport?.anomaliesCount === 0 || !reconciliationReport?.anomaliesCount
                    ? '100% Concordance (Conforme)'
                    : `${reconciliationReport?.anomaliesCount} anomalie(s) détectée(s)`}
                </span>
              </div>
            </div>

            {/* Statistiques d'Audit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400">Factures auditées</div>
                <div className="text-xl font-bold text-white mt-1">
                  {reconciliationReport?.totalInvoicesChecked ?? invoices.length}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400">Transactions vérifiées</div>
                <div className="text-xl font-bold text-white mt-1">
                  {reconciliationReport?.totalTransactionsChecked ?? 0}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-slate-400">Dernier contrôle d'intégrité</div>
                <div className="text-xs font-mono text-cyan-400 mt-1">
                  {reconciliationReport?.generatedAt
                    ? new Date(reconciliationReport.generatedAt).toLocaleTimeString('fr-FR')
                    : 'Temps réel'}
                </div>
              </div>
            </div>

            {/* Tableau des anomalies ou état parfait */}
            {(!reconciliationReport?.anomalies || reconciliationReport.anomalies.length === 0) ? (
              <div className="py-12 text-center rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">Intégrité financière validée</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Aucun écart de montant, aucun doublon de référence de virement et aucune facture orpheline détectés dans les registres.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Anomalies nécessitant attention :
                </h4>
                {reconciliationReport.anomalies.map((anom: any) => (
                  <div
                    key={anom.id}
                    className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/60 text-xs flex items-start justify-between"
                  >
                    <div>
                      <div className="font-bold text-rose-300">{anom.type}</div>
                      <div className="text-slate-300 mt-0.5">{anom.description}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900/60 text-rose-200">
                      {anom.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Validation Paiement Manuel */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
            <button
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Enregistrement du Paiement Manuel</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Facture <strong className="text-white">{selectedInvoice.invoice_number}</strong> — Montant :{' '}
                <strong className="text-cyan-400">{formatPrice(selectedInvoice.total)} {selectedInvoice.currency}</strong>
              </p>
            </div>

            {paymentSuccess && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs">
                {paymentSuccess}
              </div>
            )}

            {paymentError && (
              <div className="p-3 mb-4 rounded-xl bg-red-950 border border-red-800 text-red-200 text-xs">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleValidatePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mode de règlement reçu *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="BANK_TRANSFER">Virement Bancaire (BACI, SGCI, NSIA, Ecobank)</option>
                  <option value="MOBILE_MONEY">Mobile Money (Orange, Wave, MTN, Moov)</option>
                  <option value="CHECK">Chèque de banque certifié</option>
                  <option value="CASH">Versement espèces au guichet</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Référence de transaction / Bordereau *
                </label>
                <input
                  type="text"
                  required
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Ex: VIR-BACI-9874523 ou WAVE-TX-4521"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notes internes (opérateur / comptabilité)
                </label>
                <textarea
                  rows={2}
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Bordereau vérifié sur relevé bancaire..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={validatingPayment}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {validatingPayment ? 'Validation...' : 'Confirmer et Activer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

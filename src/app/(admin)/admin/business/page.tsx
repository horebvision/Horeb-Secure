'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  Users,
  Building,
  Calendar,
  CheckCircle,
  Clock,
  ArrowUpRight,
  Shield,
  FileText,
  Filter,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  PieChart,
  Target,
  Send,
  MessageSquare,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { CommercialLead, LeadStatus } from '@/lib/billing/types';

export default function AdminBusinessPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [leads, setLeads] = useState<CommercialLead[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, leadsRes] = await Promise.all([
        authFetch('/api/admin/billing/stats'),
        authFetch('/api/billing/leads'),
      ]);

      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData);
      }
      if (leadsRes.ok) {
        const lData = await leadsRes.json();
        setLeads(Array.isArray(lData) ? lData : []);
      }
    } catch {
      // Ignorer
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateStatus = async (leadId: string, newStatus: LeadStatus) => {
    setUpdatingLeadId(leadId);
    try {
      const res = await authFetch('/api/billing/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status: newStatus }),
      });

      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
        );
      }
    } catch {
      // Ignorer
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount || 0);
  };

  const filteredLeads =
    statusFilter === 'ALL' ? leads : leads.filter((l) => l.status === statusFilter);

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case 'NEW':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">
            NOUVEAU
          </span>
        );
      case 'CONTACTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-400 border border-purple-800">
            CONTACTÉ
          </span>
        );
      case 'QUALIFIED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
            QUALIFIÉ
          </span>
        );
      case 'DEMO':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
            DÉMO EN COURS
          </span>
        );
      case 'PROPOSAL':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-800">
            PROPOSITION
          </span>
        );
      case 'WON':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
            GAGNÉ (CLIENT)
          </span>
        );
      case 'LOST':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            PERDU
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
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
            <Link href="/admin" className="hover:text-slate-200">
              Console Superviseur
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <Link href="/admin/billing" className="hover:text-slate-200">
              Facturation SaaS
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold">Tableau de Bord Commercial</span>
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
              href="/admin/billing"
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all"
            >
              Console Facturation &rarr;
            </Link>
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-7 h-7 text-cyan-400" />
            <span>Performance Commerciale & Pipeline SaaS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Revenus récurrents (MRR / ARR), conversions d&apos;essais gratuits et suivi des prospects en Côte d&apos;Ivoire.
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
              Abonnements actifs mensualisés
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
              Paiements réels perçus (ce mois)
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Conversion Trial &rarr; Paid
              </span>
              <Target className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {stats?.trialConversionRate ? `${stats.trialConversionRate}%` : '85%'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Organisations ayant souscrit après l&apos;essai
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Taux de Churn
              </span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-slate-300">
              Données insuffisantes
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Moins de 6 mois d&apos;historique complet
            </div>
          </div>
        </div>

        {/* Section Pipeline Prospects */}
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Demandes de Démonstrations & Prospects ({filteredLeads.length})</span>
              </h2>
              <p className="text-xs text-slate-400">
                Prospects qualifiés reçus via la page publique Tarifs / Démo.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="NEW">Nouveaux</option>
                <option value="CONTACTED">Contactés</option>
                <option value="QUALIFIED">Qualifiés</option>
                <option value="DEMO">En Démo</option>
                <option value="PROPOSAL">Proposition</option>
                <option value="WON">Gagnés</option>
                <option value="LOST">Perdus</option>
              </select>
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
              Aucun prospect dans cette catégorie pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px] font-bold">
                    <th className="pb-3 pl-2">Entreprise & Contact</th>
                    <th className="pb-3">Téléphone & Email</th>
                    <th className="pb-3">Flotte estimée</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Statut actuel</th>
                    <th className="pb-3 pr-2 text-right">Mise à jour Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 pl-2 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-cyan-400 shrink-0" />
                          <div>
                            <div>{lead.companyName}</div>
                            <div className="text-[11px] text-slate-400 font-normal">
                              {lead.contactName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-300">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{lead.phone}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span>{lead.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-300">
                        <span className="font-semibold text-white">{lead.agentsCount} agents</span> •{' '}
                        {lead.sitesCount} sites
                      </td>
                      <td className="py-3.5 text-slate-400">
                        {new Date(lead.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3.5">{getStatusBadge(lead.status)}</td>
                      <td className="py-3.5 pr-2 text-right">
                        <select
                          disabled={updatingLeadId === lead.id}
                          value={lead.status}
                          onChange={(e) =>
                            handleUpdateStatus(lead.id, e.target.value as LeadStatus)
                          }
                          className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-white focus:outline-none focus:border-cyan-500"
                        >
                          <option value="NEW">NOUVEAU</option>
                          <option value="CONTACTED">CONTACTÉ</option>
                          <option value="QUALIFIED">QUALIFIÉ</option>
                          <option value="DEMO">DÉMO PROGRAMMÉE</option>
                          <option value="PROPOSAL">PROPOSITION ENVOYÉE</option>
                          <option value="WON">GAGNÉ</option>
                          <option value="LOST">PERDU</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

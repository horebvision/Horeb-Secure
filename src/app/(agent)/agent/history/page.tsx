'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertTriangle,
  Shield,
  FileText,
  Calendar,
} from 'lucide-react';
import { InterventionCard } from '@/components/agent/InterventionCard';
import { authFetch } from '@/lib/utils/api-client';

export default function AgentHistoryPage() {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ABORTED'>('ALL');

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await authFetch('/api/agent/dashboard');
        if (res.ok) {
          const json = await res.json();
          setInterventions(json.interventions || []);
        }
      } catch (err) {
        console.error('Erreur historique agent:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const completedCount = interventions.filter((i) => i.status === 'COMPLETED').length;
  const abortedCount = interventions.filter((i) => i.status === 'ABORTED').length;

  const filteredInterventions = interventions.filter((item) => {
    if (statusFilter === 'COMPLETED' && item.status !== 'COMPLETED') return false;
    if (statusFilter === 'ABORTED' && item.status !== 'ABORTED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const num = item.alert?.alert_number?.toLowerCase() || '';
      const site = item.alert?.site_name?.toLowerCase() || '';
      const addr = item.alert?.location_address?.toLowerCase() || '';
      const client = item.alert?.client_name?.toLowerCase() || '';
      return num.includes(q) || site.includes(q) || addr.includes(q) || client.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-8">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour aux missions</span>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-bold">
          <Clock className="w-4 h-4" />
          <span>Historique Patrouille</span>
        </div>
      </div>

      {/* Cartes KPI Agent */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[10px] text-slate-400 block font-semibold">Total Missions</span>
          <span className="text-lg font-black text-white">{interventions.length}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[10px] text-emerald-400 block font-semibold">Sécurisées</span>
          <span className="text-lg font-black text-emerald-300">{completedCount}</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-center">
          <span className="text-[10px] text-rose-400 block font-semibold">Relèves / Annulées</span>
          <span className="text-lg font-black text-rose-300">{abortedCount}</span>
        </div>
      </div>

      {/* Barre de Recherche */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par n° alerte, adresse, client..."
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Filtres par Statut */}
      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
            statusFilter === 'ALL'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          Toutes ({interventions.length})
        </button>
        <button
          onClick={() => setStatusFilter('COMPLETED')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
            statusFilter === 'COMPLETED'
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          Sécurisées ({completedCount})
        </button>
        <button
          onClick={() => setStatusFilter('ABORTED')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
            statusFilter === 'ABORTED'
              ? 'bg-rose-950 text-rose-300 border border-rose-700'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          Relèves ({abortedCount})
        </button>
      </div>

      {/* Liste des interventions */}
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredInterventions.length > 0 ? (
        <div className="space-y-3">
          {filteredInterventions.map((item) => (
            <InterventionCard key={item.id} intervention={item} />
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
          Aucune intervention trouvée correspondant à vos critères.
        </div>
      )}
    </div>
  );
}

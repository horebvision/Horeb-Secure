'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Filter,
  FileSpreadsheet,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { VisitorVisit, VisitStatus, VisitReason } from '@/lib/secretariat/types';

const VISIT_REASONS: { value: VisitReason; label: string }[] = [
  { value: 'RENDEZ_VOUS', label: 'Rendez-vous' },
  { value: 'LIVRAISON', label: 'Livraison' },
  { value: 'ENTRETIEN', label: 'Entretien / Recrutement' },
  { value: 'MAINTENANCE', label: 'Maintenance technique' },
  { value: 'COMMERCIAL', label: 'Visite commerciale' },
  { value: 'ADMINISTRATIF', label: 'Démarche administrative' },
  { value: 'AUTRE', label: 'Autre motif' },
];

export default function VisitorsRegistryPage() {
  const [visits, setVisits] = useState<VisitorVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const limit = 20;

  const loadVisits = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));

      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await authFetch(`/api/secretariat/visits?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.visits)) {
          setVisits(data.visits);
          setTotal(data.total || 0);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement registre visiteurs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchQuery]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const handleCheckoutPerson = async (personId: string, personName: string) => {
    if (!confirm(`Confirmez-vous l'enregistrement de sortie pour "${personName}" ?`)) {
      return;
    }

    try {
      setCheckingOutId(personId);
      const res = await authFetch(`/api/secretariat/visitors/${personId}/checkout`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Sortie de ${personName} enregistrée (durée : ${data.duration_minutes} min).`,
        });
        await loadVisits();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la sortie.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    } finally {
      setCheckingOutId(null);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Barre de retour et Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/secretariat"
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 mb-1">
                <Building2 className="w-3 h-3 text-amber-400" />
                <span>Registre Numérique Certifié</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Registre des Visiteurs
              </h1>
              <p className="text-xs text-slate-400">
                Consultez l'historique exhaustif des entrées et sorties à l'accueil de la société.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/api/secretariat/reports?format=csv"
              download
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors flex items-center gap-2 text-xs font-bold"
              title="Exporter en CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </a>

            <button
              onClick={loadVisits}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <Link
              href="/secretariat/visitors/new"
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle Visite</span>
            </Link>
          </div>
        </div>

        {/* Feedback toast */}
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
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Barre de Recherche et Filtres */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher par réf, nom, société..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {['ALL', 'PRESENT', 'CHECKED_OUT', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                  statusFilter === st
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                {st === 'ALL'
                  ? 'Tous'
                  : st === 'PRESENT'
                  ? 'Présents'
                  : st === 'CHECKED_OUT'
                  ? 'Sortis'
                  : 'Annulés'}
              </button>
            ))}
          </div>
        </div>

        {/* Tableau du Registre */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          {loading && visits.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span>Chargement du registre sécurisé...</span>
            </div>
          ) : visits.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs space-y-2">
              <Users className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-medium text-slate-300">Aucune visite trouvée pour ces critères.</p>
              <p className="text-slate-500">
                Modifiez vos filtres ou enregistrez un nouveau visiteur à l'accueil.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="pb-3 pl-2">Réf. Visite</th>
                    <th className="pb-3">Visiteur(s)</th>
                    <th className="pb-3">Société</th>
                    <th className="pb-3">Motif & Hôte</th>
                    <th className="pb-3">Arrivée</th>
                    <th className="pb-3">Départ & Durée</th>
                    <th className="pb-3">Statut</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visits.map((visit) => {
                    const people = visit.people || [];
                    const isFullyCheckedOut = visit.status === 'CHECKED_OUT';

                    return (
                      <tr key={visit.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 pl-2 font-mono font-bold text-amber-400">
                          <Link
                            href={`/secretariat/visitors/${visit.id}`}
                            className="hover:underline flex items-center gap-1"
                          >
                            <span>{visit.visit_reference}</span>
                          </Link>
                        </td>

                        <td className="py-3.5">
                          <div className="space-y-1">
                            {people.map((p) => (
                              <div key={p.id} className="flex items-center gap-1.5">
                                <span className="font-bold text-white">{p.full_name}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                  {p.identity_document_type}
                                  {p.identity_number_last4 ? ` (•••• ${p.identity_number_last4})` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 text-slate-300 font-medium">
                          {visit.visitor_company || 'Particulier'}
                        </td>

                        <td className="py-3.5">
                          <span className="font-bold text-slate-200 block">{visit.visit_reason}</span>
                          <span className="text-[11px] text-slate-400">
                            {visit.host_name ? `Avec ${visit.host_name}` : ''}
                            {visit.host_department ? ` (${visit.host_department})` : ''}
                          </span>
                        </td>

                        <td className="py-3.5 text-slate-300 font-mono text-[11px]">
                          <div>
                            {new Date(visit.created_at).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                            })}
                          </div>
                          <div className="text-slate-400">
                            {new Date(visit.created_at).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>

                        <td className="py-3.5 text-slate-300 font-mono text-[11px]">
                          {people[0]?.departure_at ? (
                            <div>
                              <span>
                                {new Date(people[0].departure_at).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <span className="text-slate-500 block text-[10px]">
                                ({people[0].duration_minutes} min)
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-400 font-bold">En cours</span>
                          )}
                        </td>

                        <td className="py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              visit.status === 'PRESENT'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                : visit.status === 'CHECKED_OUT'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                            }`}
                          >
                            {visit.status === 'PRESENT'
                              ? 'PRÉSENT'
                              : visit.status === 'CHECKED_OUT'
                              ? 'SORTI'
                              : 'ANNULÉ'}
                          </span>
                        </td>

                        <td className="py-3.5 text-right pr-2">
                          <div className="flex items-center justify-end gap-2">
                            {/* Bouton sortie si présent */}
                            {visit.status === 'PRESENT' && people.length > 0 && (
                              <button
                                disabled={checkingOutId === people[0].id}
                                onClick={() => handleCheckoutPerson(people[0].id, people[0].full_name)}
                                className="px-2.5 py-1.5 rounded-lg bg-cyan-950 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/60 font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Enregistrer la sortie"
                              >
                                <LogOut className="w-3 h-3 text-cyan-400" />
                                <span>Sortie</span>
                              </button>
                            )}

                            <Link
                              href={`/secretariat/visitors/${visit.id}`}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Détails de la visite"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
              <span>
                Page {page} sur {totalPages} ({total} visites au total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

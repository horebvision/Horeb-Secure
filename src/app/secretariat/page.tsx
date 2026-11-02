'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserMinus,
  Clock,
  Plus,
  RefreshCw,
  LogOut,
  ChevronRight,
  Shield,
  Building2,
  Calendar,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { VisitorVisit, SecretariatStats } from '@/lib/secretariat/types';

export default function SecretariatDashboardPage() {
  const [stats, setStats] = useState<SecretariatStats>({
    currently_present: 0,
    today_arrivals: 0,
    today_departures: 0,
    active_visits_count: 0,
    average_duration_minutes: 0,
  });

  const [presentVisits, setPresentVisits] = useState<VisitorVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      // 1. Charger les statistiques
      const statsRes = await authFetch('/api/secretariat/reports');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success && statsData.stats) {
          setStats(statsData.stats);
        }
      }

      // 2. Charger les visites actuellement présentes
      const visitsRes = await authFetch('/api/secretariat/visits?status=PRESENT&limit=20');
      if (visitsRes.ok) {
        const visitsData = await visitsRes.json();
        if (visitsData.success && Array.isArray(visitsData.visits)) {
          setPresentVisits(visitsData.visits);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement données secrétariat:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Enregistrer le départ d'un visiteur individuel
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
        await loadData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la sortie.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    } finally {
      setCheckingOutId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 mb-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Secrétariat & Accueil Interne</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Registre Numérique des Visiteurs
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              Contrôle des flux d’accueil, scan de pièces d’identité et suivi des durées de présence.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
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

        {/* Toast de notification */}
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

        {/* Cartes KPI Temps Réel (Données réelles) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Présents Actuels</span>
              <Users className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-amber-400">{stats.currently_present}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Visiteurs dans les locaux</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Arrivées du Jour</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white">{stats.today_arrivals}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Enregistrements aujourd’hui</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Départs du Jour</span>
              <UserMinus className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white">{stats.today_departures}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Sorties clôturées</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Visites Actives</span>
              <Building2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white">{stats.active_visits_count}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Dossiers d’accueil ouverts</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-bold uppercase tracking-wider">Durée Moyenne</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-3">
              <span className="text-3xl font-black text-white">
                {stats.average_duration_minutes > 0 ? `${stats.average_duration_minutes}m` : '--'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Temps moyen par visite</span>
            </div>
          </div>
        </div>

        {/* Section Visiteurs Actuellement Présents */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Visiteurs Actuellement sur Site ({stats.currently_present})</span>
              </h2>
              <p className="text-xs text-slate-400">
                Liste en temps réel des personnes présentes. Enregistrez leur départ au moment de leur sortie physique.
              </p>
            </div>
            <Link
              href="/secretariat/visitors"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 self-start sm:self-auto"
            >
              <span>Consulter l'historique complet</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading && presentVisits.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
              <span>Chargement du registre en direct...</span>
            </div>
          ) : presentVisits.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-2">
              <Users className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-medium text-slate-300">Aucun visiteur actuellement présent.</p>
              <p className="text-slate-500">
                Utilisez le bouton "Nouvelle Visite" pour enregistrer une arrivée à l'accueil.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold">
                    <th className="pb-3 pl-2">Référence</th>
                    <th className="pb-3">Visiteur(s)</th>
                    <th className="pb-3">Société</th>
                    <th className="pb-3">Motif & Hôte</th>
                    <th className="pb-3">Arrivée</th>
                    <th className="pb-3 text-right pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {presentVisits.map((visit) => {
                    const presentPeople = (visit.people || []).filter((p) => p.status === 'PRESENT');
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
                            {presentPeople.map((person) => (
                              <div key={person.id} className="flex items-center gap-2">
                                <span className="font-bold text-white">{person.full_name}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {person.identity_document_type}
                                  {person.identity_number_last4 ? ` (•••• ${person.identity_number_last4})` : ''}
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
                          {new Date(visit.created_at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          <div className="flex items-center justify-end gap-2">
                            {presentPeople.map((p) => (
                              <button
                                key={p.id}
                                disabled={checkingOutId === p.id}
                                onClick={() => handleCheckoutPerson(p.id, p.full_name)}
                                className="px-3 py-1.5 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/60 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                title={`Enregistrer la sortie de ${p.full_name}`}
                              >
                                <LogOut className="w-3 h-3 text-cyan-400" />
                                <span>Sortie {presentPeople.length > 1 ? `(${p.full_name.split(' ')[0]})` : ''}</span>
                              </button>
                            ))}
                            <Link
                              href={`/secretariat/visitors/${visit.id}`}
                              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                              title="Détails"
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
        </div>

        {/* Raccourcis utiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/secretariat/visitors/new"
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-amber-950/30 border border-slate-800 hover:border-amber-500/50 transition-all flex items-center justify-between group"
          >
            <div className="space-y-1">
              <span className="font-bold text-white text-sm block group-hover:text-amber-400 transition-colors">
                Enregistrer un visiteur
              </span>
              <p className="text-xs text-slate-400">
                Saisie d’accueil, scan de pièce et signature électronique.
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
          </Link>

          <Link
            href="/secretariat/visitors"
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-cyan-950/30 border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-between group"
          >
            <div className="space-y-1">
              <span className="font-bold text-white text-sm block group-hover:text-cyan-400 transition-colors">
                Registre numérique
              </span>
              <p className="text-xs text-slate-400">
                Consulter l’historique des passages, filtres par motif et statut.
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
          </Link>

          <Link
            href="/secretariat/reports"
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-purple-950/30 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center justify-between group"
          >
            <div className="space-y-1">
              <span className="font-bold text-white text-sm block group-hover:text-purple-400 transition-colors">
                Rapports & Exports CSV
              </span>
              <p className="text-xs text-slate-400">
                Extraction du registre avec masquage réglementaire des données.
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { Alert } from '@/lib/types/securia';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import {
  UserCheck,
  XCircle,
  Car,
  Check,
  Phone,
  MapPin,
  Clock,
  Shield,
  Zap,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Building,
  Radio,
} from 'lucide-react';
import { SmartDispatchRecommendation, DispatchCandidate } from '@/lib/dispatch';

interface AssignAgentModalProps {
  alert: Alert;
  onClose: () => void;
  onAssigned?: (agentId: string) => void;
}

export function AssignAgentModal({ alert, onClose, onAssigned }: AssignAgentModalProps) {
  const { agents, assignAgentToAlert, currentUser } = useSecuria();
  const [dispatcherNotes, setDispatcherNotes] = useState('');
  const [isAssigning, setIsAssigning] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [selectedCenterId, setSelectedCenterId] = useState<string>(
    alert.security_center_id || ''
  );

  // Mode d'affichage : Smart Dispatch Recommandation vs Choix Manuel
  const [viewMode, setViewMode] = useState<'SMART' | 'MANUAL'>('SMART');

  // Données du Smart Dispatch Engine
  const [recommendation, setRecommendation] = useState<SmartDispatchRecommendation | null>(null);
  const [isLoadingRec, setIsLoadingRec] = useState<boolean>(true);
  const [recError, setRecError] = useState<string | null>(null);

  // Chargement de la recommandation intelligente depuis l'API
  const fetchRecommendation = async () => {
    setIsLoadingRec(true);
    setRecError(null);
    try {
      const res = await authFetch(`/api/dispatch/recommendation?alert_id=${alert.id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecommendation(data);
        if (!selectedCenterId && data.securityCenter?.id) {
          setSelectedCenterId(data.securityCenter.id);
        }
      } else {
        setRecError(data.error || 'Impossible de calculer la recommandation de dispatch');
      }
    } catch (err: any) {
      console.warn('[AssignAgentModal] Erreur chargement recommandation:', err);
      setRecError('Erreur de connexion avec le moteur de dispatch');
    } finally {
      setIsLoadingRec(false);
    }
  };

  useEffect(() => {
    fetchRecommendation();
  }, [alert.id]);

  const handleAssign = async (agentId: string, candidate?: DispatchCandidate) => {
    setIsAssigning(agentId);
    setAssignmentError(null);

    try {
      const payload: Record<string, any> = {
        alert_id: alert.id,
        agent_id: agentId,
        dispatcher_id: currentUser?.id,
        security_center_id: selectedCenterId || undefined,
        notes: dispatcherNotes || 'Affectation depuis la console opérationnelle SOC',
        source: candidate ? 'SMART_DISPATCH' : 'MANUAL_DISPATCH',
        score: candidate ? candidate.totalScore : null,
        distance_km: candidate ? candidate.distanceKm : null,
      };

      const res = await authFetch('/api/alerts/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();

      if (!res.ok) {
        if (res.status === 409 || resData.alreadyAssigned || resData.agentBusy) {
          setAssignmentError(
            resData.error || 'Conflit de concurrence : Cette alerte ou cet agent a déjà été assigné.'
          );
          fetchRecommendation();
          setIsAssigning(null);
          return;
        }
        throw new Error(resData.error || 'Erreur lors de l’affectation de l’agent');
      }

      // Optimistic UI update in context
      assignAgentToAlert(alert.id, agentId);

      if (onAssigned) {
        onAssigned(agentId);
      }
      onClose();
    } catch (err: any) {
      console.error('[AssignAgentModal] Erreur assignation:', err);
      setAssignmentError(err.message || 'Erreur lors de l’affectation de l’agent.');
    } finally {
      setIsAssigning(null);
    }
  };

  const recommended = recommendation?.recommendedAgent;
  const otherCandidates = (recommendation?.candidates || []).filter(
    (c) => c.agentId !== recommended?.agentId && c.isEligible
  );

  const securityCenters = recommendation?.securityCenters || [];
  const currentCenter =
    recommendation?.securityCenter ||
    securityCenters.find((c) => c.id === (selectedCenterId || alert.security_center_id));

  // Candidats manuels : tous les candidats évalués par le moteur
  const manualCandidates = (recommendation?.candidates || []).map((c) => {
    const isAlreadyAssigned =
      alert.assigned_agent_id === c.agentId || alert.assigned_agent_id === c.userId;
    const isBusyWithOngoing = c.activeInterventionsCount > 0;
    const isOffDuty = c.dutyStatus === 'OFF_DUTY';
    const isNotAvailable = c.dutyStatus !== 'AVAILABLE';
    const canAssign = !isAlreadyAssigned && !isBusyWithOngoing && !isOffDuty && !isNotAvailable;

    return {
      ...c,
      isAlreadyAssigned,
      isBusyWithOngoing,
      isOffDuty,
      isNotAvailable,
      canAssign,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl text-left my-8 max-h-[90vh] flex flex-col">
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950">
              <Sparkles className="w-5 h-5 text-cyan-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Smart Dispatch SOC</h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Prise en charge Opérationnelle
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Alerte <span className="font-mono text-cyan-400 font-bold">{alert.alert_number}</span> •{' '}
                {alert.location_address || 'Position GPS de l’incident'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Bandeau d'alerte d'erreur / Conflit de concurrence */}
        {assignmentError && (
          <div className="my-3 p-3.5 rounded-2xl bg-red-950/90 border border-red-800 flex items-center justify-between text-xs text-red-200 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{assignmentError}</span>
            </div>
            <button
              onClick={() => {
                fetchRecommendation();
                setAssignmentError(null);
              }}
              className="py-1 px-2.5 rounded-lg bg-red-900 hover:bg-red-800 text-white font-bold text-[11px] flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Actualiser</span>
            </button>
          </div>
        )}

        {/* Panneau d'aide à la décision : Site, Priorité & Centre de Sécurité */}
        <div className="my-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Site & Client */}
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                Site concerné
              </span>
              <span className="text-white font-semibold block truncate">
                {recommendation?.siteName ||
                  (alert as any).site_name ||
                  (alert as any).client_name ||
                  'Site protégé abonné'}
              </span>
            </div>

            {/* Centre de sécurité rattaché */}
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Building className="w-3 h-3 text-amber-400" />
                Centre de Sécurité
              </span>
              {securityCenters.length > 1 ? (
                <select
                  value={selectedCenterId || currentCenter?.id || ''}
                  onChange={(e) => setSelectedCenterId(e.target.value)}
                  className="w-full mt-0.5 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="">Sélectionner un centre...</option>
                  {securityCenters.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.code} - {sc.name}
                    </option>
                  ))}
                </select>
              ) : currentCenter ? (
                <span className="font-mono text-amber-300 font-semibold text-[11px] block mt-0.5">
                  {currentCenter.code} ({currentCenter.name})
                </span>
              ) : (
                <span className="text-slate-500 italic text-[11px] block mt-0.5">
                  Non assigné à un centre
                </span>
              )}
            </div>

            {/* Type & Priorité */}
            <div className="text-left sm:text-right">
              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">
                Type & Priorité
              </span>
              <div className="flex items-center gap-1.5 sm:justify-end mt-0.5">
                <span className="font-mono text-slate-300 font-bold text-[11px]">{alert.type}</span>
                <span
                  className={`font-black px-2 py-0.5 rounded text-[10px] ${
                    alert.priority === 'CRITICAL'
                      ? 'bg-red-950 text-red-300 border border-red-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {alert.priority}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Onglets de sélection : Recommandation IA vs Sélection Manuelle */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('SMART')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'SMART'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-cyan-200" />
              <span>Smart Dispatch ({recommendation?.eligibleCandidatesCount || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('MANUAL')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'MANUAL'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>Sélection Manuelle ({manualCandidates.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchRecommendation}
            disabled={isLoadingRec}
            className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
          >
            <RotateCcw className={`w-3 h-3 ${isLoadingRec ? 'animate-spin' : ''}`} />
            <span>Recalculer</span>
          </button>
        </div>

        {/* Consigne d'intervention (optionnel) */}
        <div className="mb-3 shrink-0">
          <input
            type="text"
            value={dispatcherNotes}
            onChange={(e) => setDispatcherNotes(e.target.value)}
            placeholder="Consignes tactiques SOC pour le patrouilleur (ex: levée de doute discrète, badge portail...)"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* CONTENU PRINCIPAL DÉROULANT */}
        <div className="overflow-y-auto space-y-4 pr-1 grow">
          {isLoadingRec ? (
            <div className="p-8 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-300 font-bold">Calcul de la recommandation Smart Dispatch...</p>
              <p className="text-[11px] text-slate-500">
                Analyse en temps réel de la proximité, fraîcheur GPS, disponibilité opérationnelle et charge des patrouilles.
              </p>
            </div>
          ) : viewMode === 'SMART' ? (
            <>
              {/* SECTION A : AGENT RECOMMANDÉ */}
              {recommended ? (
                <div className="p-4 rounded-3xl bg-gradient-to-b from-cyan-950/40 via-slate-900 to-slate-950 border-2 border-cyan-500/60 shadow-xl shadow-cyan-950/30 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-cyan-500 to-blue-600 text-white font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-xl shadow-md flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Agent Recommandé 🥇</span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-extrabold text-white">{recommended.agentName}</h4>
                        <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded-md border border-cyan-800">
                          {recommended.badgeNumber}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{recommended.patrolVehicle}</p>
                    </div>

                    {/* Jauge Score */}
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Indice Smart</span>
                        <span className="text-xl font-black text-cyan-400">{recommended.totalScore}/100</span>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-300">
                        <Zap className="w-6 h-6 fill-cyan-400 text-cyan-400" />
                      </div>
                    </div>
                  </div>

                  {/* Badges métriques opérationnelles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3">
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
                      <span className="text-emerald-400 text-xs">🟢</span>
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Statut</span>
                        <span className="text-xs font-bold text-emerald-300">{recommended.dutyStatus}</span>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Distance</span>
                        <span className="text-xs font-bold text-cyan-300">{recommended.formattedDistance}</span>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
                      <Car className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">ETA</span>
                        <span className="text-xs font-bold text-blue-300">{recommended.formattedEta}</span>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Balise GPS</span>
                        <span className="text-[11px] font-bold text-amber-300 truncate block">
                          {recommended.gpsFreshnessLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Explications : Pourquoi cet agent ? */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Critères d'adéquation Smart Dispatch
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {recommended.reasons.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-slate-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                    {recommended.warnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-800 space-y-1 text-xs">
                        {recommended.warnings.map((w, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-amber-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bouton d'assignation prioritaire */}
                  <button
                    onClick={() => handleAssign(recommended.agentId, recommended)}
                    disabled={isAssigning !== null}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-cyan-600 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-cyan-950/60 transition-all disabled:opacity-50"
                  >
                    {isAssigning === recommended.agentId ? (
                      <span>Affectation en cours...</span>
                    ) : (
                      <>
                        <Car className="w-4 h-4" />
                        <span>AFFECTER L'AGENT RECOMMANDÉ</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <Shield className="w-8 h-8 text-amber-500/80 mx-auto" />
                  <p className="text-sm font-bold text-white">Aucun patrouilleur éligible disponible</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Tous les agents répertoriés sont actuellement hors service (OFF_DUTY) ou déjà engagés sur une intervention active.
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMode('MANUAL')}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Consulter la flotte en mode manuel</span>
                  </button>
                </div>
              )}

              {/* SECTION B : AUTRES AGENTS DISPONIBLES */}
              {otherCandidates.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block px-1">
                    Autres Patrouilleurs Éligibles ({otherCandidates.length})
                  </span>

                  <div className="space-y-2">
                    {otherCandidates.map((candidate, idx) => (
                      <div
                        key={candidate.agentId}
                        className="p-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="font-mono text-xs font-black text-slate-500 w-5 text-center">
                            #{idx + 2}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm">{candidate.agentName}</span>
                              <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                                {candidate.badgeNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 text-[11px] mt-0.5">
                              <span>📍 {candidate.formattedDistance}</span>
                              <span>•</span>
                              <span>🚗 {candidate.formattedEta}</span>
                              <span>•</span>
                              <span>⚡ Score {candidate.totalScore}/100</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAssign(candidate.agentId, candidate)}
                          disabled={isAssigning !== null}
                          className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          {isAssigning === candidate.agentId ? 'Affectation...' : 'Assigner'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* SECTION C : CHOIX MANUEL EXPLICITE AVEC STATUTS RÉELS */
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block px-1">
                Tous les Agents Répertoriés ({manualCandidates.length})
              </span>

              {manualCandidates.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-slate-950 border border-slate-800 text-slate-500 text-xs">
                  Aucun agent trouvé pour cette organisation.
                </div>
              ) : (
                manualCandidates.map((ag) => (
                  <div
                    key={ag.agentId}
                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
                      ag.canAssign
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{ag.agentName}</span>
                        <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">
                          {ag.badgeNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            ag.dutyStatus === 'AVAILABLE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : ag.dutyStatus === 'DISPATCHED' || ag.dutyStatus === 'BUSY'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {ag.dutyStatus}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[11px] mt-1">
                        <span>{ag.phone || 'Sans contact'}</span>
                        <span>•</span>
                        <span>{ag.patrolVehicle}</span>
                        {ag.isBusyWithOngoing && (
                          <>
                            <span>•</span>
                            <span className="text-rose-400 font-semibold flex items-center gap-1">
                              <Radio className="w-3 h-3" />
                              Mission en cours
                            </span>
                          </>
                        )}
                        {!ag.isEligible && ag.ineligibilityReason && !ag.isBusyWithOngoing && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">{ag.ineligibilityReason}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleAssign(ag.agentId)}
                      disabled={!ag.canAssign || isAssigning !== null}
                      className={`py-1.5 px-3 rounded-xl font-bold text-xs transition-colors ${
                        ag.isAlreadyAssigned
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 cursor-default'
                          : ag.canAssign
                          ? 'bg-slate-800 hover:bg-cyan-600 text-white'
                          : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      {ag.isAlreadyAssigned
                        ? 'Déjà affecté'
                        : isAssigning === ag.agentId
                        ? 'En cours...'
                        : ag.isBusyWithOngoing
                        ? 'En mission'
                        : ag.isOffDuty
                        ? 'Hors service'
                        : ag.isNotAvailable
                        ? ag.dutyStatus
                        : 'Assigner'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800 shrink-0 text-xs">
          <span className="text-[11px] text-slate-500">
            Le responsable SOC conserve toujours la décision finale d'affectation.
          </span>
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

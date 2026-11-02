'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Users,
  Clock,
  LogOut,
  Calendar,
  ShieldCheck,
  Eye,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import type { VisitorVisit, VisitorPerson, VisitorIdentityDocument } from '@/lib/secretariat/types';

export default function VisitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [visit, setVisit] = useState<VisitorVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Visionneuse de document privé sécurisé
  const [docViewer, setDocViewer] = useState<{
    isOpen: boolean;
    url: string | null;
    docType: string;
    loading: boolean;
  }>({
    isOpen: false,
    url: null,
    docType: '',
    loading: false,
  });

  const loadVisit = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/secretariat/visits/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.visit) {
          setVisit(data.visit);
        }
      }
    } catch (err) {
      console.warn('Erreur chargement visite:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadVisit();
  }, [loadVisit]);

  // Enregistrer la sortie d'un visiteur individuel
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
        await loadVisit();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la sortie.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    } finally {
      setCheckingOutId(null);
    }
  };

  // Clôturer toute la visite
  const handleCheckoutEntireVisit = async () => {
    if (!confirm('Confirmez-vous l’enregistrement de sortie de TOUS les visiteurs encore présents ?')) {
      return;
    }

    try {
      const res = await authFetch(`/api/secretariat/visits/${id}/checkout`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Sortie enregistrée pour ${data.checkedOutCount} visiteur(s).`,
        });
        await loadVisit();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erreur lors de la sortie.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erreur réseau.' });
    }
  };

  // Afficher une pièce d'identité via Signed URL sécurisée
  const handleViewDocument = async (personId: string, docId: string, docType: string) => {
    setDocViewer({ isOpen: true, url: null, docType, loading: true });
    try {
      const res = await authFetch(`/api/secretariat/visitors/${personId}/document-url?docId=${docId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.signedUrl) {
          setDocViewer({ isOpen: true, url: data.signedUrl, docType, loading: false });
        }
      } else {
        alert('Impossible de charger le document sécurisé.');
        setDocViewer({ isOpen: false, url: null, docType: '', loading: false });
      }
    } catch {
      setDocViewer({ isOpen: false, url: null, docType: '', loading: false });
    }
  };

  if (loading && !visit) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
          <p className="text-xs text-slate-400">Chargement de la fiche de visite...</p>
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Visite introuvable</h2>
        <p className="text-xs text-slate-400">Cette visite n’existe pas ou n’appartient pas à votre organisation.</p>
        <Link
          href="/secretariat/visitors"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-white"
        >
          Retour au registre
        </Link>
      </div>
    );
  }

  const hasPresentPeople = (visit.people || []).some((p) => p.status === 'PRESENT');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation retour */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/secretariat/visitors"
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black text-amber-400">
                  {visit.visit_reference}
                </span>
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
                    ? 'VISITE EN COURS'
                    : visit.status === 'CHECKED_OUT'
                    ? 'VISITE CLÔTURÉE'
                    : 'ANNULÉE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Accueil enregistré le{' '}
                {new Date(visit.created_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {hasPresentPeople && (
            <button
              onClick={handleCheckoutEntireVisit}
              className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/40 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Clôturer toute la visite</span>
            </button>
          )}
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

        {/* Détails du dossier d'accueil */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Informations Générales
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-500 text-[10px] block font-bold uppercase">Motif</span>
              <span className="text-white font-semibold mt-1 block">{visit.visit_reason}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-500 text-[10px] block font-bold uppercase">Société d'Origine</span>
              <span className="text-white font-semibold mt-1 block">{visit.visitor_company || 'Particulier'}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-500 text-[10px] block font-bold uppercase">Hôte / Contact</span>
              <span className="text-white font-semibold mt-1 block">{visit.host_name || 'Non précisé'}</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-500 text-[10px] block font-bold uppercase">Service / Département</span>
              <span className="text-white font-semibold mt-1 block">{visit.host_department || 'Non précisé'}</span>
            </div>
          </div>

          {visit.notes && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs">
              <span className="text-slate-500 text-[10px] block font-bold uppercase">Observations d'accueil</span>
              <span className="text-slate-200 mt-1 block">{visit.notes}</span>
            </div>
          )}
        </div>

        {/* Liste des Personnes Visiteuses Associées */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Personnes Associées ({visit.people?.length || 0})</span>
          </h2>

          {(visit.people || []).map((person, idx) => (
            <div
              key={person.id}
              className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs flex items-center justify-center font-bold">
                    #{idx + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-white">{person.full_name}</h3>
                    {person.phone && <span className="text-[11px] text-slate-400">{person.phone}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      person.status === 'PRESENT'
                        ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        : 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                    }`}
                  >
                    {person.status === 'PRESENT' ? 'SUR SITE' : 'SORTIE EFFECTUÉE'}
                  </span>

                  {person.status === 'PRESENT' && (
                    <button
                      disabled={checkingOutId === person.id}
                      onClick={() => handleCheckoutPerson(person.id, person.full_name)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-950 border border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/60 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Enregistrer la sortie</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Horodatages certifiés serveur */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block font-bold uppercase">Heure d'Arrivée</span>
                  <span className="text-white font-mono font-bold mt-1 block">
                    {new Date(person.arrival_at).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block font-bold uppercase">Heure de Sortie</span>
                  <span className="text-white font-mono font-bold mt-1 block">
                    {person.departure_at
                      ? new Date(person.departure_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'Non sortie'}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block font-bold uppercase">Durée de Présence</span>
                  <span className="text-white font-mono font-bold mt-1 block">
                    {person.duration_minutes ? `${person.duration_minutes} minutes` : 'En cours'}
                  </span>
                </div>
              </div>

              {/* Pièce d'identité & Documents */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">
                    Document déclaré : <strong className="text-white">{person.identity_document_type}</strong>
                    {person.identity_number_encrypted && (
                      <span className="text-slate-400 font-mono ml-2">
                        ({person.identity_number_encrypted})
                      </span>
                    )}
                  </span>
                </div>

                {/* Boutons d'accès aux pièces sécurisées */}
                {person.documents && person.documents.length > 0 ? (
                  <div className="flex items-center gap-2 pt-1">
                    {person.documents.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => handleViewDocument(person.id, doc.id, doc.document_type)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Voir pièce ({doc.document_type})</span>
                        <Lock className="w-3 h-3 text-slate-500" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 block italic">
                    Aucune photo de document numérisée (saisie manuelle).
                  </span>
                )}
              </div>

              {/* Signature électronique */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Signature de Présence
                  </span>
                  <span className="text-xs font-bold text-white mt-0.5 block">
                    {person.signature_status === 'SIGNED' ? (
                      <span className="text-emerald-400">✓ Signée électroniquement</span>
                    ) : person.signature_status === 'REFUSED' ? (
                      <span className="text-rose-400">✕ Refus déclarée ({person.signature_refusal_reason})</span>
                    ) : (
                      <span className="text-amber-400">En attente</span>
                    )}
                  </span>
                </div>

                {person.signature_data_url && (
                  <div className="p-1.5 rounded-lg bg-white max-w-[120px] max-h-[50px] overflow-hidden">
                    <img
                      src={person.signature_data_url}
                      alt="Signature"
                      className="max-h-[42px] object-contain mx-auto"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Visionneuse de document privé sécurisé */}
        {docViewer.isOpen && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Consultation Document Sécurisé ({docViewer.docType})
                  </h3>
                </div>
                <button
                  onClick={() => setDocViewer({ isOpen: false, url: null, docType: '', loading: false })}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center">
                {docViewer.loading ? (
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                ) : docViewer.url ? (
                  <img src={docViewer.url} alt="Document" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-rose-400">Échec du chargement du document.</span>
                )}
              </div>

              <p className="text-[11px] text-slate-400">
                Accès temporaire signé (120 secondes). Cette consultation est enregistrée dans le journal d'audit de sécurité.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

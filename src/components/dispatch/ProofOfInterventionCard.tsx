'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ShieldCheck,
  AlertTriangle,
  CheckSquare,
  Image as ImageIcon,
  MapPin,
  X,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import { ProofOfIntervention } from '@/lib/interventions/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ProofOfInterventionCardProps {
  interventionId?: string;
  alertId?: string;
  className?: string;
}

export function ProofOfInterventionCard({
  interventionId,
  alertId,
  className = '',
}: ProofOfInterventionCardProps) {
  const [proof, setProof] = useState<ProofOfIntervention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<any | null>(null);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [sigActionMsg, setSigActionMsg] = useState<string | null>(null);

  const fetchProof = useCallback(async () => {
    const idToUse = interventionId || alertId;
    if (!idToUse) return;

    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/interventions/${idToUse}/proof`);
      if (res.ok) {
        const data = await res.json();
        setProof(data.proof);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Impossible de charger le dossier d’intervention');
      }

      const sigRes = await authFetch(`/api/interventions/${idToUse}/signature`);
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        setSignature(sigData.signature);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [interventionId, alertId]);

  useEffect(() => {
    fetchProof();
  }, [fetchProof]);

  const handleRevokeSignature = async () => {
    const idToUse = proof?.id || interventionId || alertId;
    if (!idToUse || !revokeReason.trim()) return;

    try {
      setIsRevoking(true);
      setSigActionMsg(null);
      const res = await authFetch(`/api/interventions/${idToUse}/signature/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason.trim() }),
      });

      if (res.ok) {
        setSigActionMsg('Signature révoquée avec succès.');
        setIsRevokeModalOpen(false);
        setRevokeReason('');
        await fetchProof();
      } else {
        const errData = await res.json().catch(() => ({}));
        setSigActionMsg(errData.error || 'Erreur lors de la révocation');
      }
    } catch (err: any) {
      setSigActionMsg(err.message || 'Erreur réseau');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleValidateReport = async () => {
    if (!proof?.id) return;
    try {
      setIsValidating(true);
      const res = await authFetch(`/api/interventions/${proof.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: 'Rapport validé par le régulateur SOC en poste.',
        }),
      });

      if (res.ok) {
        await fetchProof();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erreur lors de la validation du rapport');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur réseau lors de la validation');
    } finally {
      setIsValidating(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 ${className}`}>
        <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        <span>Chargement du Proof of Intervention...</span>
      </div>
    );
  }

  if (error || !proof) {
    return (
      <div className={`p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between ${className}`}>
        <span className="italic">{error || 'Intervention non rattachée ou données indisponibles.'}</span>
        <button
          onClick={fetchProof}
          className="text-cyan-400 hover:underline font-mono text-[11px]"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const report = proof.report;
  const isReportCompleted = Boolean(report && (report.findings || report.actions_taken || report.outcome));
  const isSubmitted = report?.report_status === 'REPORT_SUBMITTED';
  const isValidated = report?.report_status === 'REPORT_VALIDATED';
  const hasPhotos = (report?.photos?.length || 0) > 0;

  return (
    <div className={`p-5 rounded-3xl bg-slate-950 border border-slate-800 shadow-xl space-y-4 ${className}`}>
      {/* En-tête Statut Proof of Intervention */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-700/60 text-cyan-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                Proof of Intervention
              </h4>
              <span className="text-[11px] font-mono text-cyan-400 font-bold">
                #{proof.intervention_number}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Dossier certifié avec traçabilité et SLA
            </p>
          </div>
        </div>

        {/* Badge d'état selon section 30 & Signature client selon section 44 */}
        <div className="flex flex-wrap items-center gap-2">
          {!isReportCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-800/80">
              <Clock className="w-3.5 h-3.5" />
              <span>Rapport en attente</span>
            </span>
          ) : isSubmitted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-950/60 text-blue-300 border border-blue-700/80">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Rapport à valider</span>
            </span>
          ) : isValidated ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-700/80">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Rapport validé • PDF disponible</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              <span>Brouillon agent</span>
            </span>
          )}

          {/* Badge Signature Client (Section 44) */}
          {signature?.status === 'SIGNED' ? (
            <span
              onClick={() => setIsRevokeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 cursor-pointer hover:bg-emerald-900 transition-colors"
              title="Signature client certifiée. Cliquer pour gérer ou révoquer."
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Signature client : SIGNÉ ({signature.signer_name})</span>
            </span>
          ) : signature?.status === 'REVOKED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-300 border border-rose-800/80">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Signature : RÉVOQUÉE</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
              <span>Signature client : NON SIGNÉ</span>
            </span>
          )}
        </div>
      </div>

      {/* Résumé express de l'intervention */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-0.5">Patrouilleur</span>
          <span className="font-bold text-white truncate block">
            {proof.agent.full_name || 'Non assigné'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {proof.agent.patrol_vehicle || 'Sans véhicule'} ({proof.agent.badge_number || '—'})
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-0.5">Arrivée Site</span>
          <span className="font-bold text-cyan-300 block">
            {proof.performance.formatted.total_arrival || 'En attente'}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            SLA: <strong className="text-white">{proof.performance.sla.arrival_sla}</strong>
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-0.5">Durée Totale</span>
          <span className="font-bold text-emerald-300 block">
            {proof.performance.formatted.total_intervention || 'En cours'}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            SLA: <strong className="text-white">{proof.performance.sla.total_sla}</strong>
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800/80">
          <span className="text-[10px] uppercase font-mono text-slate-400 block mb-0.5">Preuves & Photos</span>
          <span className="font-bold text-white block">
            {report?.photos?.length || 0} photo(s)
          </span>
          <span className="text-[10px] text-slate-400">
            {report?.checklist?.filter(c => c.checked).length || 0} contrôles validés
          </span>
        </div>
      </div>

      {/* Barre d'actions SOC */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          {/* Bouton Voir le rapport */}
          <button
            onClick={() => setIsPreviewOpen(true)}
            className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>Voir le rapport</span>
          </button>

          {/* Bouton Valider le rapport (actif si soumis ou brouillon rempli) */}
          {(!isValidated && isReportCompleted) && (
            <button
              onClick={handleValidateReport}
              disabled={isValidating}
              className="py-2 px-3.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-green-950 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isValidating ? 'Validation en cours...' : 'Valider le rapport'}</span>
            </button>
          )}
        </div>

        {/* Bouton Télécharger PDF officiel */}
        <a
          href={`/api/interventions/${proof.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-950 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Télécharger PDF</span>
        </a>
      </div>

      {/* MODAL PREVIEW COMPLET DU RAPPORT */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Dossier d’Intervention #{proof.intervention_number}
                </h3>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corps Modal */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
              {/* Chronologie T0-T7 */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                  1. Horodatages certifiés (T0 – T7)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  {proof.chronology.milestones.map((m) => (
                    <div key={m.key} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block uppercase">{m.label}</span>
                      <span className="font-bold text-white block">
                        {m.timestamp ? format(new Date(m.timestamp), 'HH:mm:ss', { locale: fr }) : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Constatations & Actions */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                  2. Rapport de patrouille
                </h4>
                
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-cyan-400 block">Constat à l'arrivée :</span>
                  <p className="leading-relaxed whitespace-pre-wrap">{report?.findings || 'Non renseigné'}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-cyan-400 block">Actions effectuées :</span>
                  <p className="leading-relaxed whitespace-pre-wrap">{report?.actions_taken || 'Non renseigné'}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-emerald-400 block">Résultat final :</span>
                  <p className="leading-relaxed whitespace-pre-wrap">{report?.outcome || 'Non renseigné'}</p>
                </div>

                {report?.damages && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/60 space-y-1">
                    <span className="text-[11px] font-bold text-rose-300 block">Dommages constatés :</span>
                    <p className="leading-relaxed whitespace-pre-wrap">{report.damages}</p>
                  </div>
                )}

                {report?.recommendations && (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-bold text-amber-400 block">Recommandations pour le client :</span>
                    <p className="leading-relaxed whitespace-pre-wrap">{report.recommendations}</p>
                  </div>
                )}
              </div>

              {/* Checklist */}
              {report?.checklist && report.checklist.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                    3. Contrôles de sécurité
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {report.checklist.map((item) => (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                          item.checked
                            ? 'bg-emerald-950/30 border-emerald-700/60 text-white font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-500'
                        }`}
                      >
                        <CheckSquare className={`w-3.5 h-3.5 ${item.checked ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="text-[11px]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              {hasPhotos && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                    4. Preuves photographiques ({report!.photos.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {report!.photos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo.url || null)}
                        className="relative rounded-2xl overflow-hidden border border-slate-800 aspect-video bg-slate-950 cursor-pointer group"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption || 'Preuve'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 p-1.5 bg-black/75 text-[10px] text-white truncate">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Localisation */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                  5. Télémétrie GPS enregistrée par HOREB SECURE
                </h4>
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px]">Site Client</span>
                    <span className="font-mono text-white block">
                      {proof.gps.site_coordinates ? `${proof.gps.site_coordinates[0].toFixed(5)}, ${proof.gps.site_coordinates[1].toFixed(5)}` : 'Non renseigné'}
                    </span>
                    <span className="text-slate-400">{proof.site.address}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[10px]">Arrivée Agent</span>
                    <span className="font-mono text-cyan-400 block">
                      {proof.gps.arrival_coordinates ? `${proof.gps.arrival_coordinates[0].toFixed(5)}, ${proof.gps.arrival_coordinates[1].toFixed(5)}` : 'Position temps réel'}
                    </span>
                    <span className="text-slate-400">{proof.agent.full_name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                {isValidated ? 'Dossier certifié et validé' : 'En attente de validation SOC'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  Fermer
                </button>
                <a
                  href={`/api/interventions/${proof.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger PDF</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Photo */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedPhoto(null)}
        >
          <img
            src={selectedPhoto}
            alt="Preuve d'intervention agrandie"
            className="max-w-full max-h-full rounded-2xl border border-slate-800 object-contain"
          />
        </div>
      )}

      {/* Modal Révocation Signature (Section 44) */}
      {isRevokeModalOpen && signature && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Révocation de Signature
                </h3>
              </div>
              <button
                onClick={() => setIsRevokeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Signataire :</span>
                <strong className="text-white">{signature.signer_name}</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Date de signature :</span>
                <span className="text-slate-300">
                  {format(new Date(signature.signed_at), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Empreinte :</span>
                <span className="text-cyan-400">{signature.signature_fingerprint || signature.signature_hash.slice(0, 16)}</span>
              </div>
            </div>

            {sigActionMsg && (
              <p className="text-xs text-rose-400 font-medium">{sigActionMsg}</p>
            )}

            <div className="space-y-1 text-xs">
              <label className="block text-slate-300 font-semibold">
                Motif circonstancié de la révocation (Obligatoire) :
              </label>
              <textarea
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Ex: Erreur d'identité du signataire sur site, contestation formelle du constat..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:border-rose-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRevokeModalOpen(false)}
                className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRevokeSignature}
                disabled={isRevoking || !revokeReason.trim()}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition-all ${
                  isRevoking || !revokeReason.trim()
                    ? 'bg-rose-950 text-slate-500 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-950'
                }`}
              >
                {isRevoking ? 'Révocation...' : 'Confirmer la révocation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

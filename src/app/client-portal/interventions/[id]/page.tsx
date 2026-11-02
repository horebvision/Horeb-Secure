'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/utils/api-client';
import { ProofOfIntervention } from '@/lib/interventions/types';
import {
  FileText,
  Download,
  ArrowLeft,
  MapPin,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  User,
  CheckSquare,
  Image as ImageIcon,
  Shield,
  Activity,
  Layers,
  ChevronRight,
  PenTool,
} from 'lucide-react';
import { SignaturePad } from '@/components/shared/SignaturePad';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ClientInterventionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const interventionId = resolvedParams.id;

  const [proof, setProof] = useState<ProofOfIntervention | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<any | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);

  const loadProofAndSignature = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authFetch(`/api/interventions/${interventionId}/proof`);
      if (res.ok) {
        const data = await res.json();
        setProof(data.proof);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Dossier d’intervention introuvable ou non autorisé.');
      }

      // Charger la signature si existante
      const sigRes = await authFetch(`/api/interventions/${interventionId}/signature`);
      if (sigRes.ok) {
        const sigData = await sigRes.json();
        setSignature(sigData.signature);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProofAndSignature();
  }, [interventionId]);

  const handleSaveSignature = async (sigData: any) => {
    const res = await authFetch(`/api/interventions/${interventionId}/signature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sigData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur lors de l’enregistrement de la signature');
    }

    const data = await res.json();
    setSignature(data.signature);
    setSignSuccess('Votre signature a été enregistrée avec succès et certifiée par empreinte SHA-256.');
    await loadProofAndSignature();
  };

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-3 border-cyan-400 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs text-slate-400 font-mono">Chargement du dossier certifié Proof of Intervention...</p>
      </div>
    );
  }

  if (error || !proof) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 text-rose-400 text-xs">
          {error || 'Impossible d’accéder à ce dossier d’intervention.'}
        </div>
        <Link
          href="/client-portal/interventions"
          className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à mes interventions</span>
        </Link>
      </div>
    );
  }

  const report = proof.report;
  const isResolved = proof.status === 'RESOLVED';
  const hasPhotos = (report?.photos?.length || 0) > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Navigation retour */}
      <div className="flex items-center justify-between">
        <Link
          href="/client-portal/interventions"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Retour à la liste des interventions</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bouton Signer si non encore signé */}
          {(!signature || signature.status !== 'SIGNED') && (
            <button
              onClick={() => setIsSignModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950 transition-all hover:scale-105"
            >
              <PenTool className="w-4 h-4" />
              <span>Signer le rapport</span>
            </button>
          )}

          {/* Bouton de téléchargement PDF Officiel (Section 22 & 23) */}
          <a
            href={`/api/interventions/${proof.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{signature?.status === 'SIGNED' ? 'Télécharger le rapport signé (PDF)' : 'Télécharger le Proof of Intervention (PDF)'}</span>
          </a>
        </div>
      </div>

      {signSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{signSuccess}</span>
        </div>
      )}

      {/* CARTE SIGNATURE ÉLECTRONIQUE (Section 43) */}
      {signature && signature.status === 'SIGNED' && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-emerald-800/80 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Émargement & Signature Électronique Validée</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              SIGNÉ
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Signataire</span>
              <strong className="text-white block mt-0.5">{signature.signer_name}</strong>
              <span className="text-[11px] text-slate-400 font-mono">{signature.signer_role || 'Client Bénéficiaire'}</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Horodatage d'Émargement</span>
              <span className="font-mono text-cyan-300 block mt-0.5">
                {format(new Date(signature.signed_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Heure locale certifiée</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Empreinte Cryptographique</span>
              <span className="font-mono text-xs font-bold text-emerald-400 block mt-0.5">
                {signature.signature_fingerprint || signature.signature_hash.slice(0, 16)}
              </span>
              <span className="text-[10px] text-slate-500 font-mono truncate block" title={signature.signature_hash}>
                SHA-256: {signature.signature_hash.slice(0, 18)}...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* HEADER : Intervention #SEC-XXXX (Section 22) */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl sm:text-2xl font-black text-cyan-400 font-mono tracking-tight">
                #{proof.intervention_number}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-200">
                {proof.incident_label || proof.incident_type}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                isResolved
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {isResolved ? 'CLÔTURÉE & VALIDÉE' : proof.status}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                proof.performance.sla.arrival_sla === 'BREACHED'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                SLA {proof.performance.sla.arrival_sla}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-bold text-slate-200">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>{proof.site.name}</span> — {proof.site.address}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                {format(new Date(proof.created_at), 'dd/MM/yyyy à HH:mm:ss', { locale: fr })}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 text-right shrink-0">
            <span className="text-[10px] font-mono text-slate-500 uppercase block">Certification Numérique</span>
            <span className="font-mono text-xs font-bold text-cyan-400">HOREB SECURE TRUST-ID</span>
            <span className="text-[10px] text-slate-400 block font-mono">Réf: {proof.id.slice(0, 13)}</span>
          </div>
        </div>
      </div>

      {/* TIMELINE : Chronologie T0 à T7 (Section 22) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Chronologie Certifiée des Événements (T0 – T7)</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {proof.chronology.milestones.map((m, idx) => (
            <div
              key={m.key}
              className={`p-3 rounded-2xl border text-xs flex flex-col justify-between ${
                m.isCompleted
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-950/40 border-slate-900 text-slate-600'
              }`}
            >
              <div>
                <span className="text-[10px] font-mono text-slate-500 block uppercase mb-1">
                  T{idx} • {m.label}
                </span>
                <span className={`font-mono text-xs font-bold block ${m.isCompleted ? 'text-white' : 'text-slate-600'}`}>
                  {m.timestamp ? format(new Date(m.timestamp), 'HH:mm:ss', { locale: fr }) : '—'}
                </span>
              </div>
              {m.timestamp && (
                <span className="text-[10px] font-mono text-slate-500 block mt-2">
                  {format(new Date(m.timestamp), 'dd/MM/yyyy')}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PERFORMANCE & SLA (Section 22) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Temps de Réaction (ACK)</span>
          <span className="text-xl font-black text-cyan-300 block">
            {proof.performance.formatted.time_to_ack || '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Prise en compte SOC</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Temps de Trajet</span>
          <span className="text-xl font-black text-blue-300 block">
            {proof.performance.formatted.travel_time || '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Départ ➔ Arrivée</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Temps Total d'Arrivée</span>
          <span className="text-xl font-black text-purple-300 block">
            {proof.performance.formatted.total_arrival || '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Alerte ➔ Sur les lieux</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Durée Totale Intervention</span>
          <span className="text-xl font-black text-emerald-300 block">
            {proof.performance.formatted.total_intervention || '—'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Alerte ➔ Clôture définitive</span>
        </div>
      </div>

      {/* INFORMATIONS AGENT (Section 22 & 29: pas de données confidentielles internes) */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <User className="w-4 h-4 text-cyan-400" />
          <span>Patrouilleur Déployé</span>
        </h2>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-800 text-cyan-300 font-bold flex items-center justify-center">
              {proof.agent.full_name ? proof.agent.full_name[0] : 'A'}
            </div>
            <div>
              <span className="text-sm font-bold text-white block">{proof.agent.full_name}</span>
              <span className="text-slate-400 font-mono text-[11px]">
                Matricule Professionnel : <strong className="text-slate-300">{proof.agent.badge_number}</strong>
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right font-mono text-[11px] text-slate-400">
            <span>Véhicule d'intervention : <strong className="text-white">{proof.agent.patrol_vehicle || 'Patrouille d’intervention'}</strong></span>
          </div>
        </div>
      </div>

      {/* RAPPORT DE MISSION (Section 22) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Compte-Rendu d'Intervention & Constatations</span>
        </h2>

        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold uppercase tracking-wider text-[11px] block">
              1. Constat à l'arrivée :
            </span>
            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
              {report?.findings || 'Levée de doute effectuée sans incident majeur signalé.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold uppercase tracking-wider text-[11px] block">
              2. Actions effectuées :
            </span>
            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
              {report?.actions_taken || 'Contrôle des accès, inspection visuelle du périmètre.'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] block">
              3. Résultat final & Situation :
            </span>
            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
              {report?.outcome || 'Situation normalisée, site sécurisé et remis sous surveillance.'}
            </p>
          </div>

          {report?.damages && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 space-y-1">
              <span className="text-rose-300 font-bold uppercase tracking-wider text-[11px] block">
                Dommages constatés :
              </span>
              <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{report.damages}</p>
            </div>
          )}

          {report?.recommendations && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px] block">
                Recommandations pour le client :
              </span>
              <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{report.recommendations}</p>
            </div>
          )}
        </div>
      </div>

      {/* CHECKLIST DE CONTRÔLE (Section 22) */}
      {report?.checklist && report.checklist.length > 0 && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-cyan-400" />
            <span>Contrôles de Sécurité & Points Vérifiés</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {report.checklist.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-2xl border flex items-center gap-2.5 ${
                  item.checked
                    ? 'bg-emerald-950/20 border-emerald-700/50 text-white font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${item.checked ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PREUVES PHOTOGRAPHIQUES (Section 22) */}
      {hasPhotos && (
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-cyan-400" />
            <span>Preuves Photographiques Validées ({report!.photos.length})</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {report!.photos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo.url || null)}
                className="relative rounded-2xl overflow-hidden border border-slate-800 aspect-video bg-slate-950 cursor-pointer group"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || 'Preuve d’intervention'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                {photo.caption && (
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80 text-[11px] text-white truncate">
                    {photo.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PREUVE DE LOCALISATION GPS (Section 22) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <span>Données de localisation enregistrées par HOREB SECURE</span>
        </h2>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Emplacement Site Client</span>
            <span className="font-bold text-white block mt-0.5">
              {proof.gps.site_coordinates ? `${proof.gps.site_coordinates[0].toFixed(5)}, ${proof.gps.site_coordinates[1].toFixed(5)}` : 'Non renseigné'}
            </span>
            <span className="text-[11px] text-slate-400 font-sans block mt-1">{proof.site.address}</span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Position d'Arrivée de la Patrouille</span>
            <span className="font-bold text-cyan-400 block mt-0.5">
              {proof.gps.arrival_coordinates ? `${proof.gps.arrival_coordinates[0].toFixed(5)}, ${proof.gps.arrival_coordinates[1].toFixed(5)}` : 'Position temps réel'}
            </span>
            <span className="text-[11px] text-slate-400 font-sans block mt-1">
              Précision certifiée : ±{proof.gps.accuracy_meters || 10} mètres
            </span>
          </div>
        </div>
      </div>

      {/* BOUTON FINAL TÉLÉCHARGEMENT PDF (Section 22) */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 border border-cyan-800/50 text-center space-y-3">
        <h3 className="text-base font-bold text-white">
          Besoin du dossier d'intervention officiel pour votre assureur ou votre direction ?
        </h3>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">
          Téléchargez le document numérique <strong>Proof of Intervention</strong> certifié par HOREB SECURE avec horodatages immuables, géolocalisation et constatations.
        </p>
        <div className="pt-2">
          <a
            href={`/api/interventions/${proof.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-3 px-6 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs shadow-xl shadow-cyan-950 transition-all hover:scale-[1.02]"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger le Proof of Intervention (PDF Certifié)</span>
          </a>
        </div>
      </div>

      {/* Lightbox Photo */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedPhoto(null)}
        >
          <img
            src={selectedPhoto}
            alt="Preuve d'intervention"
            className="max-w-full max-h-full rounded-2xl border border-slate-800 object-contain"
          />
        </div>
      )}

      {/* Modal Signature Tactile (Section 18 & 19) */}
      {isSignModalOpen && (
        <SignaturePad
          interventionId={proof.id}
          interventionNumber={proof.intervention_number}
          siteName={proof.site.name}
          clientName={proof.client.full_name}
          reportSummary={proof.report.findings || proof.report.outcome}
          onSave={handleSaveSignature}
          onClose={() => setIsSignModalOpen(false)}
        />
      )}
    </div>
  );
}

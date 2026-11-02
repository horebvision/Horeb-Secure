'use client';

import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Clock,
  CheckSquare,
  Square,
  Lightbulb,
  FileSearch,
  PenTool,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import {
  parseStructuredReport,
  isStructuredReport,
} from '@/lib/interventions/report-parser';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AgentReportViewerProps {
  rawReport?: string | null;
  className?: string;
  defaultOpenPhotos?: boolean;
}

export function AgentReportViewer({
  rawReport,
  className = '',
}: AgentReportViewerProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  if (!rawReport || !rawReport.trim()) {
    return (
      <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-400 italic ${className}`}>
        Aucun compte-rendu d&apos;intervention renseigné pour le moment.
      </div>
    );
  }

  // Cas 1 : Rapport en texte brut simple (V1)
  if (!isStructuredReport(rawReport)) {
    return (
      <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 ${className}`}>
        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" />
          <span>Compte-Rendu Détaillé de l&apos;Agent :</span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 whitespace-pre-wrap">
          {rawReport.trim()}
        </p>
      </div>
    );
  }

  // Cas 2 : Rapport structuré V2 (JSON parsé et rendu de façon limpide)
  const report = parseStructuredReport(rawReport);
  const checklist = report.checklist || [];
  const checkedCount = checklist.filter((item) => item.checked).length;
  const totalChecklist = checklist.length;
  const hasPhotos = (report.photos?.length || 0) > 0;
  const signature = report.signature;
  const damages = report.damages?.trim() || '';
  const hasDamages =
    damages.length > 0 &&
    damages.toLowerCase() !== 'aucun' &&
    damages.toLowerCase() !== 'ras' &&
    damages.toLowerCase() !== 'néant';

  const statusBadge = () => {
    switch (report.report_status) {
      case 'REPORT_VALIDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Rapport Validé SOC</span>
          </span>
        );
      case 'REPORT_SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700">
            <CheckCircle2 className="w-3 h-3 text-cyan-400" />
            <span>Transmis par l&apos;Agent</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Brouillon</span>
          </span>
        );
    }
  };

  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 shadow-lg ${className}`}>
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-xs font-black text-white uppercase tracking-wider">
            Compte-Rendu Détaillé de l&apos;Agent
          </span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge()}
          {signature?.status === 'SIGNED' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
              <PenTool className="w-3 h-3 text-emerald-400" />
              <span>Signé par le client</span>
            </span>
          )}
        </div>
      </div>

      {/* Synthèse Opérationnelle principale (Grille 3 volets) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Constat à l'arrivée */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center gap-1 tracking-wider">
            <FileSearch className="w-3 h-3" />
            <span>Constat à l&apos;arrivée</span>
          </span>
          <p className="text-xs text-white font-medium leading-relaxed whitespace-pre-wrap">
            {report.findings || 'Aucun constat spécifique signalé.'}
          </p>
        </div>

        {/* 2. Actions effectuées */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1 tracking-wider">
            <ShieldCheck className="w-3 h-3" />
            <span>Actions menées</span>
          </span>
          <p className="text-xs text-white font-medium leading-relaxed whitespace-pre-wrap">
            {report.actions_taken || 'Ronde et vérifications effectuées.'}
          </p>
        </div>

        {/* 3. Bilan / Résultat final */}
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1 tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            <span>Bilan / Situation finale</span>
          </span>
          <p className="text-xs text-white font-medium leading-relaxed whitespace-pre-wrap">
            {report.outcome || 'Périmètre sécurisé sans incident.'}
          </p>
        </div>
      </div>

      {/* Alertes & Recommandations éventuelles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Dommages constatés */}
        <div
          className={`p-3 rounded-xl border space-y-1 ${
            hasDamages
              ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
              : 'bg-slate-900/60 border-slate-800/70 text-slate-300'
          }`}
        >
          <span className="text-[10px] uppercase font-bold flex items-center gap-1 tracking-wider">
            <AlertTriangle
              className={`w-3 h-3 ${hasDamages ? 'text-rose-400' : 'text-slate-500'}`}
            />
            <span className={hasDamages ? 'text-rose-300 font-bold' : 'text-slate-400'}>
              Dommages constatés
            </span>
          </span>
          <p className="text-xs leading-relaxed">
            {report.damages || 'Aucun dommage relevé sur les accès ou les biens.'}
          </p>
        </div>

        {/* Recommandations */}
        {report.recommendations ? (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 space-y-1 text-amber-200">
            <span className="text-[10px] uppercase font-bold flex items-center gap-1 tracking-wider text-amber-400">
              <Lightbulb className="w-3 h-3" />
              <span>Conseils & Recommandations client</span>
            </span>
            <p className="text-xs leading-relaxed font-medium">
              {report.recommendations}
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/70 space-y-1 text-slate-400">
            <span className="text-[10px] uppercase font-bold flex items-center gap-1 tracking-wider text-slate-500">
              <Lightbulb className="w-3 h-3" />
              <span>Recommandations</span>
            </span>
            <p className="text-xs leading-relaxed">
              Aucune consigne corrective particulière.
            </p>
          </div>
        )}
      </div>

      {/* Observations supplémentaires si existantes */}
      {report.observations && (
        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1 text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Observations complémentaires :
          </span>
          <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
            {report.observations}
          </p>
        </div>
      )}

      {/* Contrôles de sécurité (Checklist) */}
      {totalChecklist > 0 && (
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3 text-cyan-400" />
              <span>Contrôles de sécurité ({checkedCount}/{totalChecklist} validés)</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-400">
              {checkedCount === totalChecklist ? '✓ 100% Conforme' : `${checkedCount}/${totalChecklist}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {checklist.map((item) => (
              <div
                key={item.id}
                className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                  item.checked
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200 font-medium'
                    : 'bg-slate-950/50 border-slate-800/50 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {item.checked ? (
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.checked && item.checked_at && (
                  <span className="text-[10px] font-mono text-emerald-400/80 shrink-0">
                    {format(new Date(item.checked_at), 'HH:mm', { locale: fr })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Télémétrie GPS d'arrivée & Signature du Client */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Télémétrie GPS */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center gap-1 tracking-wider">
            <MapPin className="w-3 h-3" />
            <span>Télémétrie d&apos;Arrivée de la Patrouille</span>
          </span>
          {report.gps?.arrival_latitude && report.gps?.arrival_longitude ? (
            <div className="space-y-1 text-xs">
              <div className="font-mono text-white flex items-center gap-2">
                <span>
                  {report.gps.arrival_latitude.toFixed(5)}° N, {report.gps.arrival_longitude.toFixed(5)}° W
                </span>
                {report.gps.accuracy !== undefined && report.gps.accuracy !== null && (
                  <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    ±{Math.round(report.gps.accuracy)}m
                  </span>
                )}
              </div>
              <span className="text-[10px] text-emerald-400 block">
                ✓ Coordonnées géoréférencées lors du pointage d&apos;arrivée
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Non disponible ou intervention clôturée hors borne GPS.
            </p>
          )}
        </div>

        {/* Signature électronique */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
          <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1 tracking-wider">
            <PenTool className="w-3 h-3" />
            <span>Émargement & Signature du Client</span>
          </span>
          {signature?.status === 'SIGNED' ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">
                    {signature.signer_name}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Rôle : {signature.signer_role || 'CLIENT'}
                  </span>
                </div>
                {signature.signed_at && (
                  <span className="text-[10px] font-mono text-emerald-400">
                    {format(new Date(signature.signed_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                  </span>
                )}
              </div>

              {/* Aperçu de la signature manuscrite */}
              {signature.signature_image && (
                <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center max-h-16 overflow-hidden">
                  <img
                    src={signature.signature_image}
                    alt={`Signature de ${signature.signer_name}`}
                    className="max-h-12 object-contain filter invert contrast-200"
                  />
                </div>
              )}

              {signature.consent_text && (
                <p className="text-[10px] text-slate-400 italic leading-snug">
                  &ldquo;{signature.consent_text}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Intervention clôturée sans émargement direct du client.
            </p>
          )}
        </div>
      </div>

      {/* Preuves Photographiques */}
      {hasPhotos && (
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3 text-cyan-400" />
            <span>Preuves Photographiques ({report.photos.length})</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {report.photos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo.url)}
                className="relative rounded-xl overflow-hidden border border-slate-800 aspect-video bg-slate-950 cursor-pointer group"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || 'Preuve d’intervention'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                {photo.caption && (
                  <div className="absolute inset-x-0 bottom-0 p-1 bg-black/80 text-[10px] text-white truncate">
                    {photo.caption}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Zoom Photo */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={selectedPhoto}
              alt="Preuve zoom"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain border border-slate-700"
            />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

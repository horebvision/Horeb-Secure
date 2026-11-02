'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Shield,
  ArrowLeft,
  MapPin,
  Clock,
  Key,
  Navigation,
  Phone,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Radio,
  Car,
  Download,
  CheckSquare,
  Square,
  Camera,
  AlertOctagon,
} from 'lucide-react';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import { ActiveMissionPanel } from '@/components/agent/ActiveMissionPanel';
import { AgentReportModal } from '@/components/agent/AgentReportModal';
import { authFetch } from '@/lib/utils/api-client';
import { parseStructuredReport } from '@/lib/interventions/report-parser';

export default function InterventionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const interventionId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const loadDetail = async () => {
    try {
      const res = await authFetch(`/api/interventions/${interventionId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Intervention introuvable ou accès refusé');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [interventionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-slate-400">Chargement du dossier de mission...</span>
      </div>
    );
  }

  if (errorMsg || !data?.intervention) {
    return (
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-base font-bold text-white">Impossible de charger l'intervention</h2>
        <p className="text-xs text-slate-400">{errorMsg || 'Dossier inexistant ou hors organisation'}</p>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour aux missions</span>
        </Link>
      </div>
    );
  }

  const { intervention, events } = data;
  const alert = intervention.alerts;
  const typeConfig =
    (ALERT_TYPE_CONFIG as any)[alert?.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const isActive = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'].includes(intervention.status);
  const structuredReport = intervention.report ? parseStructuredReport(intervention.report) : null;

  return (
    <div className="space-y-5 pb-8">
      {/* Barre de retour */}
      <div className="flex items-center justify-between">
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour aux missions</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800">
            {alert?.alert_number || 'SEC'}
          </span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {intervention.status}
          </span>
        </div>
      </div>

      {/* Bannière de statut finalisé */}
      {intervention.status === 'COMPLETED' && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 flex items-center gap-3 text-emerald-300 text-xs font-semibold">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <span className="font-bold block text-white text-sm">Mission sécurisée et clôturée</span>
            <span>Le compte-rendu a été validé et transmis au centre de régulation (SOC).</span>
          </div>
        </div>
      )}

      {intervention.status === 'ABORTED' && (
        <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-3 text-rose-300 text-xs font-semibold">
          <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <span className="font-bold block text-white text-sm">Mission interrompue / Relève sollicitée</span>
            <span>L’incident a été réassigné par le centre de régulation.</span>
          </div>
        </div>
      )}

      {/* Si l'intervention est active, afficher le panneau d'action opérationnel */}
      {isActive && alert && (
        <ActiveMissionPanel
          alert={{
            ...alert,
            intervention,
            client: alert.users,
            site: alert.protected_sites,
          }}
          agentId={intervention.agent_id}
          onRefresh={loadDetail}
        />
      )}

      {/* Détails complets du dossier */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-extrabold text-white">Dossier de Mission Terrain</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Réf: {alert?.alert_number}
          </span>
        </div>

        {/* Qualification de la menace */}
        <div className="flex items-start gap-3">
          <div className={`p-3 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor}`}>
            <Car className={`w-6 h-6 ${typeConfig.textColor}`} />
          </div>
          <div>
            <h4 className="text-base font-extrabold text-white">{typeConfig.label}</h4>
            <p className="text-xs text-slate-400">{typeConfig.description}</p>
          </div>
        </div>

        {/* Site & Consignes d'accès */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-slate-400 block font-semibold">Lieu d'intervention :</span>
                <span className="text-sm font-bold text-white block">
                  {alert?.location_address || alert?.protected_sites?.address || 'Adresse d’intervention'}
                </span>
                {alert?.protected_sites?.name && (
                  <span className="text-xs text-slate-400 block">
                    {alert.protected_sites.name} {alert.protected_sites.city ? `(${alert.protected_sites.city})` : ''}
                  </span>
                )}
              </div>
            </div>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${alert?.latitude || alert?.protected_sites?.latitude || 5.3484},${alert?.longitude || alert?.protected_sites?.longitude || -4.0305}&travelmode=driving`}
              target="_blank"
              rel="noreferrer"
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Itinéraire GPS</span>
            </a>
          </div>

          {/* Consignes sécurisées / Digicode */}
          {alert?.protected_sites?.access_instructions && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-900/60 flex items-start gap-2">
              <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-amber-300 block">Digicode & Accès :</span>
                <span className="text-slate-100 block font-semibold">
                  {alert.protected_sites.access_instructions}
                </span>
              </div>
            </div>
          )}

          {/* Client */}
          {alert?.users && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <div className="text-xs">
                <span className="text-slate-400 block text-[11px]">Résident :</span>
                <span className="font-bold text-white">{alert.users.full_name}</span>
              </div>
              {alert.users.phone && (
                <a
                  href={`tel:${alert.users.phone}`}
                  className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{alert.users.phone}</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Compte-rendu de mission structuré */}
        {structuredReport && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-900/50 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <FileText className="w-4 h-4" />
                <span>Compte-rendu de mission</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                {structuredReport.report_status === 'REPORT_VALIDATED'
                  ? 'Validé SOC'
                  : structuredReport.report_status === 'REPORT_SUBMITTED'
                  ? 'Soumis'
                  : 'Brouillon'}
              </span>
            </div>

            {/* Constatations */}
            {structuredReport.findings && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">Constat sur place :</span>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  {structuredReport.findings}
                </p>
              </div>
            )}

            {/* Actions menées */}
            {structuredReport.actions_taken && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">Actions menées :</span>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  {structuredReport.actions_taken}
                </p>
              </div>
            )}

            {/* Résultat / Bilan */}
            {structuredReport.outcome && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">Résultat final :</span>
                <p className="text-xs text-emerald-300 mt-0.5 font-semibold bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-900/40">
                  {structuredReport.outcome}
                </p>
              </div>
            )}

            {/* Dommages & Recommandations */}
            {(structuredReport.damages || structuredReport.recommendations) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                {structuredReport.damages && (
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-rose-400 block">Dommages constatés :</span>
                    <span className="text-slate-300">{structuredReport.damages}</span>
                  </div>
                )}
                {structuredReport.recommendations && (
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-cyan-400 block">Recommandations :</span>
                    <span className="text-slate-300">{structuredReport.recommendations}</span>
                  </div>
                )}
              </div>
            )}

            {/* Checklist validée */}
            {structuredReport.checklist && structuredReport.checklist.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">
                  Points de contrôle vérifiés :
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {structuredReport.checklist.map((item: any) => (
                    <div
                      key={item.id}
                      className={`p-2 rounded-xl border text-[11px] flex items-center gap-2 ${
                        item.checked
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                          : 'bg-slate-900/40 border-slate-800 text-slate-500 line-through'
                      }`}
                    >
                      {item.checked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Galerie de photographies réelles */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 mb-2">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-bold text-slate-300">
                  Pièces justificatives photographiques ({structuredReport.photos?.length || 0}) :
                </span>
              </div>
              {structuredReport.photos && structuredReport.photos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {structuredReport.photos.map((photo: any) => (
                    <div
                      key={photo.id}
                      className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 aspect-video flex flex-col justify-end relative group"
                    >
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Preuve d’intervention'}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1.5 text-[9px] text-slate-300 truncate">
                        <span>{photo.caption || 'Photo constatation'}</span>
                        {photo.timestamp && (
                          <span className="block text-[8px] text-slate-400 font-mono">
                            {new Date(photo.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  Aucune photographie jointe à ce compte-rendu.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Horodatages de l'Intervention */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
          <span className="font-bold text-slate-400 block">Horodatage de la mission :</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500 block">Affecté à :</span>
              <span className="font-mono text-slate-200">
                {intervention.assigned_at
                  ? new Date(intervention.assigned_at).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Accepté à :</span>
              <span className="font-mono text-slate-200">
                {intervention.accepted_at
                  ? new Date(intervention.accepted_at).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">En route à :</span>
              <span className="font-mono text-slate-200">
                {intervention.en_route_at
                  ? new Date(intervention.en_route_at).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Arrivé sur site :</span>
              <span className="font-mono text-slate-200">
                {intervention.arrived_at
                  ? new Date(intervention.arrived_at).toLocaleTimeString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Frise chronologique alert_events */}
        {events && events.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold text-slate-400 block">
              Journal des événements de sécurité ({events.length}) :
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {events.map((ev: any) => (
                <div
                  key={ev.id}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] flex items-start justify-between gap-2"
                >
                  <div>
                    <span className="font-bold text-cyan-300 block">{ev.event_type}</span>
                    <span className="text-slate-300 block">{ev.comment || ev.description}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions Rapport & Proof of Intervention pour l'agent */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all active:scale-95 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{intervention.report ? 'MODIFIER LE RAPPORT DE MISSION' : 'RÉDIGER LE RAPPORT DE MISSION'}</span>
          </button>

          {['COMPLETED', 'RESOLVED'].includes(intervention.status) && (
            <a
              href={`/api/interventions/${intervention.id}/pdf`}
              download
              className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors active:scale-95"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>TÉLÉCHARGER PROOF OF INTERVENTION (PDF)</span>
            </a>
          )}
        </div>
      </div>

      {/* Modale de rédaction de rapport mobile-first */}
      {isReportModalOpen && (
        <AgentReportModal
          isOpen={isReportModalOpen}
          alertId={alert?.id || ''}
          alertNumber={alert?.alert_number || ''}
          interventionId={intervention.id}
          agentId={intervention.agent_id}
          onClose={() => setIsReportModalOpen(false)}
          onSuccess={loadDetail}
        />
      )}
    </div>
  );
}

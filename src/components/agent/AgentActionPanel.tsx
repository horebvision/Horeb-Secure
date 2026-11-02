'use client';

import React, { useState } from 'react';
import { Alert } from '@/lib/types/securia';
import { useSecuria } from '@/lib/store/securia-context';
import { ALERT_TYPE_CONFIG } from '@/lib/constants/alert-types';
import {
  Car,
  MapPin,
  Key,
  PhoneCall,
  CheckCircle,
  AlertTriangle,
  Send,
  Navigation,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { getReportSummaryText } from '@/lib/interventions/report-parser';

interface AgentActionPanelProps {
  alert: Alert;
}

export function AgentActionPanel({ alert }: AgentActionPanelProps) {
  const { updateAlertStatus, sites } = useSecuria();
  const [reportText, setReportText] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const site = sites.find((s) => s.id === alert.site_id);
  const typeConfig = ALERT_TYPE_CONFIG[alert.type] || ALERT_TYPE_CONFIG.INTRUSION;

  const handleSetEnRoute = () => {
    soundService.vibrate([150, 100, 150]);
    updateAlertStatus(
      alert.id,
      'EN_ROUTE',
      'Agent en route vers les lieux avec gyrophare.'
    );
  };

  const handleSetArrived = () => {
    soundService.vibrate(250);
    updateAlertStatus(
      alert.id,
      'ARRIVED',
      'Arrivée de l’agent de sécurité constatée sur le site.'
    );
  };

  const handleResolveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportText.trim()) {
      alertFallbackPrompt();
      return;
    }
    soundService.playConfirmation();
    updateAlertStatus(
      alert.id,
      'RESOLVED',
      'Intervention sécurisée avec succès et clôturée par l’agent.',
      reportText
    );
    setIsSubmittingReport(false);
  };

  const handleEscalate = () => {
    if (confirm('Voulez-vous escalader cette intervention vers les forces de l’ordre (Police / Gendarmerie) ?')) {
      updateAlertStatus(
        alert.id,
        'ESCALATED',
        'Escalade immédiate : renforts requis / appel 17 déclenché par l’agent.'
      );
    }
  };

  const alertFallbackPrompt = () => {
    window.alert('Veuillez saisir un court compte-rendu pour clôturer l’intervention.');
  };

  return (
    <div className="space-y-5">
      {/* Carte d'Ordre de Mission Terrain */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-base font-bold text-white">Ordre de Mission Prioritaire</h3>
          </div>
          <span className="font-mono text-xs font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-800">
            {alert.alert_number}
          </span>
        </div>

        <div className="flex items-start space-x-3 mb-4">
          <div className={`p-3 rounded-2xl ${typeConfig.bgColor} border ${typeConfig.borderColor}`}>
            <Car className={`w-6 h-6 ${typeConfig.textColor}`} />
          </div>
          <div>
            <h4 className="text-lg font-black text-white">{typeConfig.label}</h4>
            <p className="text-xs text-slate-400">{typeConfig.description}</p>
          </div>
        </div>

        {/* Adresse & Guidage GPS */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2">
              <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs text-slate-400 block">Adresse d'intervention :</span>
                <span className="text-sm font-bold text-white block">
                  {alert.location_address || 'Position GPS reçue'}
                </span>
              </div>
            </div>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${alert.latitude || (site as any)?.latitude || 5.3484},${alert.longitude || (site as any)?.longitude || -4.0305}&travelmode=driving`}
              target="_blank"
              rel="noreferrer"
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center gap-1 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Itinéraire GPS</span>
            </a>
          </div>

          {/* Consignes d'accès au bâtiment / propriété */}
          {site?.access_instructions && (
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-900/50 flex items-start space-x-2 mt-2">
              <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-amber-300 block">Consignes d'accès sécurisé :</span>
                <span className="text-slate-200 block">{site.access_instructions}</span>
              </div>
            </div>
          )}
        </div>

        {/* Notes transmises par le client */}
        {alert.client_notes && (
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 mb-4">
            <span className="font-semibold text-slate-400 block">Observations du résident :</span>
            <span className="italic mt-0.5 block">"{alert.client_notes}"</span>
          </div>
        )}

        {/* Boutons d'Action Séquentiels selon le Statut */}
        <div className="space-y-3 pt-2">
          {alert.status === 'ASSIGNED' && (
            <button
              onClick={handleSetEnRoute}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-950 transition-all active:scale-[0.98]"
            >
              <Car className="w-5 h-5 text-white" />
              <span>ACCEPTER LA MISSION & PARTIR EN ROUTE</span>
            </button>
          )}

          {alert.status === 'EN_ROUTE' && (
            <button
              onClick={handleSetArrived}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-950 transition-all active:scale-[0.98]"
            >
              <MapPin className="w-5 h-5 text-white" />
              <span>SIGNALER MON ARRIVÉE SUR PLACE</span>
            </button>
          )}

          {alert.status === 'ARRIVED' && !isSubmittingReport && (
            <div className="space-y-3">
              <button
                onClick={() => setIsSubmittingReport(true)}
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-950 transition-all"
              >
                <CheckCircle className="w-5 h-5 text-white" />
                <span>RÉDIGER LE RAPPORT & CLÔTURER</span>
              </button>

              <button
                onClick={handleEscalate}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>DEMANDER RENFORTS / ESCALADE POLICE</span>
              </button>
            </div>
          )}

          {/* Formulaire de rapport de clôture */}
          {isSubmittingReport && (
            <form onSubmit={handleResolveAlert} className="space-y-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                <FileText className="w-4 h-4" />
                <span>Compte-rendu d'intervention de fin de mission</span>
              </div>
              <textarea
                rows={3}
                required
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Ex : Ronde périmétrique effectuée. Porte arrière sécurisée. Aucune présence hostile constatée. Propriété remise sous alarme."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSubmittingReport(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>TRANSMETTRE & CLÔTURER</span>
                </button>
              </div>
            </form>
          )}

          {alert.status === 'RESOLVED' && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-emerald-200">Intervention clôturée avec succès</h4>
              {alert.resolution_report && (
                <p className="text-xs text-slate-300 mt-1 italic">
                  &ldquo;{getReportSummaryText(alert.resolution_report)}&rdquo;
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

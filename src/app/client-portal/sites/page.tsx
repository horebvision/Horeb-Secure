'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import {
  Building,
  MapPin,
  ShieldCheck,
  Clock,
  FileText,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Shield,
  Activity,
  Video,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ClientSitesPage() {
  const { sites, currentUser } = useSecuria();
  const [interventions, setInterventions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSitesActivity() {
      try {
        setLoading(true);
        const [intRes, alertsRes] = await Promise.all([
          authFetch('/api/interventions?limit=50'),
          authFetch('/api/alerts?limit=50'),
        ]);

        if (intRes.ok) {
          const intData = await intRes.json();
          setInterventions(intData.interventions || []);
        }
        if (alertsRes.ok) {
          const aData = await alertsRes.json();
          setAlerts(aData.alerts || []);
        }
      } catch (err) {
        console.warn('Erreur chargement activité des sites:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSitesActivity();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Building className="w-6 h-6 text-cyan-400" />
            <span>Mes Sites Protégés ({sites.length})</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gestion et statut opérationnel des sites couverts par votre contrat HOREB SECURE.
          </p>
        </div>
      </div>

      {/* Grille des sites */}
      {sites.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
          <Building className="w-8 h-8 text-slate-600 mx-auto" />
          <p>Aucun site protégé n'est actuellement rattaché à votre compte client.</p>
          <p className="text-[11px] text-slate-500">Contactez le régulateur SOC pour enregistrer un nouveau site.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sites.map((site) => {
            // Trouver la dernière alerte et intervention liée à ce site
            const siteAlerts = alerts.filter((a) => a.site_id === site.id);
            const siteInterventions = interventions.filter((i) => i.alert?.site_id === site.id);
            const lastAlert = siteAlerts[0];
            const lastIntervention = siteInterventions[0];

            return (
              <div
                key={site.id}
                className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 hover:border-slate-700 transition-colors"
              >
                {/* En-tête de carte site */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">{site.name}</h2>
                      {site.is_default && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="flex items-start gap-1.5 text-xs text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{site.address} {site.city ? `(${site.city})` : ''}</span>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                    ACTIF 24/7
                  </span>
                </div>

                {/* Métriques du site */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-0.5">
                      Type de Protection
                    </span>
                    <span className="font-bold text-slate-200">
                      {site.site_type || 'Résidentiel & Télésurveillance'}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-0.5">
                      Télésurveillance
                    </span>
                    <span className="font-bold text-cyan-400">
                      Surveillance H24
                    </span>
                  </div>
                </div>

                {/* Historique d'activité du site */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      <span>Dernière alerte :</span>
                    </span>
                    <span className="font-mono text-white">
                      {lastAlert
                        ? format(new Date(lastAlert.created_at), 'dd/MM/yyyy HH:mm', { locale: fr })
                        : 'Aucune alerte'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      <span>Dernière intervention :</span>
                    </span>
                    {lastIntervention ? (
                      <Link
                        href={`/client-portal/interventions/${lastIntervention.id}`}
                        className="font-mono text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <span>{format(new Date(lastIntervention.created_at), 'dd/MM/yyyy', { locale: fr })}</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span className="font-mono text-slate-500">Aucune</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-900">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-slate-500" />
                      <span>Équipements vidéo :</span>
                    </span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Raccordé au SOC 24/7</span>
                    </span>
                  </div>
                </div>

                {/* Consignes d'accès */}
                {site.access_instructions && (
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                    <span className="text-slate-300 font-bold block mb-0.5">Consignes d'accès patrouille :</span>
                    {site.access_instructions}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

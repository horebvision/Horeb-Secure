'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { authFetch } from '@/lib/utils/api-client';
import { calculateAlertSla } from '@/lib/sla';
import {
  Building,
  Bell,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  ChevronRight,
  MapPin,
  ExternalLink,
  Shield,
  Activity,
  Calendar,
} from 'lucide-react';
import { format, isThisMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function ClientPortalDashboard() {
  const { currentUser, sites } = useSecuria();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClientData() {
      try {
        setLoading(true);
        const [alertsRes, interventionsRes] = await Promise.all([
          authFetch('/api/alerts?limit=50'),
          authFetch('/api/interventions?limit=50'),
        ]);

        if (alertsRes.ok) {
          const data = await alertsRes.json();
          setAlerts(data.alerts || []);
        }

        if (interventionsRes.ok) {
          const data = await interventionsRes.json();
          setInterventions(data.interventions || []);
        }
      } catch (err) {
        console.warn('Erreur chargement portail client:', err);
      } finally {
        setLoading(false);
      }
    }

    loadClientData();
  }, []);

  // Calcul des métriques globales selon Section 18
  const stats = useMemo(() => {
    const totalSites = sites.length;
    const totalAlerts = alerts.length;
    const totalInterventions = interventions.length;

    // Interventions du mois en cours
    const thisMonthInterventions = interventions.filter((int) => {
      const d = int.created_at ? new Date(int.created_at) : null;
      return d ? isThisMonth(d) : false;
    });

    // Analyse SLA réelle pour les alertes/interventions du client
    let slaRespectedCount = 0;
    let slaRiskOrBreachedCount = 0;

    interventions.forEach((int) => {
      const sla = calculateAlertSla(int.alert || int, int);
      if (sla.overallStatus === 'COMPLETED' || sla.overallStatus === 'NORMAL') {
        slaRespectedCount++;
      } else if (sla.overallStatus === 'AT_RISK' || sla.overallStatus === 'BREACHED') {
        slaRiskOrBreachedCount++;
      }
    });

    return {
      totalSites,
      totalAlerts,
      totalInterventions,
      monthCount: thisMonthInterventions.length,
      slaRespected: slaRespectedCount,
      slaRiskOrBreached: slaRiskOrBreachedCount,
    };
  }, [sites, alerts, interventions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* En-tête Client Officiel (Section 18) */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-cyan-950/20 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 mb-3">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>Espace Client Sécurisé • Surveillance Continue 24/7</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Bonjour, {currentUser?.full_name || 'Client Abonné'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
              Consultez l'état de vos sites protégés, suivez vos alertes en temps réel et téléchargez vos dossiers certifiés de <strong>Proof of Intervention</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/client-portal/interventions"
              className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Tous mes rapports PDF</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Cartes KPI (Section 18) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Sites Protégés */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sites</span>
            <Building className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-white">{stats.totalSites}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Sous surveillance</span>
          </div>
        </div>

        {/* Total Alertes */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Alertes</span>
            <Bell className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-white">{stats.totalAlerts}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Événements reçus</span>
          </div>
        </div>

        {/* Total Interventions */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Interventions</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-white">{stats.totalInterventions}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Patrouilles déployées</span>
          </div>
        </div>

        {/* Interventions du Mois */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ce Mois-ci</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-white">{stats.monthCount}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Missions enregistrées</span>
          </div>
        </div>

        {/* SLA Respectés */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SLA Respectés</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-emerald-300">{stats.slaRespected}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Conformes contrat</span>
          </div>
        </div>

        {/* SLA Dépassés ou À Risque */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">SLA Dépassés</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-amber-300">{stats.slaRiskOrBreached}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Incidents lents</span>
          </div>
        </div>
      </div>

      {/* DERNIÈRES INTERVENTIONS & DOSSIERS NUMÉRIQUES */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Dernières Interventions & Preuves (Proof of Intervention)
            </h2>
          </div>
          <Link
            href="/client-portal/interventions"
            className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1"
          >
            <span>Voir tout l'historique</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Chargement de vos interventions en cours...
          </div>
        ) : interventions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 italic">
            Aucune intervention enregistrée pour votre compte pour l'instant. Vos sites sont en sécurité.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {interventions.slice(0, 5).map((int) => {
              const alertData = int.alert || {};
              const siteData = alertData.site || sites.find((s) => s.id === int.site_id) || {};
              const agentData = int.agent || {};
              const isResolved = int.status === 'RESOLVED' || alertData.status === 'RESOLVED' || int.status === 'COMPLETED';
              const sla = calculateAlertSla(int.alert || int, int);

              return (
                <div
                  key={int.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-850/50 rounded-xl px-2 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-cyan-400">
                        #{int.intervention_number || alertData.alert_number || `INT-${int.id.slice(0, 8)}`}
                      </span>
                      <span className="text-xs font-bold text-white">
                        {alertData.type || 'INTERVENTION SÉCURITÉ'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isResolved ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {isResolved ? 'CLÔTURÉE & VALIDÉE' : int.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        <strong className="text-slate-300">{siteData.name || 'Site Client'}</strong>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {int.created_at ? format(new Date(int.created_at), 'dd/MM/yyyy à HH:mm', { locale: fr }) : '—'}
                      </span>
                      <span>•</span>
                      <span className="text-[11px]">
                        SLA Arrivée : <strong className={sla.overallStatus === 'BREACHED' ? 'text-rose-400' : 'text-emerald-400'}>{sla.steps.TOTAL_ARRIVAL?.formattedElapsed || sla.formattedTotalElapsed}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/client-portal/interventions/${int.id}`}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <span>Détail complet</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>

                    <a
                      href={`/api/interventions/${int.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      title="Télécharger le certificat d'intervention officiel"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">PDF</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MES SITES PROTÉGÉS (Aperçu rapide) */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              Mes Sites Protégés ({sites.length})
            </h2>
          </div>
          <Link
            href="/client-portal/sites"
            className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1"
          >
            <span>Gérer mes sites</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map((site) => (
            <div
              key={site.id}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{site.name}</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    ACTIF 24/7
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span>{site.address}</span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500">
                <span>Région : {site.city || 'Abidjan'}</span>
                <span className="text-cyan-400 font-mono">Télésurveillé</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

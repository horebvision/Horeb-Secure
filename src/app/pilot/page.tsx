'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Activity,
  Database,
  Wifi,
  Key,
  Users,
  Smartphone,
  Radio,
  Building,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Send,
  Navigation,
  CheckCheck,
  RefreshCw,
  Eye,
  MapPin,
  Lock,
} from 'lucide-react';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';
import { AuthService } from '@/modules/auth/auth.service';

interface PilotStatusData {
  success: boolean;
  system: {
    api: string;
    database: string;
    dbLatencyMs: number;
    realtime: string;
    auth: string;
    environment: string;
  };
  organization: {
    id: string;
    name: string;
    code: string;
    phone: string;
    email: string;
  };
  security_center: {
    id: string;
    name: string;
    code: string;
    phone?: string;
    email?: string;
    latitude: number;
    longitude: number;
  };
  accounts: {
    client: {
      id: string;
      name: string;
      email: string;
      role: string;
      site?: {
        name: string;
        address: string;
        latitude: number;
        longitude: number;
      };
    };
    agent: {
      id: string;
      name: string;
      email: string;
      role: string;
      badge: string;
      dutyStatus: string;
      vehicle: string;
    };
    soc: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
  };
  scenario: {
    hasActiveAlert: boolean;
    activeAlert: any | null;
    events: any[];
  };
}

export default function PilotControlCenterPage() {
  const router = useRouter();
  const [data, setData] = useState<PilotStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/pilot/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Erreur chargement statut pilote:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleResetScenario = async () => {
    if (!confirm('Réinitialiser le scénario pilote ? Cela effacera les alertes et missions de test de HOREB SECURE PILOT.')) {
      return;
    }
    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch('/api/pilot/reset', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setResetMsg(`Scénario réinitialisé : ${json.deleted_alerts} alerte(s) purgée(s).`);
        await fetchStatus();
      } else {
        setResetMsg(`Erreur : ${json.error || 'Échec du reset'}`);
      }
    } catch (err: any) {
      setResetMsg(`Erreur réseau : ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  const switchRoleTo = async (role: 'USER' | 'AGENT' | 'SECURITY_MANAGER', targetUrl: string) => {
    const pilotAccounts: Record<string, { email: string; pass: string }> = {
      USER: { email: 'client.pilote@securia.org', pass: 'PilotPass2026!' },
      AGENT: { email: 'agent.pilote@securia.org', pass: 'PilotPass2026!' },
      SECURITY_MANAGER: { email: 'soc.pilote@securia.org', pass: 'PilotPass2026!' },
    };

    const pilot = pilotAccounts[role];
    if (pilot) {
      try {
        await AuthService.signIn({ email: pilot.email, password: pilot.pass });
      } catch (err) {
        console.warn('Erreur connexion automatique pilote :', err);
      }
    }

    document.cookie = `securia_role=${role}; path=/; max-age=604800; SameSite=Lax`;
    window.location.href = targetUrl;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      {/* Header Pilote */}
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/90 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl">
          <div className="flex items-center space-x-4">
            <SecuriaLogo variant="shield" size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">HOREB SECURE — PILOTE RÉEL</h1>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Environnement Pilote
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Supervision du banc d'essai opérationnel multi-rôles (Client, SOC, Agent)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleResetScenario}
              disabled={resetting}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition-all shadow-md disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
              <span>{resetting ? 'Réinitialisation...' : 'Réinitialiser le scénario'}</span>
            </button>
            <button
              onClick={fetchStatus}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Rafraîchir les données"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {resetMsg && (
          <div className="p-3.5 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs flex items-center justify-between animate-in fade-in">
            <span>{resetMsg}</span>
            <button onClick={() => setResetMsg(null)} className="text-cyan-400 hover:text-white font-bold ml-2">
              ×
            </button>
          </div>
        )}

        {/* 1. ÉTAT DU SYSTÈME */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">API REST</div>
              <div className="text-sm font-black text-emerald-400">
                {data?.system?.api || 'ONLINE'}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3">
            <Database className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">DATABASE</div>
              <div className="text-sm font-black text-emerald-400">
                {data?.system?.database || 'ONLINE'}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3">
            <Wifi className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">REALTIME</div>
              <div className="text-sm font-black text-cyan-300">
                {data?.system?.realtime || 'CONNECTED'}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3">
            <Key className="w-5 h-5 text-amber-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">AUTH RBAC</div>
              <div className="text-sm font-black text-amber-300">
                {data?.system?.auth || 'OK'}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3 col-span-2 sm:col-span-1">
            <Shield className="w-5 h-5 text-purple-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase">ENVIRONNEMENT</div>
              <div className="text-sm font-black text-purple-300">
                PILOT (ISOLÉ)
              </div>
            </div>
          </div>
        </div>

        {/* 2. COMPTES DU PILOTE & ACCÈS DIRECTS MULTI-APPAREILS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CLIENT */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  APPAREIL 1 : CLIENT
                </span>
                <Smartphone className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-base font-extrabold text-white">Client Pilote</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{data?.accounts?.client?.email}</p>
              
              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-200">{data?.accounts?.client?.site?.name || 'Résidence Pilote'}</span>
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{data?.accounts?.client?.site?.address || 'Boulevard de France, Cocody, Abidjan'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => switchRoleTo('USER', '/dashboard')}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all"
            >
              <span>Ouvrir Interface Client</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* CENTRE SOC */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  APPAREIL 2 : SOC / RÉGULATEUR
                </span>
                <Radio className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="text-base font-extrabold text-white">SOC Pilote</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{data?.accounts?.soc?.email}</p>

              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold text-slate-200">{data?.security_center?.name || 'SOC PILOTE'}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Code: {data?.security_center?.code || 'SOC-PILOT-01'} | Tél: {data?.security_center?.phone || '+33 1 89 00 00 02'}
                </div>
              </div>
            </div>

            <button
              onClick={() => switchRoleTo('SECURITY_MANAGER', '/dispatch')}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950 transition-all"
            >
              <span>Ouvrir Console SOC</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* AGENT */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  APPAREIL 3 : AGENT PATROUILLE
                </span>
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-base font-extrabold text-white">Agent Pilote</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{data?.accounts?.agent?.email}</p>

              <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Badge:</span>
                  <span className="font-mono font-bold text-white text-xs">{data?.accounts?.agent?.badge || 'BADGE-PILOT-01'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Statut:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    data?.accounts?.agent?.dutyStatus === 'AVAILABLE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {data?.accounts?.agent?.dutyStatus || 'AVAILABLE'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => switchRoleTo('AGENT', '/agent')}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950 transition-all"
            >
              <span>Ouvrir Terminal Agent</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. SUIVI EN DIRECT DU SCÉNARIO TEST PILOTE #001 */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-200">
                SCÉNARIO OPÉRATIONNEL : TEST PILOTE #001
              </h2>
            </div>
            {data?.scenario?.hasActiveAlert ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-red-600/30 text-red-300 border border-red-500/50 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span>INTERVENTION EN COURS ({data.scenario.activeAlert.alert_number})</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                Banc d'essai prêt — En attente de déclenchement
              </span>
            )}
          </div>

          {/* Chronologie des 10 étapes du scénario */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-2">
            {[
              { num: '1', title: 'Client Alerte', desc: 'Bouton SOS', done: !!data?.scenario?.hasActiveAlert },
              { num: '2', title: 'Serveur Reçoit', desc: 'Base Supabase', done: !!data?.scenario?.hasActiveAlert },
              { num: '3', title: 'SOC Prise en charge', desc: 'ACKNOWLEDGED', done: !!data?.scenario?.events?.some((e) => e.to_status === 'ACKNOWLEDGED' || e.to_status === 'ASSIGNED' || e.to_status === 'EN_ROUTE' || e.to_status === 'ARRIVED' || e.to_status === 'RESOLVED') },
              { num: '4', title: 'Affectation Agent', desc: 'ASSIGNED', done: !!data?.scenario?.events?.some((e) => e.to_status === 'ASSIGNED' || e.to_status === 'EN_ROUTE' || e.to_status === 'ARRIVED' || e.to_status === 'RESOLVED') },
              { num: '5', title: 'Agent Accepte', desc: 'Terminal mobile', done: !!data?.scenario?.events?.some((e) => e.event_type === 'AGENT_ACCEPTED' || e.to_status === 'EN_ROUTE' || e.to_status === 'ARRIVED' || e.to_status === 'RESOLVED') },
              { num: '6', title: 'En Déplacement', desc: 'EN_ROUTE', done: !!data?.scenario?.events?.some((e) => e.to_status === 'EN_ROUTE' || e.to_status === 'ARRIVED' || e.to_status === 'RESOLVED') },
              { num: '7', title: 'Arrivé sur Site', desc: 'ARRIVED', done: !!data?.scenario?.events?.some((e) => e.to_status === 'ARRIVED' || e.to_status === 'RESOLVED') },
              { num: '8', title: 'Rapport Mission', desc: 'Constat écrit', done: !!data?.scenario?.events?.some((e) => e.to_status === 'RESOLVED') },
              { num: '9', title: 'Résolution Validée', desc: 'RESOLVED', done: !!data?.scenario?.events?.some((e) => e.to_status === 'RESOLVED') },
              { num: '10', title: 'Client Notifié', desc: 'Clôture sécurisée', done: !!data?.scenario?.events?.some((e) => e.to_status === 'RESOLVED') },
            ].map((step) => (
              <div
                key={step.num}
                className={`p-3 rounded-2xl border transition-all ${
                  step.done
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold ${step.done ? 'text-emerald-400' : 'text-slate-400'}`}>
                    Étape {step.num}
                  </span>
                  {step.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full border border-slate-700" />
                  )}
                </div>
                <div className="text-xs font-bold text-white">{step.title}</div>
                <div className="text-[10px] text-slate-400 truncate">{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Événements réels en direct de l'alerte active */}
          {data?.scenario?.events && data.scenario.events.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 mb-2">Traces d'événements enregistrées en base :</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {data.scenario.events.map((ev, i) => (
                  <div key={ev.id || i} className="text-xs font-mono p-2 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                    <span className="text-cyan-400 font-bold">[{ev.event_type}]</span>
                    <span className="text-slate-300 truncate max-w-md mx-2">{ev.comment}</span>
                    <span className="text-[10px] text-slate-400">{new Date(ev.created_at).toLocaleTimeString('fr-FR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield,
  Users,
  Building,
  Radio,
  Key,
  Webhook,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  HardDrive,
} from 'lucide-react';
import type { UsageSummary } from '@/lib/billing/types';
import { authFetch } from '@/lib/utils/api-client';

export default function UsagePage() {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/billing/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      } else {
        throw new Error('Erreur lors du chargement des quotas');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, []);

  const resources = [
    {
      key: 'agents',
      title: 'Agents de Sécurité Terrain',
      icon: <Shield className="w-5 h-5 text-cyan-400" />,
      data: usage?.agents,
      description: 'Agents déployables avec tracking GPS et poste agent mobile.',
    },
    {
      key: 'sites',
      title: 'Sites Protégés & Télésurveillés',
      icon: <Building className="w-5 h-5 text-emerald-400" />,
      data: usage?.sites,
      description: 'Adresses résidentielles, commerciales ou industrielles sous contrat.',
    },
    {
      key: 'users',
      title: 'Utilisateurs & Superviseurs',
      icon: <Users className="w-5 h-5 text-blue-400" />,
      data: usage?.users,
      description: 'Comptes SOC, superviseurs d&apos;exploitation et administrateurs.',
    },
    {
      key: 'clients',
      title: 'Clients Portails Actifs',
      icon: <Users className="w-5 h-5 text-purple-400" />,
      data: usage?.clients,
      description: 'Comptes clients autorisés à consulter le portail d&apos;intervention.',
    },
    {
      key: 'interventions',
      title: 'Interventions d&apos;Urgence (Mois)',
      icon: <Radio className="w-5 h-5 text-rose-400" />,
      data: usage?.interventions,
      description: 'Missions déclenchées, smart dispatches et rapports PDF clôturés.',
    },
    {
      key: 'apiKeys',
      title: 'Clés API Publiques v1',
      icon: <Key className="w-5 h-5 text-amber-400" />,
      data: usage?.apiKeys,
      description: 'Tokens d&apos;intégration système externe et connecteurs SI.',
    },
    {
      key: 'webhooks',
      title: 'Webhooks Temps Réel',
      icon: <Webhook className="w-5 h-5 text-indigo-400" />,
      data: usage?.webhooks,
      description: 'Points de terminaison HMAC notifiés lors d&apos;événements de sécurité.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/business" className="hover:text-slate-200">
              Business OS
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <Link href="/billing" className="hover:text-slate-200">
              Abonnement
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold">Consommation & Quotas</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadUsage}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <Link
              href="/billing/upgrade"
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              <span>Augmenter mes quotas</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <HardDrive className="w-7 h-7 text-cyan-400" />
            <span>Moniteur d&apos;Utilisation & Quotas SaaS</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Suivi en direct des ressources consommées par votre société de sécurité.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Grille des Quotas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((res) => {
            const item = res.data;
            const used = item?.used ?? 0;
            const limit = item?.limit ?? 0;
            const isUnlimited = limit === -1;
            const percentage = isUnlimited ? 0 : Math.min(item?.percentage ?? 0, 100);
            const remaining = isUnlimited ? 'Illimité' : Math.max(0, limit - used);

            const isWarning = !isUnlimited && percentage >= 80 && percentage < 100;
            const isCritical = !isUnlimited && percentage >= 100;

            return (
              <div
                key={res.key}
                className={`p-6 rounded-2xl bg-slate-900/80 border transition-all duration-300 shadow-xl flex flex-col justify-between ${
                  isCritical
                    ? 'border-red-600/80 ring-1 ring-red-500/30'
                    : isWarning
                    ? 'border-amber-500/60 ring-1 ring-amber-500/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
                      {res.icon}
                    </div>
                    {isCritical ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-950 text-red-400 border border-red-800">
                        Limite Atteinte
                      </span>
                    ) : isWarning ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-950 text-amber-400 border border-amber-800">
                        Seuil 80% Dépassé
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                        Conforme
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-white mb-1">{res.title}</h3>
                  <p className="text-[11px] text-slate-400 min-h-[30px] mb-4">
                    {res.description}
                  </p>

                  {/* Chiffres */}
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-2xl font-black text-white">
                      {used}{' '}
                      <span className="text-xs font-semibold text-slate-400">
                        / {isUnlimited ? '∞' : limit}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-cyan-400">
                      {isUnlimited ? 'Illimité' : `${percentage}%`}
                    </div>
                  </div>

                  {/* Barre de progression */}
                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden mb-3 border border-slate-800">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${
                        isCritical
                          ? 'bg-red-500'
                          : isWarning
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${isUnlimited ? 15 : percentage}%` }}
                    />
                  </div>

                  {/* Reste disponible */}
                  <div className="flex justify-between text-[11px] text-slate-400 py-1 border-t border-slate-800/60">
                    <span>Disponible restant :</span>
                    <span className="font-bold text-slate-200">
                      {remaining}
                    </span>
                  </div>
                </div>

                {isCritical && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-red-400 text-[11px] font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Créations bloquées
                    </span>
                    <Link
                      href="/billing/upgrade"
                      className="text-cyan-400 hover:text-cyan-300 font-bold text-[11px] flex items-center gap-0.5"
                    >
                      <span>Upgrader</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Check,
  ChevronRight,
  ArrowRight,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_PLANS } from '@/lib/billing/plans-data';
import type { SaaSPlan, SubscriptionWithPlan } from '@/lib/billing/types';
import { authFetch } from '@/lib/utils/api-client';

export default function UpgradePage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SaaSPlan[]>(Object.values(DEFAULT_PLANS) as any);
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [plansRes, subRes] = await Promise.all([
          authFetch('/api/billing/plans'),
          authFetch('/api/billing/subscription'),
        ]);

        if (plansRes.ok) {
          const pData = await plansRes.json();
          if (Array.isArray(pData) && pData.length > 0) setPlans(pData);
        }
        if (subRes.ok) {
          const sData = await subRes.json();
          setSubscription(sData);
        }
      } catch (err: any) {
        setError('Impossible de charger les options d&apos;abonnement.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handlePlanChange = async (targetPlanCode: string) => {
    setUpdatingPlan(targetPlanCode);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await authFetch('/api/billing/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPGRADE',
          targetPlanCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du changement de plan');
      }

      setSuccessMsg(
        `Félicitations ! Votre organisation est désormais passée au plan ${targetPlanCode}. Vos quotas ont été mis à jour immédiatement.`
      );

      setTimeout(() => {
        router.push('/billing');
      }, 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingPlan(null);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount);
  };

  const currentPlanCode = subscription?.plan?.code || 'BUSINESS';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation Breadcrumbs */}
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
            <span className="text-white font-semibold">Changer de Plan</span>
          </div>

          <Link
            href="/billing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la facturation</span>
          </Link>
        </div>

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Évolution de vos ressources opérationnelles</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Faites évoluer votre forfait HOREB SECURE
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Passez à un forfait supérieur pour débloquer plus d&apos;agents, de sites, l&apos;API Publique v1
            ou les connecteurs partenaires.
          </p>
        </div>

        {/* Feedback message */}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-3 max-w-2xl mx-auto shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-3 max-w-2xl mx-auto shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Grille de comparaison */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isCurrent = p.code === currentPlanCode;
            const isUpdating = updatingPlan === p.code;

            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-2xl p-6 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-slate-900/90 border-2 border-cyan-500 shadow-xl ring-1 ring-cyan-500/20'
                    : 'bg-slate-900/50 border border-slate-800 hover:border-slate-700 shadow-md'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-cyan-600 text-white text-[11px] font-extrabold uppercase tracking-wider shadow">
                    Plan Actuel
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white mb-1">{p.name}</h3>
                  <p className="text-xs text-slate-400 min-h-[32px]">{p.description}</p>
                </div>

                {/* Tarification */}
                <div className="mb-6 pb-4 border-b border-slate-800">
                  {p.code === 'ENTERPRISE' ? (
                    <div className="text-2xl font-bold text-white">Sur Devis</div>
                  ) : (
                    <div>
                      <div className="text-3xl font-extrabold text-white">
                        {formatPrice(p.priceMonthly ?? p.monthlyPrice ?? 0)} <span className="text-xs text-cyan-400 font-bold">FCFA</span>
                      </div>
                      <div className="text-[11px] text-slate-400">par mois</div>
                    </div>
                  )}
                </div>

                {/* Quotas clés */}
                <div className="space-y-2 mb-6 text-xs text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Agents max :</span>
                    <span className="font-bold text-white">
                      {p.quotas.maxAgents === -1 ? 'Illimités' : p.quotas.maxAgents}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Sites protégés :</span>
                    <span className="font-bold text-white">
                      {p.quotas.maxSites === -1 ? 'Illimités' : p.quotas.maxSites}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Interventions / mois :</span>
                    <span className="font-bold text-white">
                      {((p.quotas as any).maxInterventionsMonth ?? (p.quotas as any).maxInterventionsPerMonth) === -1
                        ? 'Illimitées'
                        : ((p.quotas as any).maxInterventionsMonth ?? (p.quotas as any).maxInterventionsPerMonth)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/40">
                    <span className="text-slate-400">Clés API v1 :</span>
                    <span className="font-bold text-white">
                      {p.quotas.maxApiKeys === 0 ? 'Aucune' : p.quotas.maxApiKeys}
                    </span>
                  </div>
                </div>

                {/* Features list */}
                <div className="flex-1 mb-6">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Inclus :
                  </p>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {p.features.includes('SMART_DISPATCH') && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Smart Dispatch ETA</span>
                      </li>
                    )}
                    {p.features.includes('SOC_COMMAND_CENTER') && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                        <span>SOC Command Center</span>
                      </li>
                    )}
                    {p.features.includes('PUBLIC_API') && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                        <span>API Publique REST v1</span>
                      </li>
                    )}
                    {p.features.includes('PARTNER_CONNECTORS') && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Connecteurs Partenaires</span>
                      </li>
                    )}
                    {p.features.includes('ADVANCED_SUPPORT') && (
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-purple-400" />
                        <span>Support Dédié 24/7</span>
                      </li>
                    )}
                  </ul>
                </div>

                {/* Bouton */}
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 text-slate-400 font-bold text-xs cursor-not-allowed text-center"
                  >
                    Votre Plan Actuel
                  </button>
                ) : p.code === 'ENTERPRISE' ? (
                  <Link
                    href="/pricing"
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs text-center transition-colors"
                  >
                    Contacter le commercial
                  </Link>
                ) : (
                  <button
                    disabled={isUpdating}
                    onClick={() => handlePlanChange(p.code)}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mise à jour...</span>
                      </>
                    ) : (
                      <>
                        <span>Passer à ce plan</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

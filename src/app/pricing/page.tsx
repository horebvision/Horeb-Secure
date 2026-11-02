'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Check,
  Zap,
  Building,
  Headphones,
  FileText,
  CreditCard,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  Radio,
  Lock,
} from 'lucide-react';
import { PublicFooter } from '@/components/shared/PublicFooter';

interface PlanPricing {
  code: string;
  name: string;
  tagline: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  recommended?: boolean;
  quotas: {
    agents: string;
    sites: string;
    interventions: string;
    supervisors: string;
    storage: string;
  };
  features: string[];
  ctaText: string;
}

const PRICING_PLANS: PlanPricing[] = [
  {
    code: 'STARTER',
    name: 'Horeb Secure Starter',
    tagline: 'Pour les petites agences de gardiennage et structures locales.',
    monthlyPrice: 49000,
    yearlyPrice: 490000,
    quotas: {
      agents: '10 agents terrain',
      sites: '15 sites protégés',
      interventions: '100 interventions / mois',
      supervisors: '5 superviseurs SOC',
      storage: '1 Go d’archivage cloud',
    },
    features: [
      'Console de Télésurveillance SOC',
      'Smart Dispatch & Géolocalisation',
      'Application Mobile Agent',
      'Preuve d’Intervention (PoI) & Photos',
      'Moteur SLA opérationnel',
      'Support standard par email & WhatsApp',
    ],
    ctaText: 'Choisir le forfait Starter',
  },
  {
    code: 'PROFESSIONNEL',
    name: 'Horeb Secure Professionnel',
    tagline: 'Pour les sociétés de sécurité privée régionales en expansion.',
    monthlyPrice: 129000,
    yearlyPrice: 1290000,
    quotas: {
      agents: '35 agents terrain',
      sites: '50 sites protégés',
      interventions: '500 interventions / mois',
      supervisors: '15 superviseurs SOC',
      storage: '5 Go d’archivage cloud',
    },
    features: [
      'Toutes les fonctionnalités Starter',
      'Portail Client & Bouton SOS Résident',
      'Signature tactile du client sur mobile',
      'Statistiques & Analytics de rentabilité',
      'Webhooks & API Publique v1',
      'Support prioritaire 7j/7',
    ],
    ctaText: 'Choisir le forfait Professionnel',
  },
  {
    code: 'BUSINESS',
    name: 'Horeb Secure Business OS',
    tagline: 'Pour les grands opérateurs de sécurité, patrouilles 24/7 et multisites.',
    monthlyPrice: 299000,
    yearlyPrice: 2990000,
    recommended: true,
    quotas: {
      agents: '100 agents terrain',
      sites: '200 sites protégés',
      interventions: '2 500 interventions / mois',
      supervisors: '50 superviseurs SOC',
      storage: '25 Go d’archivage cloud',
    },
    features: [
      'Toutes les fonctionnalités Professionnel',
      'Moteur SLA avancé & Suivi des pénalités',
      'Clôture horodatée RFC 3161 inaltérable',
      'Connecteurs partenaires & Intégrations',
      'Rapports d’audit automatiques programmés',
      'Gestionnaire de compte dédié & Onboarding',
    ],
    ctaText: 'Choisir le forfait Business OS',
  },
  {
    code: 'ENTERPRISE',
    name: 'Horeb Secure Enterprise',
    tagline: 'Déploiement sur-mesure pour institutions, banques et grands réseaux nationaux.',
    monthlyPrice: null,
    yearlyPrice: null,
    quotas: {
      agents: 'Agents illimités',
      sites: 'Sites illimités',
      interventions: 'Interventions illimitées',
      supervisors: 'Accès illimités',
      storage: 'Stockage dédié sur-mesure',
    },
    features: [
      'Infrastructure Cloud dédiée & Cloisonnement privé',
      'SLA garanti contractuellement 99.95%',
      'Intégration sur-mesure avec vos ERP / CRM',
      'Support 24/7 de niveau ingénierie dédié',
      'Formation continue sur site à Abidjan',
      'Contrat-cadre annuel personnalisable',
    ],
    ctaText: 'Demander une étude sur-mesure',
  },
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const formatPrice = (amount: number | null | undefined) => {
    if (!amount) return '0';
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-red-500 selection:text-white">
      {/* Hero Tarifs */}
      <section className="relative pt-12 pb-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Glow ambient */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-red-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-red-400" />
            <span>Tarification B2B Transparente en FCFA</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Des forfaits calibrés pour vos{' '}
            <span className="bg-gradient-to-r from-red-500 via-rose-400 to-amber-400 bg-clip-text text-transparent">
              opérations de sécurité
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Sans frais cachés, sans surcoût matériel imprévu. Tous nos forfaits incluent les mises à jour,
            l'hébergement sécurisé haute disponibilité et l'accompagnement au déploiement en Côte d'Ivoire.
          </p>

          {/* Toggle Mensuel / Annuel */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <span
              onClick={() => setBillingCycle('MONTHLY')}
              className={`text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                billingCycle === 'MONTHLY' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Facturation Mensuelle
            </span>

            <button
              type="button"
              onClick={() => setBillingCycle(billingCycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY')}
              className="relative w-12 h-6 rounded-full bg-slate-800 border border-slate-700 transition-colors focus:outline-none p-0.5"
              aria-label="Changer cycle de facturation"
            >
              <div
                className={`w-5 h-5 rounded-full bg-gradient-to-r from-red-500 to-amber-500 shadow-md transform transition-transform ${
                  billingCycle === 'YEARLY' ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>

            <div className="flex items-center gap-1.5">
              <span
                onClick={() => setBillingCycle('YEARLY')}
                className={`text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                  billingCycle === 'YEARLY' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Facturation Annuelle
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                -15% Réduction
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Grille des Plans */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {PRICING_PLANS.map((plan) => {
            const isFeatured = plan.recommended;
            const price = billingCycle === 'MONTHLY' ? plan.monthlyPrice : plan.yearlyPrice;

            return (
              <div
                key={plan.code}
                className={`relative flex flex-col rounded-3xl p-6 transition-all duration-300 ${
                  isFeatured
                    ? 'bg-slate-900 border-2 border-red-500/80 shadow-2xl shadow-red-950/40 ring-1 ring-red-500/20'
                    : 'bg-slate-900/70 border border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {/* Badge Recommandé */}
                {isFeatured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-red-600 to-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-lg shadow-red-950">
                    Recommandé SOC &amp; Flottes
                  </div>
                )}

                {/* En-tête Plan */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-xs text-slate-400 min-h-[34px] leading-relaxed">{plan.tagline}</p>
                </div>

                {/* Section Tarif */}
                <div className="mb-6 pb-6 border-b border-slate-800">
                  {price === null ? (
                    <div>
                      <div className="text-2xl font-black text-white">Sur Devis</div>
                      <div className="text-xs text-slate-400 mt-1">Étude personnalisée sous 24h</div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white tracking-tight">
                          {formatPrice(price)}
                        </span>
                        <span className="text-xs font-bold text-red-400 uppercase">FCFA</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {billingCycle === 'MONTHLY' ? 'par mois (facturé mensuellement)' : 'par an (facturé annuellement)'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bouton d'action principal */}
                <Link
                  href={`/demo?plan=${plan.code}`}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all mb-6 ${
                    isFeatured
                      ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-950/60'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                  }`}
                >
                  <span>{plan.ctaText}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                {/* Quotas Inclus */}
                <div className="mb-6 space-y-2 text-xs">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Capacité incluse :
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Agents :</span>
                      <span className="font-semibold text-white">{plan.quotas.agents}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Sites :</span>
                      <span className="font-semibold text-white">{plan.quotas.sites}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Interventions :</span>
                      <span className="font-semibold text-white">{plan.quotas.interventions}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400">Superviseurs :</span>
                      <span className="font-semibold text-white">{plan.quotas.supervisors}</span>
                    </div>
                  </div>
                </div>

                {/* Liste des Fonctionnalités */}
                <div className="flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Fonctionnalités :
                  </p>
                  <ul className="space-y-2.5 text-xs text-slate-300">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Moyens de Paiement Certifiés Côte d'Ivoire & UEMOA */}
      <section id="payment" className="bg-slate-900/40 border-y border-slate-800 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">
              Modalités de Paiement en Côte d'Ivoire
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Nous adaptons nos modes de règlement aux standards administratifs et bancaires des entreprises ivoiriennes.
              Chaque facture est normalisée avec mentions RCCM et Compte Contribuable.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <Building className="w-8 h-8 text-amber-400 mb-3" />
              <h3 className="text-sm font-bold text-white mb-1.5">Virement Bancaire UEMOA</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Paiement sur facture à échéance via nos comptes BACI, SGCI, Ecobank, NSIA ou Bridge Bank.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <CreditCard className="w-8 h-8 text-amber-400 mb-3" />
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-sm font-bold text-white">Paiement en Ligne</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">
                  Configuration en cours
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Paiement direct en ligne (Wave, Orange, MTN) en cours de raccordement technique opérateur. Règlement disponible par virement bancaire sécurisé et validation administrative.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <FileText className="w-8 h-8 text-cyan-400 mb-3" />
              <h3 className="text-sm font-bold text-white mb-1.5">Facturation Normalisée DGI</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Factures avec TVA 18% conformes aux obligations fiscales OHADA et de la DGI de Côte d'Ivoire.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <Headphones className="w-8 h-8 text-purple-400 mb-3" />
              <h3 className="text-sm font-bold text-white mb-1.5">Déploiement sous 24h &amp; Formation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Formation de vos régulateurs SOC et de vos agents de terrain incluse sans surcoût.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Foire Aux Questions (FAQ) */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Transparence Totale</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Questions Fréquentes sur les Tarifs
          </h2>
        </div>

        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-2">
              Comment se déroule la période d'essai gratuite ?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Nous offrons 14 jours d'essai sans engagement à toute société de sécurité immatriculée. Notre équipe configure votre instance privée sous 24h et vous accompagne pour tester vos patrouilles en conditions réelles à Abidjan.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-2">
              Que se passe-t-il si nous dépassons le nombre d'agents ou de sites ?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Aucune coupure de service n'est appliquée en pleine intervention. Vous recevez une alerte de dépassement préventive, et votre chargé de compte ajuste votre formule au prorata temporis selon l'évolution de vos effectifs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-2">
              Nos données opérationnelles sont-elles isolées des autres entreprises ?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Oui, de façon stricte. Chaque entreprise cliente dispose d'une étanchéité totale garantie par les règles Row-Level Security (RLS) et des clés d'organisation indépendantes. Vos clients, agents et rapports ne sont accessibles que par vos utilisateurs autorisés.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-sm font-bold text-white mb-2">
              Quels équipements matériels sont nécessaires pour nos agents ?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              L'application agent HOREB SECURE s'exécute sur n'importe quel smartphone Android ou iOS standard doté du GPS et d'un appareil photo. Aucune acquisition de terminal propriétaire onéreux n'est obligatoire.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-red-950/60 via-slate-900 to-amber-950/60 border border-slate-800 p-8 sm:p-12 text-center shadow-2xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
            Besoin d'un accompagnement personnalisé pour votre société ?
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mb-6 leading-relaxed">
            Nos experts en sécurité opérationnelle analysent votre volume de sites et vos patrouilles pour vous recommander la configuration la plus rentable.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/demo"
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-red-950/60 transition-all hover:scale-105"
            >
              Demander une démonstration gratuite
            </Link>
            <Link
              href="/login"
              className="px-6 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm border border-slate-700 transition-all"
            >
              Accéder à l'Espace Client
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Unifié */}
      <PublicFooter />
    </div>
  );
}

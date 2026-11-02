'use client';

import React from 'react';
import Link from 'next/link';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';
import {
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  ArrowRight,
  Shield,
  Lock,
  Layers,
} from 'lucide-react';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-850 bg-slate-950 text-slate-400 text-xs">
      {/* Top Banner / Trust bar */}
      <div className="border-b border-slate-900 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-0.5">SaaS B2B Multi-Entreprises</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cloisonnement strict des données, sécurité de niveau bancaire et disponibilité continue 99.9%.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-0.5">Déployé en Côte d'Ivoire & UEMOA</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Conçu pour les réalités du terrain à Abidjan et dans toute la sous-région ouest-africaine.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white mb-0.5">Preuve Cryptographique PoI</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rapports d'intervention horodatés T0-T7 avec photos inaltérables et signature client tactile.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Brand info */}
          <div className="md:col-span-2 space-y-4">
            <SecuriaLogo variant="navbar" href="/" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mt-3">
              Horeb Secure est la plateforme logicielle tout-en-un pour les sociétés de sécurité privée,
              les centres de télésurveillance (SOC) et les patrouilles d’intervention rapide.
            </p>
            <div className="flex flex-col gap-1.5 pt-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Abidjan, Cocody & Plateau — Côte d'Ivoire</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                <a href="mailto:contact@horebsecure.ci" className="hover:text-white transition-colors">
                  contact@horebsecure.ci
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                <span>+225 07 00 00 00 00 (Service Commercial B2B)</span>
              </div>
            </div>
          </div>

          {/* Solutions & Plateforme */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">
              Plateforme
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/#features" className="hover:text-white transition-colors">
                  Fonctionnalités Clés
                </Link>
              </li>
              <li>
                <Link href="/#pipeline" className="hover:text-white transition-colors">
                  Chaîne d'Intervention
                </Link>
              </li>
              <li>
                <Link href="/#modules" className="hover:text-white transition-colors">
                  Centre SOC &amp; Dispatch
                </Link>
              </li>
              <li>
                <Link href="/#modules" className="hover:text-white transition-colors">
                  Application Mobile Agents
                </Link>
              </li>
              <li>
                <Link href="/#modules" className="hover:text-white transition-colors">
                  Portail Résident &amp; Client
                </Link>
              </li>
            </ul>
          </div>

          {/* Tarifs & Commercial */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">
              Commercial
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  Grille Tarifaire (FCFA)
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1">
                  <span>Demander une Démo</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </li>
              <li>
                <Link href="/pricing#faq" className="hover:text-white transition-colors">
                  Questions Fréquentes
                </Link>
              </li>
              <li>
                <Link href="/pricing#payment" className="hover:text-white transition-colors">
                  Paiements UEMOA &amp; MoMo
                </Link>
              </li>
            </ul>
          </div>

          {/* Espaces Sécurisés */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">
              Accès Plateforme
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Connexion Collaborateurs
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Console Opérateur SOC
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Poste Mobile Agent
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition-colors">
                  Portail Client
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-slate-500 hover:text-slate-300 transition-colors">
                  Activation compte invité
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-12 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>© {currentYear} Horeb Secure Technologies. Tous droits réservés. Abidjan, Côte d'Ivoire.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Conformité OHADA &amp; DGI</span>
            <span>•</span>
            <span>Chiffrement AES-256</span>
            <span>•</span>
            <Link href="/pricing" className="hover:text-white">Conditions SaaS</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

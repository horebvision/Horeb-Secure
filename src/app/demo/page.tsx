'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Users,
  Shield,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Briefcase,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';
import { PublicFooter } from '@/components/shared/PublicFooter';

function DemoForm() {
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan') || 'BUSINESS_OS';

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    jobTitle: '',
    email: '',
    phone: '',
    city: 'Abidjan',
    country: 'Côte d’Ivoire',
    agentsCount: '25',
    sitesCount: '30',
    clientsCount: '20',
    requestedPlan: initialPlan,
    message: '',
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam) {
      setFormData((prev) => ({ ...prev, requestedPlan: planParam }));
    }
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName.trim() || !formData.contactName.trim() || !formData.email.trim() || !formData.phone.trim()) {
      setError('Veuillez renseigner les champs obligatoires (Entreprise, Responsable, Email et Téléphone).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/billing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          agentsCount: parseInt(formData.agentsCount, 10) || 0,
          sitesCount: parseInt(formData.sitesCount, 10) || 0,
          clientsCount: parseInt(formData.clientsCount, 10) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l’envoi de votre demande.');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de l’envoi. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto p-8 sm:p-12 rounded-3xl bg-slate-900/90 border border-emerald-500/40 text-center backdrop-blur-xl shadow-2xl shadow-emerald-950/20">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
          Demande de démonstration transmise !
        </h2>
        <p className="text-sm sm:text-base text-slate-300 mb-6 leading-relaxed">
          Merci pour votre intérêt pour la plateforme <strong className="text-white">HOREB SECURE</strong>.
          Notre équipe commerciale et technique B2B a bien reçu votre demande pour{' '}
          <strong className="text-emerald-400">{formData.companyName}</strong>.
        </p>

        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-left text-xs text-slate-300 space-y-2 mb-8">
          <div className="flex justify-between">
            <span className="text-slate-400">Responsable contacté :</span>
            <span className="font-semibold text-white">{formData.contactName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Téléphone / WhatsApp :</span>
            <span className="font-semibold text-white">{formData.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Formule pressentie :</span>
            <span className="font-semibold text-cyan-400">{formData.requestedPlan}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Délai d'intervention :</span>
            <span className="font-semibold text-emerald-400">Sous 24 heures ouvrées</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs sm:text-sm transition-all"
          >
            Retour à l'accueil
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
          >
            Espace Collaborateur
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-cyan-950/30">
      <div className="mb-8 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Plateforme SaaS B2B Professionnelle</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
          Demander une démonstration HOREB SECURE
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Réservé aux sociétés de sécurité privées, centres de télésurveillance et directeurs d’exploitation.
          Bénéficiez d'une présentation en direct adaptée à vos effectifs et vos sites.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Entreprise & Responsable */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nom de l’entreprise de sécurité <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="companyName"
                required
                value={formData.companyName}
                onChange={handleChange}
                placeholder="ex: SECURITAS CI, IVOIRE PROTECTION"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nom du responsable <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="contactName"
                required
                value={formData.contactName}
                onChange={handleChange}
                placeholder="ex: M. KOUAME Jean"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Fonction & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Fonction
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="jobTitle"
                value={formData.jobTitle}
                onChange={handleChange}
                placeholder="ex: Directeur Général, Chef SOC"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Email professionnel <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="direction@votre-securite.ci"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Téléphone & Localisation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Téléphone / WhatsApp <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="+225 07 00 00 00"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Ville</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Abidjan"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Pays</label>
            <select
              name="country"
              value={formData.country}
              onChange={handleChange}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
            >
              <option value="Côte d’Ivoire">Côte d’Ivoire</option>
              <option value="Sénégal">Sénégal</option>
              <option value="Burkina Faso">Burkina Faso</option>
              <option value="Mali">Mali</option>
              <option value="Togo">Togo</option>
              <option value="Bénin">Bénin</option>
              <option value="Autre pays">Autre pays</option>
            </select>
          </div>
        </div>

        {/* Métriques d'exploitation (Agents, Sites, Formule) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Nombre d’agents terrain</label>
            <select
              name="agentsCount"
              value={formData.agentsCount}
              onChange={handleChange}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
            >
              <option value="10">1 à 15 agents (Starter)</option>
              <option value="25">16 à 35 agents (Professionnel)</option>
              <option value="75">36 à 100 agents (Business OS)</option>
              <option value="200">Plus de 100 agents (Enterprise)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Sites télésurveillés</label>
            <select
              name="sitesCount"
              value={formData.sitesCount}
              onChange={handleChange}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
            >
              <option value="10">1 à 20 sites</option>
              <option value="50">21 à 75 sites</option>
              <option value="150">76 à 200 sites</option>
              <option value="500">Plus de 200 sites</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Formule pressentie</label>
            <select
              name="requestedPlan"
              value={formData.requestedPlan}
              onChange={handleChange}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
            >
              <option value="STARTER">Starter (49 000 FCFA/m)</option>
              <option value="PROFESSIONNEL">Professionnel (129 000 FCFA/m)</option>
              <option value="BUSINESS_OS">Business OS (299 000 FCFA/m)</option>
              <option value="ENTERPRISE">Enterprise (Sur devis)</option>
            </select>
          </div>
        </div>

        {/* Message / Besoins spécifiques */}
        <div className="pt-2">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Besoins spécifiques & priorités opérationnelles (Optionnel)
          </label>
          <textarea
            name="message"
            rows={3}
            value={formData.message}
            onChange={handleChange}
            placeholder="ex: Intégration de nos caméras Dahua existantes, besoin de Smart Dispatch sur Abidjan Nord, supervision multi-sites..."
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all resize-none"
          />
        </div>

        {/* Bouton de soumission */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm transition-all shadow-xl shadow-red-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Transmission de votre demande...
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                Demander ma démonstration professionnelle
              </>
            )}
          </button>
        </div>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-500" />
          <span>Données confidentielles et sécurisées</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-slate-400 hover:text-cyan-400 transition-colors">
            Consulter les tarifs
          </Link>
          <span>•</span>
          <Link href="/login" className="text-slate-400 hover:text-cyan-400 transition-colors">
            Déjà client ? Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between">
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="text-center text-slate-400 py-12">Chargement du formulaire...</div>}>
          <DemoForm />
        </Suspense>
      </main>

      <PublicFooter />
    </div>
  );
}

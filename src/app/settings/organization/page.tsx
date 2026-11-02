'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building,
  Users,
  Save,
  Globe,
  MapPin,
  Phone,
  Mail,
  Clock,
  Shield,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';

export default function OrganizationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    rccm: '',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    country: 'CI',
    currency: 'XOF',
    timezone: 'Africa/Abidjan',
    quota_warning_threshold: 80,
    grace_period_days: 7,
  });

  useEffect(() => {
    async function loadOrg() {
      try {
        const res = await authFetch('/api/organization');
        if (res.ok) {
          const data = await res.json();
          setForm({
            name: data.name || '',
            rccm: data.rccm || '',
            tax_id: data.tax_id || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            country: data.country || 'CI',
            currency: data.currency || 'XOF',
            timezone: data.timezone || 'Africa/Abidjan',
            quota_warning_threshold: data.quota_warning_threshold ?? 80,
            grace_period_days: data.grace_period_days ?? 7,
          });
        }
      } catch (err: any) {
        setError('Impossible de charger les paramètres de l&apos;organisation');
      } finally {
        setLoading(false);
      }
    }
    loadOrg();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await authFetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/business" className="hover:text-slate-200">
            Business OS
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">Paramètres Organisation</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Building className="w-7 h-7 text-cyan-400" />
              <span>Configuration de l&apos;Organisation</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Informations légales, coordonnées et paramètres opérationnels pour la Côte d&apos;Ivoire.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings/users"
              className="px-3.5 py-2 rounded-xl bg-blue-950/70 border border-blue-800/80 hover:border-blue-600 text-xs font-semibold text-blue-300 hover:text-white transition-all flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Utilisateurs</span>
            </Link>
            <Link
              href="/billing"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
              <span>Abonnement</span>
            </Link>
            <Link
              href="/settings/usage"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Quotas & Usage</span>
            </Link>
          </div>
        </div>

        {/* Feedback messages */}
        {success && (
          <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2.5 shadow-md">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Paramètres de l&apos;organisation enregistrés avec succès.</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-2.5 shadow-md">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1 : Identité Légale */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Building className="w-4 h-4" />
              <span>1. Raison Sociale & Mentions Légales</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nom de la Société de Sécurité *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Horeb Secure Protection SARL"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Numéro RCCM (Côte d&apos;Ivoire)
                </label>
                <input
                  type="text"
                  value={form.rccm}
                  onChange={(e) => setForm({ ...form, rccm: e.target.value })}
                  placeholder="Ex: CI-ABJ-03-2024-B12-00000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Compte Contribuable (CC)
                </label>
                <input
                  type="text"
                  value={form.tax_id}
                  onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                  placeholder="Ex: 2100000 X"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Adresse du Siège Social
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Ex: Immeuble Secur, Plateau, Abidjan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2 : Contact & Facturation */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span>2. Coordonnées Officielles</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email de Facturation & Notifications
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="comptabilite@societe.ci"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Téléphone Principal (+225)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+225 27 20 00 00 00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3 : Localisation & Paramètres Opérationnels */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>3. Région & Paramètres Opérationnels</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Pays par défaut
                </label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="CI">Côte d&apos;Ivoire (CI)</option>
                  <option value="SN">Sénégal (SN)</option>
                  <option value="BF">Burkina Faso (BF)</option>
                  <option value="ML">Mali (ML)</option>
                  <option value="TG">Togo (TG)</option>
                  <option value="BJ">Bénin (BJ)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Devise de référence
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="XOF">Franc CFA UEMOA (XOF)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar Américain (USD)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Fuseau Horaire
                </label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Africa/Abidjan">Africa/Abidjan (GMT+0)</option>
                  <option value="Africa/Dakar">Africa/Dakar (GMT+0)</option>
                  <option value="Europe/Paris">Europe/Paris (GMT+1/2)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Seuil d&apos;alerte de quota (%)
                </label>
                <input
                  type="number"
                  min={50}
                  max={95}
                  value={form.quota_warning_threshold}
                  onChange={(e) =>
                    setForm({ ...form, quota_warning_threshold: parseInt(e.target.value, 10) || 80 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Alerte affichée dès 80% d&apos;utilisation.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Période de grâce après échéance (jours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form.grace_period_days}
                  onChange={(e) =>
                    setForm({ ...form, grace_period_days: parseInt(e.target.value, 10) || 7 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Tolérance opérationnelle sans coupure de service.
                </span>
              </div>
            </div>
          </div>

          {/* Bouton de sauvegarde */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-950/50 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Enregistrer les modifications</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

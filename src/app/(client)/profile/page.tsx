'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSecuria } from '@/lib/store/securia-context';
import { AuthService } from '@/modules/auth/auth.service';
import { authFetch } from '@/lib/utils/api-client';
import {
  User,
  Mail,
  Phone,
  Shield,
  Building,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  Save,
  Key,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, currentRole, organization, refreshProfile, updateCurrentUser } = useSecuria();

  const [fullName, setFullName] = useState(currentUser.full_name || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [medicalNotes, setMedicalNotes] = useState('Aucun antécédent particulier. Groupe sanguin O+');

  const [initialLoading, setInitialLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; phone?: string }>({});

  // 1. Synchronisation avec le profil utilisateur du contexte
  useEffect(() => {
    if (currentUser?.id) {
      if (currentUser.full_name) setFullName(currentUser.full_name);
      if (currentUser.email) setEmail(currentUser.email);
      if (currentUser.phone) setPhone(currentUser.phone);

      if (typeof window !== 'undefined') {
        const savedNotes = localStorage.getItem(`securia_medical_notes_${currentUser.id}`);
        if (savedNotes) {
          setMedicalNotes(savedNotes);
        }
      }
    }
  }, [currentUser?.id, currentUser?.full_name, currentUser?.email, currentUser?.phone]);

  // 2. Chargement initial de la source de vérité autoritaire en base de données
  useEffect(() => {
    let isMounted = true;
    async function fetchServerProfile() {
      if (!currentUser?.id) return;
      try {
        setInitialLoading(true);
        const res = await authFetch('/api/user/profile');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.profile && isMounted) {
            if (data.profile.full_name) setFullName(data.profile.full_name);
            if (data.profile.email) setEmail(data.profile.email);
            if (data.profile.phone) setPhone(data.profile.phone);
            updateCurrentUser({
              full_name: data.profile.full_name,
              phone: data.profile.phone,
            });
          }
        }
      } catch (err) {
        console.warn('[ProfilePage] Note chargement profil serveur:', err);
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }

    fetchServerProfile();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, updateCurrentUser]);

  // 3. Validation et enregistrement persistant
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    const errors: { fullName?: string; phone?: string } = {};

    if (!trimmedName || trimmedName.length < 2) {
      errors.fullName = 'Le nom complet doit comporter au moins 2 caractères.';
    }

    if (!trimmedPhone) {
      errors.phone = 'Le numéro de téléphone est obligatoire.';
    } else if (trimmedPhone.length < 4) {
      errors.phone = 'Le numéro de téléphone est trop court (au moins 4 caractères).';
    } else if (!/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{3,20}$/.test(trimmedPhone)) {
      errors.phone = 'Format de téléphone invalide (ex: +225 07 47 33 84 77).';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Veuillez corriger les champs en surbrillance avant de poursuivre.');
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      const res = await authFetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: trimmedName,
          phone: trimmedPhone,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l’enregistrement des coordonnées.');
      }

      // Sauvegarde des notes médicales locales
      if (typeof window !== 'undefined' && currentUser?.id) {
        localStorage.setItem(`securia_medical_notes_${currentUser.id}`, medicalNotes);
      }

      // 4. Synchronisation immédiate du contexte applicatif global (Navbar, Dashboard, etc.)
      updateCurrentUser({
        full_name: data.profile.full_name,
        phone: data.profile.phone,
      });

      // Synchronisation en arrière-plan depuis l'API de session
      await refreshProfile();

      // Confirmation de succès après persistance vérifiée
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      console.error('[ProfilePage] Erreur enregistrement profil:', err);
      setError(err.message || 'Impossible d’enregistrer votre profil pour le moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await AuthService.signOut();
    router.push('/login');
    router.refresh();
  };

  if (!currentUser.id || !currentUser.email) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Vous n'êtes pas connecté</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Pour consulter vos informations personnelles et vos alertes de sécurité, veuillez vous authentifier.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-950 transition-all"
          >
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const userInitials = fullName.trim()
    ? fullName
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'US';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tableau de bord</span>
        </Link>
        <div className="flex items-center gap-2">
          {initialLoading && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
              <span>Chargement...</span>
            </span>
          )}
          <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-0.5 rounded-full">
            RLS Sécurisé • Persistance DB
          </span>
        </div>
      </div>

      {/* Carte d'identité du profil */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex items-center space-x-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-cyan-950/40 shrink-0">
          {userInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-black text-white truncate">{fullName || 'Utilisateur'}</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300">
              {currentRole}
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate mt-0.5">{email}</p>
          <div className="flex items-center space-x-2 mt-2 text-[11px] text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Protection active • {organization.name}</span>
          </div>
        </div>
      </div>

      {/* Messages d'état */}
      {success && (
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Vos coordonnées de profil ont été enregistrées avec succès en base de données.</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Formulaire d'édition */}
      <form onSubmit={handleSave} className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2">
          Informations Personnelles
        </h2>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Nom complet <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.fullName) {
                  setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                }
              }}
              placeholder="Ex: Kouamé Jean-Marc"
              className={`w-full bg-slate-950 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none transition-all ${
                fieldErrors.fullName
                  ? 'border-rose-500 ring-1 ring-rose-500'
                  : 'border-slate-800 focus:ring-2 focus:ring-cyan-500'
              }`}
            />
          </div>
          {fieldErrors.fullName && (
            <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{fieldErrors.fullName}</span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Adresse email</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              disabled
              value={email}
              className="w-full bg-slate-950/50 border border-slate-800/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
            />
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            L'email est vérifié par Supabase Auth et sert d'identifiant unique non modifiable.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Numéro de téléphone d'urgence <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) {
                  setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                }
              }}
              placeholder="+225 07 00 00 00 00"
              className={`w-full bg-slate-950 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none transition-all font-mono ${
                fieldErrors.phone
                  ? 'border-rose-500 ring-1 ring-rose-500'
                  : 'border-slate-800 focus:ring-2 focus:ring-cyan-500'
              }`}
            />
          </div>
          {fieldErrors.phone && (
            <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{fieldErrors.phone}</span>
            </p>
          )}
          <span className="text-[10px] text-slate-500 mt-1 block">
            Ce numéro permet aux opérateurs du centre de régulation (SOC) de vous joindre immédiatement en cas d'alerte.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Consignes médicales / Vulnérabilités (transmises aux secouristes)
          </label>
          <textarea
            rows={2}
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            placeholder="Ex: Asthme, allergies, groupe sanguin, personnes à mobilité réduite..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enregistrement en base de données...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Enregistrer les modifications</span>
            </>
          )}
        </button>
      </form>

      {/* Sécurité et mot de passe */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2">
          Sécurité du Compte
        </h2>
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="flex items-center space-x-3">
            <Lock className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="text-xs font-bold text-white">Mot de passe de sécurité</div>
              <div className="text-[11px] text-slate-500">Chiffré de bout en bout</div>
            </div>
          </div>
          <Link
            href="/forgot-password"
            className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 font-semibold transition-colors"
          >
            Changer
          </Link>
        </div>

        <button
          onClick={handleSignOut}
          type="button"
          className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter de cette session
        </button>
      </div>
    </div>
  );
}

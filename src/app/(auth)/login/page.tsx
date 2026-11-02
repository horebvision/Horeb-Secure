'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Lock, Mail, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, CheckCircle2, Smartphone } from 'lucide-react';
import { AuthService } from '@/modules/auth/auth.service';
import { useSecuria } from '@/lib/store/securia-context';
import type { UserRole } from '@/modules/users/types';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentRole } = useSecuria();

  // Seuls les chemins internes relatifs sont acceptés (anti open-redirect : "//site", "https://", "/\\site")
  const rawRedirect = searchParams.get('redirect');
  const redirectUrl =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.startsWith('/\\')
      ? rawRedirect
      : null;
  const isExpired = searchParams.get('expired') === 'true';
  const isLoggedOut = searchParams.get('logged_out') === '1' || searchParams.get('logged_out') === 'true';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired ? 'Votre session a expiré. Veuillez vous reconnecter pour continuer.' : null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Veuillez renseigner votre email et mot de passe.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await AuthService.signIn({ email, password });
      setCurrentRole(result.role);
      if (result.organizationId) {
        try {
          localStorage.setItem('securia_org_id', result.organizationId);
          document.cookie = `securia_org_id=${encodeURIComponent(result.organizationId)}; path=/; max-age=604800; SameSite=Lax`;
        } catch {}
      }
      
      let target = result.redirectPath;
      
      // Si une URL de redirection explicite et pertinente a été fournie
      if (redirectUrl && redirectUrl !== '/' && redirectUrl !== '/dashboard' && !redirectUrl.startsWith('/login')) {
        target = redirectUrl;
      }

      // 1. Super Admin Plateforme (SaaS SECURIA) -> Toujours orienté vers la console Superviseur /admin
      if (result.role === 'ADMIN' && result.isPlatformAdmin) {
        if (!redirectUrl || redirectUrl === '/' || redirectUrl === '/dashboard' || redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/client')) {
          target = '/admin';
        }
      }
      // 2. Administrateur Entreprise (Tenant) -> Toujours orienté vers le Dispatch SOC opérationnel
      else if (result.role === 'ADMIN' && !result.isPlatformAdmin) {
        if (!redirectUrl || redirectUrl === '/' || redirectUrl === '/dashboard' || redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/client') || target.startsWith('/admin')) {
          target = '/dispatch';
        }
      }
      // 3. Responsable Sécurité (SOC) -> Dispatch opérationnel
      else if (result.role === 'SECURITY_MANAGER') {
        if (!redirectUrl || redirectUrl === '/' || redirectUrl === '/dashboard' || redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/client')) {
          target = '/dispatch';
        }
      }
      // 4. Secrétaire / Accueil -> Espace Secrétariat
      else if (result.role === 'SECRETARY') {
        if (!redirectUrl || redirectUrl === '/' || redirectUrl === '/dashboard' || redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/client')) {
          target = '/secretariat';
        }
      }
      // 5. Agent de Sécurité Terrain -> Poste Agent Mobile
      else if (result.role === 'AGENT') {
        if (!redirectUrl || redirectUrl === '/' || redirectUrl === '/dashboard' || redirectUrl.startsWith('/dashboard') || redirectUrl.startsWith('/client')) {
          target = '/agent';
        }
      }
      // 6. Client Résident (USER) -> Mon Espace & Bouton SOS
      else if (result.role === 'USER') {
        target = '/dashboard';
      }

      window.location.href = target;
    } catch (err: any) {
      setError(err.message || 'Échec de la connexion. Vérifiez vos identifiants.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Carte Glassmorphism */}
      <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl shadow-cyan-950/20">
        <div className="mb-6 text-center">
          <SecuriaLogo variant="auth" priority />
          <h2 className="text-base sm:text-lg font-bold text-white mt-4 mb-1">
            Connexion à votre espace HOREB SECURE
          </h2>
          <p className="text-xs text-slate-400">
            Entreprise, SOC, agent terrain ou client
          </p>
        </div>

        {/* Confirmation de déconnexion réussie */}
        {isLoggedOut && !error && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">Vous avez été déconnecté avec succès en toute sécurité.</span>
          </div>
        )}

        {/* Message d'erreur ou session expirée */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Adresse email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@horebsecure.app"
                disabled={loading}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">Mot de passe</label>
              <Link
                href="/forgot-password"
                className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Vérification des accès...
              </>
            ) : (
              <>
                Se connecter
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400 space-y-2">
          <p>
            Votre entreprise n'utilise pas encore HOREB SECURE ?{' '}
            <Link href="/demo" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
              Demander une démo
            </Link>
          </p>
          <p className="text-[11px] text-slate-500">
            Collaborateur invité ?{' '}
            <Link href="/register" className="text-slate-400 hover:text-white underline transition-colors">
              Activer mon accès
            </Link>
          </p>
        </div>

        {/* Accès direct & Installation PWA Mobile */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 text-center">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('securia:open_pwa_install_prompt'));
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 text-xs font-bold transition-all active:scale-95 shadow-md shadow-cyan-950/20"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Installer l'application mobile (PWA)</span>
          </button>
        </div>

        {/* Information Sécurité & Inscription */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500">
            Plateforme opérationnelle de sécurité & intervention • Chiffrement SSL/TLS & RLS Actif
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-400">Chargement...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Shield,
  Building2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { AuthService } from '@/modules/auth/auth.service';
import { SecuriaLogo } from '@/components/shared/SecuriaLogo';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenParam = searchParams.get('token') || searchParams.get('invite');
  const emailParam = searchParams.get('email') || '';

  // Mode activation si token ou email présent dans l'URL
  const [isActivationMode, setIsActivationMode] = useState(Boolean(tokenParam || emailParam));
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activationEmailSent, setActivationEmailSent] = useState(false);
  const [clientInviteInfo, setClientInviteInfo] = useState<{ clientName?: string; email?: string } | null>(null);

  // Vérification si le jeton correspond à une invitation client
  React.useEffect(() => {
    if (tokenParam) {
      fetch(`/api/clients/invitations/${tokenParam}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.invitation) {
            setClientInviteInfo({
              clientName: data.invitation.client_name,
              email: data.invitation.email,
            });
            if (data.invitation.email) {
              setEmail(data.invitation.email);
            }
          } else if (data.error) {
            setError(data.error);
          }
        })
        .catch((err) => {
          console.warn('Erreur vérification invitation:', err);
        });
    }
  }, [tokenParam]);

  const handleActivation = async (e: React.FormEvent) => {
    e.preventDefault();

    // Collaborateur d'entreprise : envoi d'un lien de définition du mot de passe par email
    if (!tokenParam) {
      if (!email) {
        setError('Veuillez renseigner votre adresse email professionnelle.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const activateRes = await fetch('/api/auth/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        const activateData = await activateRes.json();
        if (!activateRes.ok || !activateData.success) {
          throw new Error(activateData.error || 'Erreur lors de l’activation de votre compte.');
        }
        setActivationEmailSent(true);
        setSuccess(true);
      } catch (err: any) {
        setError(err.message || "Impossible d'envoyer le lien d'activation.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email || !password) {
      setError('Veuillez renseigner votre email et définir votre mot de passe.');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Si jeton d'invitation client présent, exécuter l'activation client dédiée
      if (tokenParam) {
        const res = await fetch(`/api/clients/invitations/${tokenParam}/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.success) {
          throw new Error(resData.error || 'Échec de l’activation de votre compte client.');
        }

        const effectiveEmail = resData.user?.email || email;

        // Connexion immédiate
        const result = await AuthService.signIn({ email: effectiveEmail, password });
        if (typeof document !== 'undefined') {
          document.cookie = 'securia_role=USER; path=/; max-age=604800; SameSite=Lax';
        }
        setSuccess(true);
        setTimeout(() => {
          window.location.href = result.redirectPath || '/client-portal';
        }, 1200);
        return;
      }
    } catch (err: any) {
      setError(
        err.message ||
          "Identifiants invalides ou invitation expirée. Veuillez contacter l'administrateur de votre entreprise de sécurité."
      );
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg">
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-cyan-950/20">
        <div className="mb-6 text-center">
          <SecuriaLogo variant="auth" priority />
        </div>

        {/* MODE ACTIVATION DE COMPTE INVITÉ */}
        {isActivationMode ? (
          <div>
            <div className="mb-6 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Activation Collaborateur</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">
                Activez votre accès d'entreprise
              </h2>
              <p className="text-xs text-slate-400">
                Votre rôle et votre organisation ont été configurés par votre administrateur.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {success ? (
              <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center text-emerald-300 text-xs space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                {activationEmailSent ? (
                  <>
                    <p className="font-bold text-sm text-white">Vérifiez votre boîte email</p>
                    <p>
                      Si un compte collaborateur correspond à cette adresse, un lien vous permettant de définir
                      votre mot de passe vient d’être envoyé.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-sm text-white">Compte activé avec succès !</p>
                    <p>Redirection sécurisée vers votre espace opérationnel...</p>
                  </>
                )}
              </div>
            ) : (
              <form onSubmit={handleActivation} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Adresse email professionnelle
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre.email@entreprise.ci"
                      disabled={loading || Boolean(emailParam)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all disabled:opacity-75"
                    />
                  </div>
                </div>

                {tokenParam && (
                <>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Définir votre mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Au moins 6 caractères"
                      disabled={loading}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
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

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Répétez votre mot de passe"
                      disabled={loading}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                    />
                  </div>
                </div>
                </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-sm transition-all shadow-lg shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Activation en cours...
                    </>
                  ) : (
                    <>
                      Activer mon accès
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-6 text-center text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setIsActivationMode(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                Retour aux informations d'inscription
              </button>
            </div>
          </div>
        ) : (
          /* PORTAIL D'INFORMATION B2B */
          <div>
            <div className="mb-6 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-800/60 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Plateforme SaaS B2B Professionnelle</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white mb-2">
                Accès réservé aux sociétés de sécurité
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                HOREB SECURE n&apos;est pas une application grand public ouverte à l&apos;auto-inscription.
                L&apos;accès est rigoureusement cloisonné par organisation d&apos;entreprise.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {/* Option 1 : Entreprise de sécurité */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      Vous représentez une société de sécurité ?
                    </h3>
                    <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                      Découvrez comment déployer HOREB SECURE sur votre flotte d&apos;agents, votre centre SOC et vos sites télésurveillés.
                    </p>
                    <Link
                      href="/demo"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Demander une démonstration B2B
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Option 2 : Collaborateur ou client invité */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-blue-500/50 transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-800/40 text-blue-400 shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">
                      Vous êtes collaborateur ou client d&apos;une entreprise ?
                    </h3>
                    <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                      Votre compte doit être créé ou invité par l&apos;administrateur de votre société de sécurité.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Se connecter à mon espace
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={() => setIsActivationMode(true)}
                        className="text-xs text-slate-400 hover:text-slate-200 underline transition-colors cursor-pointer"
                      >
                        J&apos;ai reçu une invitation
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/80 text-center">
              <Link
                href="/pricing"
                className="text-xs text-slate-400 hover:text-cyan-400 transition-colors"
              >
                Consulter les forfaits et quotas de la plateforme HOREB SECURE
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-400">Chargement...</div>}>
        <RegisterContent />
      </Suspense>
    </div>
  );
}

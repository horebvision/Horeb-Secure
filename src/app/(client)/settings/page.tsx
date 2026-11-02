'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Settings,
  Bell,
  Volume2,
  Vibrate,
  EyeOff,
  Clock,
  Shield,
  Smartphone,
  Lock,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  LogOut,
  Building,
  Users,
  ChevronRight,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { AuthService } from '@/modules/auth/auth.service';
import { useSecuria } from '@/lib/store/securia-context';

export default function SettingsPage() {
  const { currentRole } = useSecuria();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [defaultSilent, setDefaultSilent] = useState(false);
  const [countdownDuration, setCountdownDuration] = useState(5);
  const [notifySms, setNotifySms] = useState(true);
  const [notifyCall, setNotifyCall] = useState(true);
  const [saved, setSaved] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    if (typeof document !== 'undefined') {
      const cookiesToPurge = ['securia_role', 'sb-access-token', 'sb-refresh-token'];
      cookiesToPurge.forEach((c) => {
        document.cookie = `${c}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      });
      document.cookie.split(';').forEach((cookie) => {
        const name = cookie.split('=')[0].trim();
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
        }
      });
    }

    try {
      await AuthService.signOut();
    } catch {}

    window.location.replace('/api/auth/signout');
  };

  const handleSave = () => {
    setSaved(true);
    soundService.playConfirmation();
    setTimeout(() => setSaved(false), 2500);
  };

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
        <span className="text-xs font-mono text-slate-500">HOREB SECURE v1.0.0</span>
      </div>

      {/* En-tête */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Paramètres de l'Application</h1>
            <p className="text-xs text-slate-400">
              Configuration des alertes, signaux sonores et protocoles de déclenchement
            </p>
          </div>
        </div>
      </div>

      {saved && (
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Vos préférences ont été sauvegardées avec succès.</span>
        </div>
      )}

      {/* Section Signaux Sonores et Haptiques */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            <span>Sons & Retour Tactile</span>
          </h2>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Signaux sonores d'urgence</div>
              <div className="text-[11px] text-slate-400">Chime de confirmation et sirène de décompte</div>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-4 h-4 accent-cyan-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Vibrations haptiques</div>
              <div className="text-[11px] text-slate-400">Retour tactile lors de l'appui sur le bouton SOS</div>
            </div>
            <input
              type="checkbox"
              checked={vibrationEnabled}
              onChange={(e) => setVibrationEnabled(e.target.checked)}
              className="w-4 h-4 accent-cyan-500 rounded"
            />
          </label>
        </div>
      </div>

      {/* Section Déclenchement d'Alerte */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" />
          <span>Comportement du Bouton SOS</span>
        </h2>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Mode discret par défaut</div>
              <div className="text-[11px] text-slate-400">
                Déclenche l'alerte sans écran lumineux ni son (danger immédiat)
              </div>
            </div>
            <input
              type="checkbox"
              checked={defaultSilent}
              onChange={(e) => setDefaultSilent(e.target.checked)}
              className="w-4 h-4 accent-red-500 rounded"
            />
          </label>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Délai du compte à rebours de grâce</span>
              <span className="text-xs font-mono font-bold text-cyan-400">{countdownDuration} secondes</span>
            </div>
            <div className="flex gap-2 pt-1">
              {[3, 5, 10].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setCountdownDuration(sec)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    countdownDuration === sec
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {sec} s
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-500 block">
              Délai permettant d'annuler une alerte accidentelle avant transmission au centre de dispatch.
            </span>
          </div>
        </div>
      </div>

      {/* Notifications et Relais d'Urgence */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span>Canaux de Relais aux Contacts</span>
        </h2>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Envoi de SMS d'alerte avec lien GPS</div>
              <div className="text-[11px] text-slate-400">SMS automatique aux contacts d'urgence enregistrés</div>
            </div>
            <input
              type="checkbox"
              checked={notifySms}
              onChange={(e) => setNotifySms(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Appel vocal automatisé du centre</div>
              <div className="text-[11px] text-slate-400">Le robot vocal HOREB SECURE appelle le contact priorité #1</div>
            </div>
            <input
              type="checkbox"
              checked={notifyCall}
              onChange={(e) => setNotifyCall(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
          </label>
        </div>
      </div>

      {/* Bouton de sauvegarde */}
      <button
        type="button"
        onClick={handleSave}
        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
      >
        Enregistrer les préférences
      </button>

      {/* Raccourcis Administrateur si rôle privilégié */}
      {(currentRole === 'ADMIN' || currentRole === 'SECURITY_MANAGER') && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Administration Entreprise
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Link
              href="/settings/organization"
              className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-slate-200 transition-colors"
            >
              <span>Organisation</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </Link>
            <Link
              href="/settings/users"
              className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-slate-200 transition-colors"
            >
              <span>Collaborateurs</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </Link>
          </div>
        </div>
      )}

      {/* Zone Clôture de Session / Déconnexion */}
      <div className="p-5 rounded-3xl bg-red-950/20 border border-red-900/40 space-y-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-red-950/60 border border-red-800/50 text-red-400">
            <LogOut className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Session Utilisateur</h3>
            <p className="text-[11px] text-slate-400">
              Déconnectez-vous de votre compte pour libérer la session sur cet appareil.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isLoggingOut}
          className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-950/60 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95"
        >
          <LogOut className="w-4 h-4 text-white" />
          <span>Se déconnecter de HOREB SECURE</span>
        </button>
      </div>
    </div>
  );
}

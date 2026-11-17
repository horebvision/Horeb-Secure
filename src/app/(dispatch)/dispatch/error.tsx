'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Filet de sécurité de la salle de contrôle : une erreur dans un panneau affiche un écran
 * récupérable (avec le message, utile au support) au lieu de la page blanche générique de Next.
 */
export default function DispatchError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error('[Dispatch] Erreur d’affichage :', error);
  }, [error]);

  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-white">La salle de contrôle n’a pas pu s’afficher</h2>
        <p className="text-xs text-slate-400">
          Les alertes continuent d’être reçues et enregistrées. Réessayez ; si le problème persiste,
          transmettez le message ci-dessous au support.
        </p>
        <p className="text-[11px] font-mono text-slate-500 break-words bg-slate-950 border border-slate-800 rounded-xl p-2">
          {message || 'Erreur inconnue'}
          {digest ? ` (réf. ${digest})` : ''}
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => retry()}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-950"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réessayer</span>
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Accueil</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

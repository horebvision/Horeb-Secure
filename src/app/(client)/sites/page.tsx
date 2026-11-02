'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSecuria } from '@/lib/store/securia-context';
import { CreateSiteModal } from '@/components/dispatch/CreateSiteModal';
import {
  Building,
  Plus,
  MapPin,
  Key,
  Trash2,
  ArrowLeft,
  Compass,
  CheckCircle2,
} from 'lucide-react';

export default function ProtectedSitesPage() {
  const { sites, deleteSite, updateSite, currentRole } = useSecuria();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Redirection contextuelle vers Dispatch ou Dashboard selon le rôle
  const backHref = currentRole === 'SECURITY_MANAGER' || currentRole === 'ADMIN' ? '/dispatch' : '/dashboard';
  const backLabel = currentRole === 'SECURITY_MANAGER' || currentRole === 'ADMIN' ? 'Espace Dispatch' : 'Tableau de bord';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Barre de navigation supérieure */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </Link>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-red-950 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter un site</span>
        </button>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Gestion des Sites Protégés</h1>
            <p className="text-xs text-slate-400">
              Résidences, locaux professionnels et commerces connectés au radar cartographique HOREB SECURE
            </p>
          </div>
        </div>

        {/* Liste des sites réels */}
        {sites.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <Building className="w-10 h-10 text-slate-600 mx-auto opacity-50" />
            <h3 className="text-sm font-bold text-slate-300">Aucun site enregistré</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Aucun lieu protégé n'a encore été créé. Cliquez sur « Ajouter un site » pour référencer une adresse avec repérage GPS.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow transition-colors mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Créer mon premier site</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sites.map((site) => (
              <div
                key={site.id}
                className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-700"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white">{site.name}</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {site.site_type}
                    </span>
                    {site.is_default && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600/30 text-red-300 border border-red-500/40">
                        Principal
                      </span>
                    )}
                  </div>

                  <div className="flex items-start space-x-2 text-xs text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      {site.address}, {site.postal_code || ''} {site.city}
                    </span>
                  </div>

                  {site.latitude != null && site.longitude != null && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-cyan-400 font-mono pt-0.5">
                      <Compass className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span>
                        GPS : [{Number(site.latitude).toFixed(4)}, {Number(site.longitude).toFixed(4)}]
                      </span>
                    </div>
                  )}

                  {site.access_instructions && (
                    <div className="flex items-start space-x-2 text-xs text-amber-300/90 pt-1">
                      <Key className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="italic">{site.access_instructions}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
                  {!site.is_default && (
                    <button
                      onClick={() => updateSite(site.id, { is_default: true })}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Définir principal
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (window.confirm(`Supprimer le site protégé "${site.name}" ?`)) {
                        deleteSite(site.id);
                      }
                    }}
                    className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700 transition-colors"
                    title="Supprimer ce site"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Ajout Site avec acquisition GPS haute précision */}
      <CreateSiteModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}

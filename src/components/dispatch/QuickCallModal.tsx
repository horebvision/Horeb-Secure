'use client';

import React, { useState, useEffect } from 'react';
import { Alert } from '@/lib/types/securia';
import {
  Phone,
  PhoneCall,
  XCircle,
  Shield,
  User,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';

interface QuickCallModalProps {
  alert: Alert;
  onClose: () => void;
}

export function QuickCallModal({ alert, onClose }: QuickCallModalProps) {
  const clientName = alert.user?.full_name || 'Client Abonné';
  const clientPhone = alert.user?.phone || 'Non renseigné';

  // Initialisation immédiate avec les contacts pré-chargés dans l'alerte
  const [contacts, setContacts] = useState<any[]>(alert.user?.emergency_contacts || []);
  const [loading, setLoading] = useState<boolean>(!alert.user?.emergency_contacts?.length);

  // Chargement / rafraîchissement sécurisé des contacts d'urgence depuis l'API dédiée
  useEffect(() => {
    let isMounted = true;

    async function fetchAlertContacts() {
      if (!alert?.id) return;
      try {
        const res = await authFetch(`/api/contacts?alert_id=${encodeURIComponent(alert.id)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && Array.isArray(data.contacts)) {
            setContacts(data.contacts);
          }
        }
      } catch (err) {
        console.warn('[QuickCallModal] Note chargement contacts alert:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAlertContacts();

    return () => {
      isMounted = false;
    };
  }, [alert?.id]);

  const handleCall = (number: string, targetName: string) => {
    soundService.playConfirmation();
    // Traçabilité complète dans audit_logs
    if (typeof window !== 'undefined') {
      authFetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DISPATCHER_PHONE_CALL',
          entity_type: 'ALERT',
          entity_id: alert.id,
          details: {
            alert_number: alert.alert_number,
            called_target: targetName,
            phone_number: number,
          },
        }),
      }).catch((err) => console.warn('Audit log error:', err));
    }
    window.location.href = `tel:${number}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Liaison Téléphonique Directe</h3>
              <p className="text-xs text-slate-400">Dossier : {alert.alert_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <p className="text-xs text-slate-300 mb-4">
          Contact immédiat du déclarant ou des services prioritaires pour vérification et levée de doute :
        </p>

        {/* Contacts */}
        <div className="space-y-3 mb-6 max-h-[60vh] overflow-y-auto pr-1">
          {/* Client Déclarant Principal */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-emerald-600/60 transition-all flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800/80 flex items-center justify-center font-bold text-emerald-400 text-sm">
                <User className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  Résident Déclarant
                </span>
                <h4 className="text-sm font-bold text-white">{clientName}</h4>
                <span className="text-xs text-slate-400 font-mono">{clientPhone}</span>
              </div>
            </div>

            <button
              onClick={() => handleCall(clientPhone, clientName)}
              className="py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-colors cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Appeler</span>
            </button>
          </div>

          {/* Section Contacts d'Urgence du Résident */}
          <div className="pt-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Contacts d'Urgence Personnels ({contacts.length})</span>
            </span>

            {loading && contacts.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Recherche des contacts enregistrés...</span>
              </div>
            ) : contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((contact, idx) => (
                  <div
                    key={contact.id || idx}
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-slate-300 text-sm shrink-0">
                        <Shield className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">{contact.name}</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-300">
                            P{contact.priority_order || contact.priority || idx + 1}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          {contact.relation || 'Proche'}
                        </span>
                        <span className="text-xs text-slate-300 font-mono block mt-0.5">
                          {contact.phone}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCall(contact.phone, `${contact.name} (${contact.relation || 'Proche'})`)}
                      className="py-2.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Appeler</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
                <ShieldAlert className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="font-semibold text-slate-300">Aucun contact personnel renseigné</p>
                <p className="text-[11px] text-slate-500">
                  Le déclarant n'a pas configuré de contacts d'urgence dans son espace.
                </p>
              </div>
            )}
          </div>

          {/* Lignes d'Urgence Publiques (Côte d'Ivoire) */}
          <div className="p-3.5 rounded-2xl bg-red-950/30 border border-red-900/50 mt-3">
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-2">
              Services Publics d'Urgence (Côte d'Ivoire)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleCall('170', 'Police Secours CI')}
                className="py-2 px-3 rounded-xl bg-red-900/60 hover:bg-red-900 text-red-200 border border-red-800 text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Police Secours</span>
                <span className="font-mono text-white font-extrabold">170</span>
              </button>
              <button
                onClick={() => handleCall('180', 'GSPM Côte d’Ivoire')}
                className="py-2 px-3 rounded-xl bg-orange-950/60 hover:bg-orange-900 text-orange-200 border border-orange-800 text-xs font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <span>Pompiers GSPM</span>
                <span className="font-mono text-white font-extrabold">180</span>
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
        >
          Fermer la fenêtre
        </button>
      </div>
    </div>
  );
}

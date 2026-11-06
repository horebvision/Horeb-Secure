'use client';

import React, { useState, useEffect } from 'react';
import { VideoEvent } from '@/lib/video/types';
import {
  Activity,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Sliders,
  Send,
  Zap,
} from 'lucide-react';
import { authFetch } from '@/lib/utils/api-client';
import Link from 'next/link';

export function VideoEventsFeed() {
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [simulating, setSimulating] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/video/events?limit=50');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.warn('[VideoEventsFeed] Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // Polling toutes les 20 s, suspendu quand l'onglet est masqué
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      loadEvents();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  // Déclencheur d'événement de test explicitement marqué TEST (Section 19)
  const triggerSimulatedEvent = async (type: string) => {
    setSimulating(true);
    try {
      const testEventId = `TEST_EVT_${Date.now()}`;
      const res = await authFetch('/api/video/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'TEST_VIDEO_PROVIDER',
          event_id: testEventId,
          event_type: type,
          confidence: 96.5,
          detected_at: new Date().toISOString(),
          metadata: { is_test_simulation: true },
        }),
      });

      if (res.ok) {
        await loadEvents();
      }
    } catch (err) {
      console.warn('Erreur déclenchement test simulation:', err);
    } finally {
      setSimulating(false);
    }
  };

  const filtered = events.filter((e) => {
    if (filterType !== 'ALL' && e.status !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Barre d'actions & Simulation de test */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
            FLUX DES DÉTECTIONS VIDÉO & CORRÉLATION SOC
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Boutons d'injection d'événements de test explicites */}
          <button
            type="button"
            onClick={() => triggerSimulatedEvent('INTRUSION_DETECTED')}
            disabled={simulating}
            className="py-1.5 px-2.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-300 font-bold text-[11px] flex items-center gap-1 transition-all disabled:opacity-50"
            title="Injecter un événement TEST_SIMULATOR (Anti-flapping & Alerte)"
          >
            <Zap className="w-3 h-3 text-purple-400" />
            <span>Simuler Intrusion TEST</span>
          </button>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ALERT_CREATED">Alerte Déclenchée</option>
            <option value="CORRELATED">Notifié SOC</option>
            <option value="RECEIVED">Consigné Journal</option>
            <option value="IGNORED">Ignoré (Règle / Cooldown)</option>
          </select>

          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Liste des événements */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="divide-y divide-slate-800/60 font-medium">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Aucun événement vidéo enregistré pour le moment.
            </div>
          ) : (
            filtered.map((evt) => {
              const isAlertCreated = evt.status === 'ALERT_CREATED';
              const isTest = evt.provider.includes('TEST');
              return (
                <div
                  key={evt.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                        isAlertCreated
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : evt.status === 'CORRELATED'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-white">{evt.event_type}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            isTest
                              ? 'bg-purple-950/60 text-purple-300 border-purple-800'
                              : 'bg-slate-800 text-cyan-300 border-slate-700'
                          }`}
                        >
                          {evt.provider}
                        </span>
                        {evt.confidence && (
                          <span className="text-[10px] text-slate-400">
                            Confiance: <strong className="text-slate-200">{evt.confidence}%</strong>
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1 font-mono">
                        Event ID : {evt.event_id} • Détecté à :{' '}
                        {new Date(evt.detected_at).toLocaleTimeString('fr-FR')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {isAlertCreated && evt.correlated_alert_id ? (
                      <Link
                        href={`/dispatch?selected_alert=${evt.correlated_alert_id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40 text-xs font-bold hover:bg-rose-600/30 transition-all"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Alerte Créée</span>
                      </Link>
                    ) : (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        {evt.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

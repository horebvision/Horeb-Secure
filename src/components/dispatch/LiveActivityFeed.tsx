'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { authFetch } from '@/lib/utils/api-client';
import {
  Activity,
  Bell,
  CheckCircle,
  UserCheck,
  CheckCheck,
  Car,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface EventItem {
  id: string;
  alert_id: string;
  actor_id?: string;
  from_status?: string;
  to_status?: string;
  event_type: string;
  comment: string;
  metadata?: any;
  created_at: string;
}

interface LiveActivityFeedProps {
  initialEvents?: EventItem[];
  refreshTrigger?: number | string;
  className?: string;
}

export function LiveActivityFeed({
  initialEvents = [],
  refreshTrigger,
  className = '',
}: LiveActivityFeedProps) {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);
  const [loading, setLoading] = useState(false);

  const fetchRecentEvents = async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/dispatch/activity?limit=30');
      if (res.ok) {
        const data = await res.json();
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch (err) {
      console.warn('[LiveActivityFeed] Erreur chargement événements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialEvents.length > 0) {
      setEvents(initialEvents);
    }
  }, [initialEvents]);

  useEffect(() => {
    fetchRecentEvents();
  }, [refreshTrigger]);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'ALERT_CREATED':
      case 'NEW_ALERT':
        return { icon: Bell, color: 'text-rose-400 bg-rose-950/80 border-rose-600' };
      case 'ALERT_ACKNOWLEDGED':
      case 'ACKNOWLEDGED':
        return { icon: CheckCircle, color: 'text-amber-400 bg-amber-950/80 border-amber-600' };
      case 'AGENT_ASSIGNED':
      case 'ASSIGNED':
        return { icon: UserCheck, color: 'text-cyan-400 bg-cyan-950/80 border-cyan-600' };
      case 'AGENT_ACCEPTED':
      case 'ACCEPTED':
        return { icon: CheckCheck, color: 'text-blue-400 bg-blue-950/80 border-blue-600' };
      case 'PATROL_EN_ROUTE':
      case 'EN_ROUTE':
        return { icon: Car, color: 'text-indigo-400 bg-indigo-950/80 border-indigo-600' };
      case 'PATROL_ARRIVED':
      case 'ARRIVED':
        return { icon: MapPin, color: 'text-purple-400 bg-purple-950/80 border-purple-600' };
      case 'INTERVENTION_COMPLETED':
      case 'RESOLVED':
        return { icon: ShieldCheck, color: 'text-emerald-400 bg-emerald-950/80 border-emerald-600' };
      default:
        return { icon: Activity, color: 'text-slate-400 bg-slate-900 border-slate-700' };
    }
  };

  return (
    <div className={`p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3 ${className}`}>
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">
            Journal Opérationnel en Direct (Live Activity Feed)
          </h3>
        </div>

        <button
          onClick={fetchRecentEvents}
          disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Actualiser le flux"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 italic">
            Aucun événement récent enregistré. Les actions opérationnelles apparaîtront ici en direct.
          </div>
        ) : (
          events.slice(0, 20).map((ev) => {
            const { icon: Icon, color } = getEventIcon(ev.event_type);
            const isMissionComplete = ev.event_type === 'INTERVENTION_COMPLETED';

            return (
              <div
                key={ev.id}
                className={`p-3 rounded-2xl border text-xs transition-all flex items-start gap-3 ${
                  isMissionComplete
                    ? 'bg-emerald-950/30 border-emerald-700/60'
                    : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-200 truncate">
                      {ev.comment}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {format(new Date(ev.created_at), 'HH:mm:ss', { locale: fr })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800">
                      {ev.event_type}
                    </span>
                    {ev.from_status && ev.to_status && (
                      <span className="text-cyan-400 font-mono">
                        {ev.from_status} ➔ {ev.to_status}
                      </span>
                    )}
                  </div>

                  {ev.metadata?.report && (
                    <p className="text-[11px] text-emerald-300 italic pt-1 border-t border-slate-800/60 mt-1 line-clamp-2">
                      "{ev.metadata.report}"
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

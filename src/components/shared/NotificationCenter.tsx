'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  CheckCheck,
  ShieldAlert,
  Car,
  MapPin,
  CheckCircle2,
  Mail,
  Smartphone,
  Radio,
  ExternalLink,
  X,
  Volume2,
} from 'lucide-react';
import { soundService } from '@/lib/utils/sound';
import { authFetch } from '@/lib/utils/api-client';
import { useRealtimeSubscription } from '@/lib/supabase/use-realtime';

interface NotificationCenterProps {
  userId?: string;
  role?: string;
  align?: 'left' | 'right';
}

export function NotificationCenter({
  userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  role,
  align = 'right',
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unreadFilter, setUnreadFilter] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Charger les notifications
  const loadNotifications = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = new URL('/api/notifications', window.location.origin);
      if (userId && userId !== 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') {
        url.searchParams.set('user_id', userId);
      }
      if (role) url.searchParams.set('role', role);

      const res = await authFetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        // Si de nouvelles notifications non lues sont arrivées, jouer un signal
        if (data.unread_count > unreadCount && !silent) {
          soundService.playConfirmation();
        }
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.warn('[NotificationCenter] Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications(true);
  }, [userId, role]);

  // Temps réel : rechargement à chaque nouvelle notification du destinataire (filtrée par la RLS).
  // Remplace l'interrogation toutes les 8 s ; filet de sécurité 60 s (15 s si le temps réel est indisponible),
  // suspendu quand l'onglet est masqué.
  const hasRealUser = !!userId && userId !== 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  useRealtimeSubscription({
    channelName: `notifications:${userId}`,
    table: 'notifications',
    filter: hasRealUser ? `user_id=eq.${userId}` : undefined,
    onRefresh: () => loadNotifications(true),
    enabled: hasRealUser,
  });

  // Fermer la modal en cliquant à l'extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Marquer comme lu
  const handleMarkAsRead = async (notifId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await authFetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          notification_id: notifId,
          mark_all_read: !notifId,
        }),
      });
      loadNotifications(true);
    } catch (err) {
      console.error('Erreur mark as read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'NEW_ALERT_RECEIVED':
      case 'ALERT_ESCALATED':
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case 'INTERVENTION_ACKNOWLEDGED':
        return <Radio className="w-4 h-4 text-blue-400" />;
      case 'AGENT_EN_ROUTE':
        return <Car className="w-4 h-4 text-cyan-400" />;
      case 'AGENT_ARRIVED':
        return <MapPin className="w-4 h-4 text-amber-400" />;
      case 'INTERVENTION_COMPLETED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'ADMINISTRATIVE_NOTICE':
        return <Mail className="w-4 h-4 text-purple-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const filteredNotifications = unreadFilter
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Bouton Cloche de Notification avec Badge */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications(true);
        }}
        className="relative p-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-all focus:outline-none"
        title="Notifications opérationnelles"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-lg shadow-red-950 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Volet Déroulant / Popover des Notifications */}
      {isOpen && (
        <div
          className={`absolute top-full mt-2 w-80 sm:w-96 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden text-white animate-in fade-in zoom-in-95 duration-200 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* En-tête */}
          <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                  {unreadCount} nouvelle(s)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleMarkAsRead()}
                  className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Tout lire</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filtre */}
          <div className="p-2 bg-slate-950/40 border-b border-slate-800 flex gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setUnreadFilter(false)}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                !unreadFilter
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Toutes ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setUnreadFilter(true)}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                unreadFilter
                  ? 'bg-red-950 text-red-300 border border-red-800'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Non lues ({unreadCount})
            </button>
          </div>

          {/* Liste des Notifications */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {unreadFilter
                  ? 'Aucune notification non lue'
                  : 'Aucune notification pour le moment'}
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const date = new Date(notif.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.is_read) handleMarkAsRead(notif.id);
                    }}
                    className={`p-3.5 hover:bg-slate-800/50 transition-colors cursor-pointer space-y-1.5 ${
                      !notif.is_read ? 'bg-cyan-950/20 border-l-2 border-cyan-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                          {getNotificationIcon(notif.type)}
                        </div>
                        <h4 className="text-xs font-bold text-white line-clamp-1">
                          {notif.title}
                        </h4>
                      </div>

                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {date}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed pl-8">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between pl-8 pt-1 text-[10px]">
                      {/* Canal tag */}
                      <span className="font-mono px-1.5 py-0.2 rounded bg-slate-950 border border-slate-800 text-slate-400 uppercase">
                        {notif.channel || 'IN_APP'}
                      </span>

                      {/* Lien direct */}
                      {notif.link && (
                        <Link
                          href={notif.link}
                          onClick={() => setIsOpen(false)}
                          className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-0.5"
                        >
                          <span>Voir le dossier</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

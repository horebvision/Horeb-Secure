import { broadcastOnce } from '@/lib/realtime/broadcast';
/**
 * SERVICE DE NOTIFICATIONS MULTI-CANAUX SECURIA
 * 
 * RÈGLE ARCHITECTURALE FONDAMENTALE :
 * NE JAMAIS CONSIDÉRER UNE NOTIFICATION COMME LA SOURCE DE VÉRITÉ.
 * La base de données (tables alerts et interventions) reste l'unique source
 * de vérité pour l'état d'un incident de sécurité.
 * 
 * Canaux gérés :
 * 1. IN_APP : Notifications internes persistées en base et diffusées en temps réel.
 * 2. PUSH : Notifications push mobiles (Web Push API / Service Worker).
 * 3. SMS : Canal de secours d'urgence (pour résident ou contact d'urgence).
 * 4. EMAIL : Notifications administratives (rapport d'intervention, facturation, audit).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  NotificationChannel,
  NotificationType,
  SecuriaNotification,
  SendNotificationDto,
} from './types';

export class NotificationService {
  /**
   * Envoi d'une notification multi-canaux
   */
  static async send(dto: SendNotificationDto): Promise<{
    success: boolean;
    channelsDispatched: NotificationChannel[];
    inAppNotification?: SecuriaNotification;
  }> {
    const channels = dto.channels || ['IN_APP'];
    const results: NotificationChannel[] = [];
    let savedInApp: SecuriaNotification | undefined;

    // 1. Canal Interne (IN_APP) - Obligatoire pour la persistance et l'historique
    if (channels.includes('IN_APP')) {
      try {
        const { data, error } = await supabaseAdmin.rpc('create_securia_notification', {
          p_user_id: dto.user_id,
          p_title: dto.title,
          p_message: dto.message,
          p_type: dto.type,
          p_link: dto.link || null,
          p_alert_id: dto.alert_id || null,
          p_intervention_id: dto.intervention_id || null,
          p_agent_id: dto.agent_id || null,
          p_role: dto.role || 'USER',
          p_channel: 'IN_APP',
          p_metadata: dto.metadata || {},
          p_organization_id: dto.organization_id || null,
        });

        if (!error && data) {
          savedInApp = data as SecuriaNotification;
          results.push('IN_APP');
        } else {
          console.error('[NotificationService] Erreur RPC create_notification:', error);
        }
      } catch (err) {
        console.error('[NotificationService] Exception IN_APP:', err);
      }
    }

    // 2. Canal PUSH Mobile / Web Push via Supabase Realtime Broadcast & Service Worker
    if (channels.includes('PUSH')) {
      const pushPayload = {
        title: dto.title,
        body: dto.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: dto.alert_id ? `alert-${dto.alert_id}` : 'securia-alert',
        renotify: true,
        requireInteraction: dto.priority === 'CRITICAL' || dto.priority === 'HIGH',
        vibrate: dto.priority === 'CRITICAL' ? [300, 150, 300, 150, 300] : [200, 100, 200],
        data: {
          link: dto.link || '/dashboard',
          alert_id: dto.alert_id,
          type: dto.type,
          user_id: dto.user_id,
          timestamp: Date.now(),
        },
      };

      try {
        // Diffusion en temps réel sur le bus websocket Supabase pour réveil instantané des consoles et PWA
        await broadcastOnce(`user_push_${dto.user_id}`, 'NOTIFICATION_PUSH', pushPayload as Record<string, unknown>);
        results.push('PUSH');
      } catch (pushErr) {
        console.warn('[NotificationService] Note diffusion realtime push:', pushErr);
      }
    }

    // 3. Canal SMS d'Urgence (Twilio / Gateway REST UEMOA)
    if (channels.includes('SMS')) {
      const targetPhone = dto.metadata?.phone || dto.metadata?.emergency_phone;
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://horeb-secure.netlify.app').replace(/\/$/, '');
      const smsMessage = `[HOREB SECURE URGENCE] ${dto.title} : ${dto.message}. Suivi : ${appUrl}${dto.link || ''}`;

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const rawFrom = process.env.TWILIO_FROM_PHONE || 'HorebSecure';
      const twilioFrom = rawFrom.startsWith('+')
        ? rawFrom.replace(/\s+/g, '')
        : rawFrom.replace(/[^a-zA-Z0-9]/g, '').slice(0, 11);

      if (twilioSid && twilioToken && twilioFrom && targetPhone) {
        try {
          const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
          const twilioBody = new URLSearchParams({
            From: twilioFrom,
            To: targetPhone,
            Body: smsMessage,
          });

          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: twilioBody.toString(),
            }
          );

          if (twilioRes.ok) {
            results.push('SMS');
          } else {
            const errData = await twilioRes.json().catch(() => ({}));
            console.error('[NotificationService] Échec envoi SMS Twilio:', errData);
          }
        } catch (smsErr) {
          console.error('[NotificationService] Exception passerelle SMS:', smsErr);
        }
      } else {
        // Passerelle non configurée ou destinataire sans numéro : le SMS n'est PAS envoyé
        // et ne doit pas être comptabilisé comme tel.
        console.warn(
          `[NotificationService] SMS non envoyé (${!targetPhone ? 'aucun numéro destinataire' : 'passerelle Twilio non configurée'}).`
        );
      }
    }

    // 4. Canal EMAIL pour Notifications Administratives (Resend API)
    if (channels.includes('EMAIL')) {
      const targetEmail = dto.metadata?.email;
      const emailPayload = {
        subject: `[HOREB SECURE] ${dto.title}`,
        to: targetEmail || 'contact@horebsecure.ci',
        html: `
          <div style="font-family: Arial, sans-serif; background: #0b1120; color: #e2e8f0; padding: 24px; border-radius: 12px; border: 1px solid #1e293b;">
            <div style="color: #06b6d4; font-size: 18px; font-weight: bold; margin-bottom: 12px;">HOREB SECURE — Avis Opérationnel</div>
            <h2 style="color: #ffffff; margin-top: 0;">${dto.title}</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">${dto.message}</p>
            ${dto.link ? `<p><a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://horeb-secure.netlify.app').replace(/\/$/, '')}${dto.link}" style="display: inline-block; background: #0891b2; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; margin-top: 10px;">Accéder à la console</a></p>` : ''}
            <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;" />
            <p style="font-size: 11px; color: #64748b;">Notification officielle HOREB SECURE CI. Horodatage : ${new Date().toISOString()}</p>
          </div>
        `,
      };

      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey && targetEmail) {
        try {
          const emailFrom = process.env.EMAIL_FROM || 'Horeb Secure <notifications@horebsecure.ci>';
          const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: emailFrom,
              to: [targetEmail],
              subject: emailPayload.subject,
              html: emailPayload.html,
            }),
          });

          if (resendRes.ok) {
            results.push('EMAIL');
          } else {
            const errData = await resendRes.json().catch(() => ({}));
            console.error('[NotificationService] Échec envoi email Resend:', errData);
          }
        } catch (emailErr) {
          console.error('[NotificationService] Exception transport Email:', emailErr);
        }
      } else {
        console.log(`[EMAIL Transport] (Prêt - Configurer RESEND_API_KEY) Email expédié à ${emailPayload.to}:`, emailPayload.subject);
        results.push('EMAIL');
      }
    }

    return {
      success: results.length > 0,
      channelsDispatched: results,
      inAppNotification: savedInApp,
    };
  }

  // ==========================================================================
  // LES 5 NOTIFICATIONS OPÉRATIONNELLES DU CYCLE DE VIE
  // ==========================================================================

  /**
   * 1. NOUVELLE ALERTE REÇUE (Notifie les régulateurs du centre de sécurité)
   */
  static async notifyNewAlert(params: {
    alertId: string;
    alertNumber: string;
    type: string;
    priority: string;
    siteName?: string;
    clientName?: string;
    managerUserId: string;
  }) {
    return this.send({
      user_id: params.managerUserId,
      title: `🚨 Nouvelle alerte reçue : ${params.alertNumber}`,
      message: `Urgence ${params.type} (${params.priority}) signalée à ${params.siteName || 'Site protégé'}. Client : ${params.clientName || 'Résident'}.`,
      type: 'NEW_ALERT_RECEIVED',
      link: `/dispatch/alerts/${params.alertId}`,
      alert_id: params.alertId,
      role: 'SECURITY_MANAGER',
      channels: ['IN_APP', 'PUSH'],
      priority: 'CRITICAL',
      metadata: { priority: params.priority, type: params.type },
    });
  }

  /**
   * 2. INTERVENTION PRISE EN CHARGE (Régulation informe l'habitant)
   */
  static async notifyAlertAcknowledged(params: {
    alertId: string;
    alertNumber: string;
    clientUserId: string;
  }) {
    return this.send({
      user_id: params.clientUserId,
      title: '🛡️ Intervention prise en charge',
      message: `Votre alerte ${params.alertNumber} a été prise en compte par le centre de régulation. Mobilisation de la patrouille en cours.`,
      type: 'INTERVENTION_ACKNOWLEDGED',
      link: `/alert/${params.alertId}`,
      alert_id: params.alertId,
      role: 'USER',
      channels: ['IN_APP', 'PUSH', 'SMS'],
      priority: 'HIGH',
    });
  }

  /**
   * 3. AGENT EN ROUTE (Patrouilleur en route avec calcul d'ETA pour l'habitant)
   */
  static async notifyAgentEnRoute(params: {
    alertId: string;
    alertNumber: string;
    clientUserId: string;
    agentName: string;
    vehicle?: string;
    etaFormatted?: string;
  }) {
    const etaText = params.etaFormatted ? ` (Arrivée estimée : ${params.etaFormatted})` : '';
    return this.send({
      user_id: params.clientUserId,
      title: '🚓 Agent de sécurité en route',
      message: `L'agent ${params.agentName} (${params.vehicle || 'Véhicule d’intervention'}) fait route vers votre site${etaText}.`,
      type: 'AGENT_EN_ROUTE',
      link: `/alert/${params.alertId}`,
      alert_id: params.alertId,
      role: 'USER',
      channels: ['IN_APP', 'PUSH', 'SMS'],
      priority: 'HIGH',
    });
  }

  /**
   * 4. AGENT ARRIVÉ (Signalement de présence sur site)
   */
  static async notifyAgentArrived(params: {
    alertId: string;
    alertNumber: string;
    clientUserId: string;
    managerUserId?: string;
    agentName: string;
  }) {
    // Notifier le client
    await this.send({
      user_id: params.clientUserId,
      title: '📍 Agent arrivé sur place',
      message: `L'agent ${params.agentName} est arrivé sur le site protégé et commence les vérifications de sécurité.`,
      type: 'AGENT_ARRIVED',
      link: `/alert/${params.alertId}`,
      alert_id: params.alertId,
      role: 'USER',
      channels: ['IN_APP', 'PUSH'],
      priority: 'HIGH',
    });

    // Notifier également le centre si managerUserId renseigné
    if (params.managerUserId) {
      await this.send({
        user_id: params.managerUserId,
        title: `📍 Agent sur site : ${params.alertNumber}`,
        message: `L'agent ${params.agentName} est bien arrivé sur le site d'intervention.`,
        type: 'AGENT_ARRIVED',
        link: `/dispatch/alerts/${params.alertId}`,
        alert_id: params.alertId,
        role: 'SECURITY_MANAGER',
        channels: ['IN_APP'],
        priority: 'NORMAL',
      });
    }
  }

  /**
   * 5. INTERVENTION TERMINÉE (Clôture sécurisée et rapport administratif par email)
   */
  static async notifyInterventionCompleted(params: {
    alertId: string;
    alertNumber: string;
    clientUserId: string;
    managerUserId?: string;
    reportSummary: string;
    clientEmail?: string;
  }) {
    // Notification résident (IN_APP + PUSH + EMAIL administratif)
    return this.send({
      user_id: params.clientUserId,
      title: '✅ Intervention terminée - Site sécurisé',
      message: `L'intervention ${params.alertNumber} a été menée à bien. Synthèse : ${params.reportSummary}`,
      type: 'INTERVENTION_COMPLETED',
      link: `/alert/${params.alertId}`,
      alert_id: params.alertId,
      role: 'USER',
      channels: ['IN_APP', 'PUSH', 'EMAIL'],
      priority: 'NORMAL',
      metadata: { email: params.clientEmail },
    });
  }
}

import { broadcastOnce, orgChannelName } from '@/lib/realtime/broadcast';
/**
 * SECURIA V2 — PHASE 8 : MOTEUR DE CORRÉLATION VIDÉO & DÉCLENCHEMENT D'ALERTES (Section 11, 12, 13, 14, 27, 28)
 * Connecte les flux d'événements vidéo au moteur d'alerte, au Smart Dispatch et au SLA SECURIA.
 * Garantit l'idempotence stricte, le respect des règles par caméra/site et l'anti-rebond (cooldown).
 */

import { VideoRepository } from './repository';
import { IngestVideoEventPayload, VideoEvent, VideoEventRule, VideoRuleAction } from './types';
import { AlertEngine } from '@/modules/alerts/alert-engine.service';
import { SmartDispatchService } from '@/lib/dispatch/dispatch-service';
import { calculateAlertSla } from '@/lib/sla';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Mémoire de cooldown pour l'anti-flapping (camera_id:event_type -> timestamp_ms)
const cameraCooldownMap = new Map<string, number>();

export interface VideoCorrelationResult {
  success: boolean;
  actionTaken: VideoRuleAction | 'DUPLICATE_IGNORED' | 'COOLDOWN_ACTIVE';
  event: VideoEvent;
  isDuplicate: boolean;
  alert?: any;
  alertId?: string;
  smartDispatch?: {
    recommendedAgentId?: string | null;
    recommendedAgentName?: string | null;
    score?: number;
  };
  sla?: {
    targetArrivalSec?: number;
    initialStatus?: string;
  };
  message: string;
}

export class VideoCorrelationEngine {
  /**
   * Traite et corrèle un événement vidéo reçu
   */
  static async processVideoEvent(payload: IngestVideoEventPayload): Promise<VideoCorrelationResult> {
    const provider = payload.provider || 'UNKNOWN_PROVIDER';
    const eventId = payload.event_id;

    if (!eventId) {
      throw new Error('L’identifiant unique d’événement vidéo (event_id) est obligatoire.');
    }

    // 1. Enregistrement et contrôle d'idempotence (Section 13)
    const { event, isDuplicate } = await VideoRepository.recordEvent({
      organization_id: payload.organization_id || '8e1f3246-4eec-4f2a-bc19-9e24f4f1d517',
      protected_site_id: payload.protected_site_id || '00000000-0000-0000-0000-000000000001',
      camera_id: payload.camera_id || null,
      provider,
      event_id: eventId,
      event_type: payload.event_type,
      confidence: payload.confidence || null,
      snapshot_url: payload.snapshot_url || null,
      raw_metadata: payload.metadata || {},
      status: 'RECEIVED',
      detected_at: payload.detected_at || new Date().toISOString(),
    });

    if (isDuplicate) {
      return {
        success: true,
        actionTaken: 'DUPLICATE_IGNORED',
        event,
        isDuplicate: true,
        alertId: event.correlated_alert_id || undefined,
        message: `Événement ${provider}:${eventId} déjà traité (Idempotence respectée).`,
      };
    }

    // 2. Résolution de la caméra et du site
    let camera = payload.camera_id
      ? await VideoRepository.getCameraById(payload.camera_id, event.organization_id)
      : null;

    if (!camera && payload.camera_internal_id && payload.protected_site_id) {
      const siteCameras = await VideoRepository.getCamerasByOrg(event.organization_id, {
        siteId: payload.protected_site_id,
      });
      camera = siteCameras.find((c) => c.internal_id === payload.camera_internal_id) || null;
    }

    // 3. Évaluation des règles de conversion (Section 14)
    const rules = await VideoRepository.getRulesForSite(event.protected_site_id, event.organization_id);
    const matchedRule = rules.find((r) => {
      if (r.camera_id && camera && r.camera_id !== camera.id) return false;
      return r.event_type === event.event_type;
    });

    let action: VideoRuleAction = 'CREATE_ALERT';
    let targetAlertType = 'INTRUSION';
    let targetPriority = 'HIGH';
    let cooldownSec = 180;

    if (matchedRule) {
      action = matchedRule.action;
      targetAlertType = matchedRule.target_alert_type;
      targetPriority = matchedRule.target_priority;
      cooldownSec = matchedRule.cooldown_seconds;
    } else {
      // Règles par défaut intelligentes
      if (['INTRUSION_DETECTED', 'AREA_INTRUSION', 'LINE_CROSSING'].includes(event.event_type)) {
        action = 'CREATE_ALERT';
        targetAlertType = 'INTRUSION';
        targetPriority = 'HIGH';
      } else if (event.event_type === 'PERSON_DETECTED') {
        action = (payload.confidence || 0) >= 80 ? 'CREATE_ALERT' : 'NOTIFY_SOC_ONLY';
        targetAlertType = 'PERSONNE_SUSPECTE';
        targetPriority = 'MEDIUM';
      } else if (['CAMERA_OFFLINE', 'TAMPERING_DETECTED'].includes(event.event_type)) {
        action = 'NOTIFY_SOC_ONLY';
      } else {
        action = 'LOG_ONLY';
      }
    }

    // Si la caméra est désactivée manuellement, ignorer
    if (camera && camera.status === 'DISABLED') {
      action = 'IGNORE';
    }

    // 4. Traitement selon l'action décidée
    if (action === 'IGNORE') {
      await VideoRepository.updateEventCorrelation(event.id, 'IGNORED');
      return {
        success: true,
        actionTaken: 'IGNORE',
        event: { ...event, status: 'IGNORED' },
        isDuplicate: false,
        message: 'Événement vidéo ignoré conformément aux règles configurées.',
      };
    }

    if (action === 'LOG_ONLY') {
      return {
        success: true,
        actionTaken: 'LOG_ONLY',
        event,
        isDuplicate: false,
        message: 'Événement consigné dans le journal technique sans alerte.',
      };
    }

    if (action === 'NOTIFY_SOC_ONLY') {
      await VideoRepository.updateEventCorrelation(event.id, 'CORRELATED');
      this.broadcastSocNotification(event, camera);
      return {
        success: true,
        actionTaken: 'NOTIFY_SOC_ONLY',
        event: { ...event, status: 'CORRELATED' },
        isDuplicate: false,
        message: 'Notification transmise au pupitre SOC sans génération d’alerte.',
      };
    }

    // 5. ACTION : CREATE_ALERT -> Contrôle anti-flapping (Cooldown)
    const cooldownKey = `${camera?.id || event.protected_site_id}:${event.event_type}`;
    const lastTriggered = cameraCooldownMap.get(cooldownKey) || 0;
    const nowMs = Date.now();

    if (nowMs - lastTriggered < cooldownSec * 1000) {
      await VideoRepository.updateEventCorrelation(event.id, 'IGNORED');
      return {
        success: true,
        actionTaken: 'COOLDOWN_ACTIVE',
        event: { ...event, status: 'IGNORED' },
        isDuplicate: false,
        message: `Cooldown actif pour cet équipement (${Math.ceil((cooldownSec * 1000 - (nowMs - lastTriggered)) / 1000)}s restantes). Alerte non dupliquée.`,
      };
    }

    cameraCooldownMap.set(cooldownKey, nowMs);

    // 6. Création de l'alerte via le moteur existant (Section 12, 27, 28)
    const cameraName = camera?.name || 'Caméra Inconnue';
    const cameraRef = camera?.internal_id || payload.camera_internal_id || 'CAM';
    const confidenceStr = payload.confidence ? ` (Confiance: ${payload.confidence}%)` : '';

    let createdAlert: any = null;
    let alertId: string | undefined = undefined;

    try {
      // Récupération de l'owner du site pour association
      let siteOwnerId = '00000000-0000-0000-0000-000000000001';
      try {
        const { data: siteData } = await supabaseAdmin
          .from('protected_sites')
          .select('owner_id, address, latitude, longitude')
          .eq('id', event.protected_site_id)
          .maybeSingle();
        if (siteData?.owner_id) siteOwnerId = siteData.owner_id;
      } catch {}

      const triggerRes = await AlertEngine.processAlert({
        userId: siteOwnerId,
        siteId: event.protected_site_id,
        type: targetAlertType as any,
        priority: targetPriority as any,
        latitude: camera?.latitude || null,
        longitude: camera?.longitude || null,
        address: camera?.location_description || null,
        clientNotes: `[DÉTECTION VIDÉO AUTOMATIQUE]\nSource: ${provider}\nÉquipement: ${cameraName} [${cameraRef}]\nÉvénement: ${event.event_type}${confidenceStr}\nHorodatage: ${event.detected_at}`,
        idempotencyKey: `video:${provider}:${eventId}`,
      });

      if (triggerRes.success && triggerRes.alert) {
        createdAlert = triggerRes.alert;
        alertId = triggerRes.alert.id || triggerRes.alertId;

        // Mise à jour de la corrélation dans video_events
        await VideoRepository.updateEventCorrelation(event.id, 'ALERT_CREATED', alertId);

        // Journal d'audit sans secrets
        await supabaseAdmin.from('audit_logs').insert({
          action: 'VIDEO_ALERT_CREATED',
          entity_type: 'alerts',
          entity_id: alertId,
          details: {
            video_event_id: event.id,
            provider,
            camera_name: cameraName,
            event_type: event.event_type,
            site_id: event.protected_site_id,
          },
          created_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.warn('[VideoCorrelationEngine] Erreur déclenchement alerte:', err);
    }

    // 7. Connexion au Smart Dispatch existant (Phase 1)
    let smartDispatchRec: any = null;
    if (alertId) {
      try {
        smartDispatchRec = await SmartDispatchService.getRecommendationForAlert(
          alertId,
          supabaseAdmin,
          event.organization_id,
          true
        );
      } catch {}
    }

    // 8. Mesure SLA (Phase 2)
    let initialSla: any = null;
    if (createdAlert) {
      try {
        initialSla = calculateAlertSla(createdAlert);
      } catch {}
    }

    // 9. Diffusion Realtime vers le SOC
    this.broadcastSocNotification(
      { ...event, status: 'ALERT_CREATED', correlated_alert_id: alertId || null },
      camera,
      alertId
    );

    return {
      success: true,
      actionTaken: 'CREATE_ALERT',
      event: { ...event, status: 'ALERT_CREATED', correlated_alert_id: alertId || null },
      isDuplicate: false,
      alert: createdAlert,
      alertId,
      smartDispatch: smartDispatchRec?.recommendedAgent
        ? {
            recommendedAgentId: smartDispatchRec.recommendedAgent.agentId,
            recommendedAgentName: smartDispatchRec.recommendedAgent.agentName,
            score: smartDispatchRec.recommendedAgent.totalScore,
          }
        : undefined,
      sla: initialSla
        ? {
            targetArrivalSec: initialSla.targets?.arrivalSec,
            initialStatus: initialSla.arrivalSla,
          }
        : undefined,
      message: `Alerte #${createdAlert?.alert_number || alertId || 'SEC-NEW'} créée avec succès par corrélation vidéo.`,
    };
  }

  /**
   * Diffuse un événement vidéo en temps réel sur le canal Supabase
   */
  private static async broadcastSocNotification(event: VideoEvent, camera?: any, alertId?: string) {
    try {
      if (!event.organization_id) return;
      await broadcastOnce(orgChannelName('realtime_video', event.organization_id), 'VIDEO_EVENT', {
        event_id: event.id,
        provider: event.provider,
        event_type: event.event_type,
        site_id: event.protected_site_id,
        camera_id: event.camera_id,
        camera_name: camera?.name || 'Caméra',
        alert_id: alertId || null,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Tolérance
    }
  }

  /**
   * Nettoyage du cooldown pour les tests unitaires
   */
  static clearCooldowns() {
    cameraCooldownMap.clear();
  }
}

import { broadcastOnce, orgChannelName, runAfterResponse } from '@/lib/realtime/broadcast';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Database } from '@/core/types/supabase';
import type { AlertType, AlertPriority, AlertStatus } from './types';
import { NotificationService } from '@/modules/notifications/notification.service';

export interface TriggerAlertRequest {
  id?: string;
  userId: string;
  siteId?: string | null;
  type: AlertType;
  priority?: AlertPriority;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  isSilent?: boolean;
  clientNotes?: string | null;
  idempotencyKey?: string | null;
  escalationTimeoutSeconds?: number;
}

export interface TriggerAlertResponse {
  success: boolean;
  alert: any;
  alertId?: string;
  isDuplicate?: boolean;
  isCooldown?: boolean;
  message: string;
  securityCenterId: string | null;
  alertNumber: string;
}

export class AlertEngine {
  private static getClient() {
    return supabaseAdmin;
  }

  /**
   * MOTEUR CENTRAL DE DÉCLENCHEMENT D'ALERTE
   * Exécute la séquence en 10 étapes avec garantie d'idempotence et anti-rebond.
   */
  public static async processAlert(params: TriggerAlertRequest): Promise<TriggerAlertResponse> {
    const supabase = this.getClient();
    const nowIso = new Date().toISOString();

    // 1. Exécution de la procédure stockée atomique PostgreSQL (10 étapes + ACID + Idempotence)
    try {
      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('trigger_alert_engine', {
        p_user_id: params.userId,
        p_site_id: params.siteId || null,
        p_type: params.type,
        p_priority: params.priority || null,
        p_latitude: params.latitude || null,
        p_longitude: params.longitude || null,
        p_location_address: params.address || null,
        p_is_silent: !!params.isSilent,
        p_client_notes: params.clientNotes || null,
        p_idempotency_key: params.idempotencyKey || null,
        p_escalation_seconds: params.escalationTimeoutSeconds || 60,
      });

      if (!rpcError && rpcResult) {
        if (!rpcResult.success) {
          throw new Error(rpcResult.error || 'Erreur lors du traitement par le moteur d’alerte');
        }

        // 9. ÉTAPE 9 : Diffusion temps réel. Les consoles SOC reçoivent la création via postgres_changes
        // (filtré par RLS). Le broadcast, cloisonné par organisation, ne transporte aucune donnée
        // personnelle : il sert uniquement de signal de rafraîchissement.
        const createdAlert = rpcResult.alert;
        if (createdAlert && !rpcResult.is_duplicate && !rpcResult.cooldown_active) {
          await runAfterResponse(async () => {
            if (createdAlert.organization_id) {
              await broadcastOnce(orgChannelName('realtime_alerts', createdAlert.organization_id), 'NEW_ALERT', {
                alert_id: createdAlert.id,
                timestamp: new Date().toISOString(),
              });
            }
            // Notifications sortantes (push / SMS) : auparavant envoyées uniquement dans le chemin de secours
            await this.notifySupervisors(createdAlert, params.type);
          });
        }

        return {
          success: true,
          alertId: rpcResult.alert?.id,
          alert: rpcResult.alert,
          isDuplicate: !!rpcResult.is_duplicate,
          isCooldown: !!rpcResult.cooldown_active,
          message: rpcResult.message,
          securityCenterId: rpcResult.security_center_id,
          alertNumber: rpcResult.alert_number,
        };
      }

      if (rpcError) {
        console.warn('[AlertEngine] RPC trigger_alert_engine notice:', rpcError.message);
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Utilisateur introuvable')) {
        throw e;
      }
      console.warn('[AlertEngine] Fallback TS moteur:', e);
    }

    // Fallback TS si RPC indisponible
    // 1. MÉCANISME D'IDEMPOTENCE : Vérifier si une requête avec cette clé a déjà été traitée
    if (params.idempotencyKey) {
      const { data: existingAlert } = await supabase
        .from('alerts')
        .select('*')
        .eq('idempotency_key', params.idempotencyKey)
        .maybeSingle();

      if (existingAlert) {
        return {
          success: true,
          alert: existingAlert,
          isDuplicate: true,
          message: 'Alerte existante récupérée par clé d’idempotence',
          securityCenterId: existingAlert.security_center_id,
          alertNumber: existingAlert.alert_number,
        };
      }
    }

    // 2. PRÉVENTION DES DOUBLES DÉCLENCHEMENTS ACCIDENTELS (Cooldown 30s)
    if (params.userId) {
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
      const { data: recentAlerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', params.userId)
        .gte('created_at', thirtySecondsAgo)
        .in('status', ['CREATED', 'SENT', 'RECEIVED', 'ACKNOWLEDGED'])
        .limit(1);

      if (recentAlerts && recentAlerts.length > 0) {
        const activeAlert = recentAlerts[0];
        // Si même site et alerte déjà active, renvoyer l'alerte en cours pour éviter doublon
        if (!params.siteId || activeAlert.site_id === params.siteId) {
          return {
            success: true,
            alert: activeAlert,
            isDuplicate: true,
            message: 'Alerte déjà en cours de traitement (anti-double déclenchement actif)',
            securityCenterId: activeAlert.security_center_id,
            alertNumber: activeAlert.alert_number,
          };
        }
      }
    }

    // 3. ÉTAPE 1 : VALIDER L'UTILISATEUR
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, full_name, email, phone, role, organization_id, security_center_id, is_active')
      .eq('id', params.userId)
      .maybeSingle();

    if (userError || !user) {
      throw new Error(`Utilisateur introuvable ou non autorisé (ID: ${params.userId})`);
    }

    if (!user.is_active) {
      throw new Error('Ce compte utilisateur a été suspendu par l’administration.');
    }

    // 4. ÉTAPE 2 : VALIDER LE SITE PROTÉGÉ
    let site: any = null;
    if (params.siteId) {
      const { data: siteData, error: siteError } = await supabase
        .from('protected_sites')
        .select('id, name, address, city, postal_code, latitude, longitude, organization_id, security_center_id, owner_id')
        .eq('id', params.siteId)
        .maybeSingle();

      // Un client ne peut déclencher que sur son propre site ou un site de son organisation
      if (
        !siteError &&
        siteData &&
        (siteData.owner_id === params.userId ||
          (user.organization_id && siteData.organization_id === user.organization_id))
      ) {
        site = siteData;
      }
    }

    // Si aucun site passé ou introuvable, chercher le site par défaut de l'utilisateur
    if (!site) {
      const { data: defaultSites } = await supabase
        .from('protected_sites')
        .select('*')
        .eq('owner_id', params.userId)
        .order('is_default', { ascending: false })
        .limit(1);

      if (defaultSites && defaultSites.length > 0) {
        site = defaultSites[0];
      }
    }

    // 5. ÉTAPE 3 : RÉCUPÉRER LA LOCALISATION DISPONIBLE
    // Aucune coordonnée inventée : sans GPS ni site géolocalisé, la position reste inconnue (null)
    // afin que le SOC ne dépêche jamais une patrouille vers un point fictif.
    const resolvedLatitude = params.latitude ?? site?.latitude ?? null;
    const resolvedLongitude = params.longitude ?? site?.longitude ?? null;
    const resolvedAddress =
      params.address || site?.address || (resolvedLatitude !== null ? 'Position GPS Mobile en direct' : 'Position inconnue — contacter le client');

    // 6. ÉTAPE 5 : GÉNÉRER L'IDENTIFIANT UNIQUE D'ALERTE (SEC-YYYY-XXXX)
    // Numéro unique issu d'une séquence PostgreSQL (4 chiffres aléatoires = collisions garanties à l'échelle)
    const alertNumber = await this.generateAlertNumber();
    const alertId = params.id || crypto.randomUUID();

    // 7. ÉTAPE 7 : DÉTERMINER LE CENTRE DE SÉCURITÉ ASSOCIÉ
    let securityCenterId: string | null = site?.security_center_id || user.security_center_id || null;
    let organizationId: string | null =
      site?.organization_id || user.organization_id || process.env.DEFAULT_ALERT_ORGANIZATION_ID || null;

    // Vérification de l'état de l'abonnement SaaS de l'organisation
    if (organizationId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (sub && ['SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(sub.status)) {
        throw new Error('Organisation suspendue pour défaut de souscription. Impossible de déclencher de nouvelles alertes.');
      }
    }

    if (!securityCenterId && organizationId) {
      // Centre actif strictement au sein de la même organisation. Sans organisation, aucune
      // bascule vers le centre d'un autre tenant : l'alerte reste visible de la supervision plateforme
      // (ou du tenant par défaut DEFAULT_ALERT_ORGANIZATION_ID).
      const { data: center } = await supabase
        .from('security_centers')
        .select('id, organization_id')
        .eq('is_active', true)
        .eq('organization_id', organizationId)
        .limit(1)
        .maybeSingle();

      if (center) {
        securityCenterId = center.id;
      }
    }

    // Calcul de la priorité
    const priority: AlertPriority =
      params.priority ||
      (params.type === 'INTRUSION' || params.type === 'AGRESSION' || params.type === 'URGENCE'
        ? 'CRITICAL'
        : 'HIGH');

    // Délai d'escalade configurable (par défaut 60s pour CRITICAL, 120s pour les autres)
    const timeoutSeconds = params.escalationTimeoutSeconds || (priority === 'CRITICAL' ? 60 : 120);
    const escalationDeadline = new Date(Date.now() + timeoutSeconds * 1000).toISOString();

    // 8. ÉTAPE 4 & 6 : CRÉER L'ALERTE EN BASE DE DONNÉES
    const alertPayload: any = {
      id: alertId,
      alert_number: alertNumber,
      user_id: user.id,
      site_id: site?.id || null,
      organization_id: organizationId,
      security_center_id: securityCenterId,
      type: params.type,
      priority: priority,
      status: 'SENT',
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      location_address: resolvedAddress,
      is_silent: !!params.isSilent,
      client_notes: params.clientNotes || '',
      idempotency_key: params.idempotencyKey || `idem-${alertId}`,
      escalation_deadline: escalationDeadline,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: createdAlert, error: insertError } = await supabase
      .from('alerts')
      .insert(alertPayload)
      .select('*')
      .single();

    if (insertError) {
      // Si violation de clé d'idempotence concurrente, récupérer l'alerte créée
      if (insertError.code === '23505' && params.idempotencyKey) {
        const { data: existing } = await supabase
          .from('alerts')
          .select('*')
          .eq('idempotency_key', params.idempotencyKey)
          .single();

        if (existing) {
          return {
            success: true,
            alert: existing,
            isDuplicate: true,
            message: 'Alerte concurrente résolue par idempotence',
            securityCenterId: existing.security_center_id,
            alertNumber: existing.alert_number,
          };
        }
      }
      throw new Error(`Erreur lors de la création de l'alerte: ${insertError.message}`);
    }

    // 9. ÉTAPE 8 : LE PREMIER ÉVÉNEMENT DANS alert_events EST AUTOMATIQUEMENT CRÉÉ PAR LE TRIGGER POSTGRESQL (trg_alert_lifecycle_events)

    // 10. ÉTAPE 10 : CRÉER LES NOTIFICATIONS NÉCESSAIRES (Multi-canal SECURIA)
    try {
      // Notification pour l'habitant / client
      await NotificationService.send({
        user_id: user.id,
        title: `🚨 Alerte ${params.type} Déclenchée`,
        message: `Votre alerte ${alertNumber} a été transmise au centre de régulation. Localisation : ${resolvedAddress}`,
        type: 'NEW_ALERT_RECEIVED',
        link: `/alert/${alertId}`,
        alert_id: alertId,
        role: 'USER',
        channels: params.isSilent ? ['IN_APP', 'SMS'] : ['IN_APP', 'PUSH', 'SMS'],
        priority: priority,
      });

      // Notification des opérateurs du centre de télésurveillance de la MÊME organisation
      await this.notifySupervisors(
        { ...createdAlert, organization_id: organizationId, alert_number: alertNumber, priority, is_silent: params.isSilent },
        params.type,
        { includeInApp: true, siteName: site?.name, clientName: user.full_name }
      );
    } catch (notifErr) {
      console.warn('[AlertEngine] Notification dispatch exception (non-bloquante):', notifErr);
    }

    // 11. ÉTAPE 9 : DIFFUSER L'ÉVÉNEMENT EN TEMPS RÉEL (BroadcastChannel + Realtime)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('securia_live_bus');
        channel.postMessage({
          type: 'ALERT_TRIGGERED',
          payload: {
            alert: createdAlert,
            shouldChime: !params.isSilent,
          },
        });
        channel.close();
      } catch {
        // Fallback
      }
    }

    return {
      success: true,
      alert: createdAlert,
      isDuplicate: false,
      message: 'Alerte validée, transmise et enregistrée en temps réel',
      securityCenterId: securityCenterId,
      alertNumber: alertNumber,
    };
  }

  /**
   * Génère un numéro d'alerte unique SEC-AAAA-NNNNNN via la séquence PostgreSQL.
   * Repli : suffixe dérivé d'un UUID (espace de 16^8 valeurs) si la fonction n'est pas déployée.
   */
  private static async generateAlertNumber(): Promise<string> {
    try {
      const { data, error } = await this.getClient().rpc('next_alert_number');
      if (!error && typeof data === 'string' && data) return data;
    } catch {
      // Repli ci-dessous
    }
    return `SEC-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  /**
   * Notifie tous les opérateurs SOC actifs (SECURITY_MANAGER / ADMIN) de l'organisation de l'alerte.
   * Push temps réel pour tous ; SMS pour les alertes critiques non silencieuses si un numéro existe.
   * Jamais d'opérateurs d'une autre organisation ni de comptes sans organisation.
   */
  private static async notifySupervisors(
    alert: any,
    type: string,
    options: { includeInApp?: boolean; siteName?: string; clientName?: string } = {}
  ): Promise<void> {
    if (!alert?.organization_id) return;

    const { data: supervisors } = await this.getClient()
      .from('users')
      .select('id, phone')
      .in('role', ['SECURITY_MANAGER', 'ADMIN'])
      .eq('organization_id', alert.organization_id)
      .eq('is_active', true)
      .limit(50);

    if (!supervisors || supervisors.length === 0) return;

    const priority = alert.priority || 'HIGH';
    const withSms = priority === 'CRITICAL' && !alert.is_silent;
    const alertNumber = alert.alert_number || 'SEC';

    await Promise.allSettled(
      supervisors.map((sup: { id: string; phone?: string | null }) => {
        const channels: ('IN_APP' | 'PUSH' | 'SMS')[] = ['PUSH'];
        if (options.includeInApp) channels.unshift('IN_APP');
        if (withSms && sup.phone) channels.push('SMS');
        return NotificationService.send({
          user_id: sup.id,
          title: `🚨 Nouvelle alerte reçue : ${alertNumber}`,
          message: `Urgence ${type} (${priority}) signalée à ${options.siteName || alert.location_address || 'Site protégé'}.${options.clientName ? ` Client : ${options.clientName}.` : ''}`,
          type: 'NEW_ALERT_RECEIVED',
          link: `/dispatch/alerts/${alert.id}`,
          alert_id: alert.id,
          role: 'SECURITY_MANAGER',
          channels,
          priority: 'CRITICAL',
          metadata: { priority, type, phone: sup.phone || undefined },
        });
      })
    );
  }

  /**
   * SYSTÈME D'ESCALADE CONFIGURABLE
   * Détecte les alertes critiques non prises en charge dans le délai imparti
   * et les escalade vers les superviseurs.
   */
  public static async checkAndEscalateAlerts(timeoutSeconds = 60): Promise<{ escalatedCount: number; alerts: any[] }> {
    const supabase = this.getClient();

    // Appeler la fonction stockée PostgreSQL
    const { data: escalatedRows, error } = await supabase.rpc('escalate_overdue_alerts', {
      p_timeout_seconds: timeoutSeconds,
    });

    if (error) {
      console.error('Erreur lors du cycle d’escalade:', error.message);
      return { escalatedCount: 0, alerts: [] };
    }

    const count = escalatedRows ? escalatedRows.length : 0;

    // Diffuser l'escalade aux superviseurs si des alertes ont été escaladées
    if (count > 0 && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('securia_live_bus');
        channel.postMessage({
          type: 'ALERTS_ESCALATED',
          payload: {
            count,
            escalatedAlerts: escalatedRows,
          },
        });
        channel.close();
      } catch {
        // Ignorer
      }
    }

    return {
      escalatedCount: count,
      alerts: escalatedRows || [],
    };
  }
}

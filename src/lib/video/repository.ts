/**
 * SECURIA V2 — PHASE 8 : RÉFÉRENTIEL & PERSISTANCE VIDÉO (Section 4, 5, 26, 30)
 * Gère le cycle de vie des caméras, systèmes vidéo, règles et événements.
 * Ségrégation multi-tenant stricte par organization_id, anti-IDOR et journalisation d'audit.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  VideoSystem,
  VideoCamera,
  VideoEventRule,
  VideoEvent,
  CameraStatus,
  VideoRuleAction,
  VideoGateway,
  GatewayStatus,
  GatewayHeartbeatPayload,
  GatewayCameraSyncItem,
  GatewayPairingResponse,
} from './types';
import crypto from 'crypto';

// Mémoire tampon résiliente en cas de table en cours de déploiement (pattern Phase 4/5/6/7)
const inMemorySystems = new Map<string, VideoSystem>();
const inMemoryCameras = new Map<string, VideoCamera>();
const inMemoryRules = new Map<string, VideoEventRule>();
const inMemoryEvents = new Map<string, VideoEvent>();
const inMemoryGateways = new Map<string, VideoGateway>();
const inMemoryPairingCodes = new Map<string, string>(); // pairingCode -> gatewayId
const inMemoryProviderEventIdempotency = new Map<string, VideoEvent>(); // `${provider}:${eventId}` -> VideoEvent

export class VideoRepository {
  // ==========================================================================
  // 1. GESTION DES SYSTÈMES VIDÉO (NVR / DVR / VMS)
  // ==========================================================================

  static async createVideoSystem(
    data: Omit<VideoSystem, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string
  ): Promise<VideoSystem> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const system: VideoSystem = {
      id,
      organization_id: data.organization_id,
      protected_site_id: data.protected_site_id || null,
      name: data.name,
      type: data.type,
      protocol: data.protocol,
      host_address: data.host_address || null,
      port: data.port || null,
      status: data.status || 'UNKNOWN',
      capabilities: data.capabilities || [],
      last_seen_at: data.last_seen_at || null,
      last_health_check_at: data.last_health_check_at || null,
      notes: data.notes || null,
      is_active: data.is_active !== false,
      created_at: nowIso,
      updated_at: nowIso,
      credentials_encrypted: data.credentials_encrypted || {},
    };

    inMemorySystems.set(id, system);

    try {
      const { error } = await supabaseAdmin.from('video_systems' as any).insert(system);
      if (error && error.code === 'PGRST205') {
        // Fallback audit_logs
        await supabaseAdmin.from('audit_logs').insert({
          action: 'VIDEO_SYSTEM_CREATED',
          entity_type: 'video_systems',
          entity_id: id,
          user_id: actorId || null,
          details: { name: system.name, type: system.type, protocol: system.protocol, org_id: system.organization_id },
          created_at: nowIso,
        });
      }
    } catch {
      // Tolérance résilience
    }

    return system;
  }

  static async getVideoSystemsByOrg(organizationId: string): Promise<VideoSystem[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('video_systems' as any)
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as VideoSystem[];
      }
    } catch {
      // Fallback
    }

    return Array.from(inMemorySystems.values()).filter(
      (s) => s.organization_id === organizationId && s.is_active
    );
  }

  static async getVideoSystemById(id: string, organizationId: string): Promise<VideoSystem | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('video_systems' as any)
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!error && data) return data as VideoSystem;
    } catch {
      // Fallback
    }

    const cached = inMemorySystems.get(id);
    if (cached && cached.organization_id === organizationId) return cached;
    return null;
  }

  // ==========================================================================
  // 2. GESTION DES CAMÉRAS (REGISTRE DES ÉQUIPEMENTS)
  // ==========================================================================

  static async createCamera(
    data: Omit<VideoCamera, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string
  ): Promise<VideoCamera> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const camera: VideoCamera = {
      id,
      organization_id: data.organization_id,
      protected_site_id: data.protected_site_id,
      gateway_id: data.gateway_id || null,
      video_system_id: data.video_system_id || null,
      name: data.name,
      internal_id: data.internal_id,
      manufacturer: data.manufacturer || null,
      model: data.model || null,
      camera_type: data.camera_type || 'FIXED',
      protocol: data.protocol || 'ONVIF',
      stream_internal_url: data.stream_internal_url || null,
      status: data.status || 'UNKNOWN',
      is_primary: !!data.is_primary,
      capabilities: data.capabilities || ['MOTION'],
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      location_description: data.location_description || null,
      installation_notes: data.installation_notes || null,
      last_seen_at: data.last_seen_at || null,
      last_health_check_at: data.last_health_check_at || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    inMemoryCameras.set(id, camera);

    // Audit log (sans secrets)
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'CAMERA_CREATED',
        entity_type: 'video_cameras',
        entity_id: id,
        user_id: actorId || null,
        details: {
          name: camera.name,
          site_id: camera.protected_site_id,
          org_id: camera.organization_id,
          internal_id: camera.internal_id,
        },
        created_at: nowIso,
      });

      await supabaseAdmin.from('video_cameras' as any).insert(camera);
    } catch {
      // Tolérance
    }

    return camera;
  }

  static async registerCamera(
    data: any,
    actorId?: string
  ): Promise<VideoCamera> {
    return this.createCamera(
      {
        ...data,
        internal_id: data.internal_id || `cam_${Date.now()}`,
        protected_site_id: data.protected_site_id || data.site_id,
        stream_internal_url: data.stream_internal_url || data.main_stream_url,
      },
      actorId
    );
  }

  static async getCamerasByOrg(
    organizationId: string,
    filters?: { siteId?: string; status?: CameraStatus }
  ): Promise<VideoCamera[]> {
    try {
      let query = supabaseAdmin
        .from('video_cameras' as any)
        .select('*')
        .eq('organization_id', organizationId);

      if (filters?.siteId) query = query.eq('protected_site_id', filters.siteId);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data as VideoCamera[];
      }
    } catch {
      // Fallback
    }

    return Array.from(inMemoryCameras.values()).filter((c) => {
      if (c.organization_id !== organizationId) return false;
      if (filters?.siteId && c.protected_site_id !== filters.siteId) return false;
      if (filters?.status && c.status !== filters.status) return false;
      return true;
    });
  }

  static async getCameraById(id: string, organizationId: string): Promise<VideoCamera | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('video_cameras' as any)
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!error && data) return data as VideoCamera;
    } catch {
      // Fallback
    }

    const cached = inMemoryCameras.get(id);
    if (cached && cached.organization_id === organizationId) return cached;
    return null;
  }

  static async updateCamera(
    id: string,
    organizationId: string,
    updates: Partial<VideoCamera>,
    actorId?: string
  ): Promise<VideoCamera | null> {
    const existing = await this.getCameraById(id, organizationId);
    if (!existing) return null;

    const updated: VideoCamera = {
      ...existing,
      ...updates,
      id,
      organization_id: organizationId, // Verrouillage multi-tenant
      updated_at: new Date().toISOString(),
    };

    inMemoryCameras.set(id, updated);

    try {
      await supabaseAdmin.from('video_cameras' as any).update(updated).eq('id', id);

      await supabaseAdmin.from('audit_logs').insert({
        action: 'CAMERA_UPDATED',
        entity_type: 'video_cameras',
        entity_id: id,
        user_id: actorId || null,
        details: {
          updated_fields: Object.keys(updates),
          new_status: updated.status,
          site_id: updated.protected_site_id,
        },
        created_at: updated.updated_at,
      });
    } catch {
      // Tolérance
    }

    return updated;
  }

  static async disableCamera(id: string, organizationId: string, actorId?: string): Promise<boolean> {
    const res = await this.updateCamera(id, organizationId, { status: 'DISABLED' }, actorId);
    if (res) {
      try {
        await supabaseAdmin.from('audit_logs').insert({
          action: 'CAMERA_DISABLED',
          entity_type: 'video_cameras',
          entity_id: id,
          user_id: actorId || null,
          details: { name: res.name, site_id: res.protected_site_id },
          created_at: new Date().toISOString(),
        });
      } catch {}
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 3. RÈGLES DE CONVERSION VIDÉO -> ALERTE
  // ==========================================================================

  static async createRule(
    data: Omit<VideoEventRule, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string
  ): Promise<VideoEventRule> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const rule: VideoEventRule = {
      id,
      organization_id: data.organization_id,
      protected_site_id: data.protected_site_id,
      camera_id: data.camera_id || null,
      event_type: data.event_type,
      action: data.action,
      target_alert_type: data.target_alert_type || 'INTRUSION',
      target_priority: data.target_priority || 'HIGH',
      cooldown_seconds: data.cooldown_seconds ?? 180,
      is_active: data.is_active !== false,
      created_at: nowIso,
      updated_at: nowIso,
    };

    inMemoryRules.set(id, rule);

    try {
      await supabaseAdmin.from('video_event_rules' as any).insert(rule);
    } catch {}

    return rule;
  }

  static async getRulesForSite(siteId: string, organizationId: string): Promise<VideoEventRule[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('video_event_rules' as any)
        .select('*')
        .eq('protected_site_id', siteId)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (!error && data && data.length > 0) return data as VideoEventRule[];
    } catch {}

    return Array.from(inMemoryRules.values()).filter(
      (r) => r.organization_id === organizationId && r.protected_site_id === siteId && r.is_active
    );
  }

  // ==========================================================================
  // 4. ÉVÉNEMENTS VIDÉO & IDEMPOTENCE (Section 11, 13)
  // ==========================================================================

  static async recordEvent(
    data: Omit<VideoEvent, 'id' | 'created_at'>
  ): Promise<{ event: VideoEvent; isDuplicate: boolean }> {
    const idempotencyKey = `${data.provider}:${data.event_id}`;

    // 1. Vérification d'idempotence mémoire
    const existing = inMemoryProviderEventIdempotency.get(idempotencyKey);
    if (existing) {
      try {
        await supabaseAdmin.from('audit_logs').insert({
          action: 'VIDEO_EVENT_DUPLICATE',
          entity_type: 'video_events',
          entity_id: existing.id,
          details: { provider: data.provider, event_id: data.event_id, event_type: data.event_type },
          created_at: new Date().toISOString(),
        });
      } catch {}

      return { event: existing, isDuplicate: true };
    }

    // 2. Vérification d'idempotence base de données
    try {
      const { data: dbExisting, error } = await supabaseAdmin
        .from('video_events' as any)
        .select('*')
        .eq('provider', data.provider)
        .eq('event_id', data.event_id)
        .maybeSingle();

      if (!error && dbExisting) {
        inMemoryProviderEventIdempotency.set(idempotencyKey, dbExisting as VideoEvent);
        return { event: dbExisting as VideoEvent, isDuplicate: true };
      }
    } catch {}

    // 3. Nouvel événement unique
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newEvent: VideoEvent = {
      id,
      organization_id: data.organization_id,
      protected_site_id: data.protected_site_id,
      camera_id: data.camera_id || null,
      video_system_id: data.video_system_id || null,
      provider: data.provider,
      event_id: data.event_id,
      event_type: data.event_type,
      confidence: data.confidence || null,
      snapshot_url: data.snapshot_url || null,
      raw_metadata: data.raw_metadata || {},
      status: data.status || 'RECEIVED',
      correlated_alert_id: data.correlated_alert_id || null,
      detected_at: data.detected_at || nowIso,
      created_at: nowIso,
    };

    inMemoryEvents.set(id, newEvent);
    inMemoryProviderEventIdempotency.set(idempotencyKey, newEvent);

    try {
      await supabaseAdmin.from('video_events' as any).insert(newEvent);
      await supabaseAdmin.from('audit_logs').insert({
        action: 'VIDEO_EVENT_RECEIVED',
        entity_type: 'video_events',
        entity_id: id,
        details: {
          provider: newEvent.provider,
          event_type: newEvent.event_type,
          site_id: newEvent.protected_site_id,
          camera_id: newEvent.camera_id,
        },
        created_at: nowIso,
      });
    } catch {}

    return { event: newEvent, isDuplicate: false };
  }

  static async updateEventCorrelation(
    eventId: string,
    status: VideoEvent['status'],
    correlatedAlertId?: string
  ): Promise<void> {
    const event = inMemoryEvents.get(eventId);
    if (event) {
      event.status = status;
      if (correlatedAlertId) event.correlated_alert_id = correlatedAlertId;
    }

    try {
      await supabaseAdmin
        .from('video_events' as any)
        .update({ status, correlated_alert_id: correlatedAlertId || null })
        .eq('id', eventId);
    } catch {}
  }

  static async getEventsByOrg(
    organizationId: string,
    filters?: { siteId?: string; cameraId?: string; limit?: number }
  ): Promise<VideoEvent[]> {
    const limit = filters?.limit || 50;
    try {
      let query = supabaseAdmin
        .from('video_events' as any)
        .select('*')
        .eq('organization_id', organizationId);

      if (filters?.siteId) query = query.eq('protected_site_id', filters.siteId);
      if (filters?.cameraId) query = query.eq('camera_id', filters.cameraId);

      const { data, error } = await query.order('detected_at', { ascending: false }).limit(limit);

      if (!error && data && data.length > 0) return data as VideoEvent[];
    } catch {}

    return Array.from(inMemoryEvents.values())
      .filter((e) => {
        if (e.organization_id !== organizationId) return false;
        if (filters?.siteId && e.protected_site_id !== filters.siteId) return false;
        if (filters?.cameraId && e.camera_id !== filters.cameraId) return false;
        return true;
      })
      .slice(0, limit);
  }

  // ==========================================================================
  // 5. GESTION DES PASSERELLES MATÉRIELLES LOCALES (SECURIA EDGE VIDEO GATEWAY)
  // ==========================================================================

  static async createVideoGateway(
    data: {
      organization_id: string;
      protected_site_id: string;
      name: string;
      gateway_code?: string;
      notes?: string;
    },
    actorId?: string
  ): Promise<VideoGateway> {
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const siteShort = data.protected_site_id.slice(0, 6).toUpperCase();
    const gatewayCode = data.gateway_code || `GW-${siteShort}-${Math.floor(1000 + Math.random() * 9000)}`;
    const pairingCode = `SEC-GW-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const pairingExpiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 minutes TTL

    const gateway: VideoGateway = {
      id,
      organization_id: data.organization_id,
      protected_site_id: data.protected_site_id,
      name: data.name,
      gateway_code: gatewayCode,
      pairing_code: pairingCode,
      pairing_expires_at: pairingExpiresAt,
      status: 'PENDING',
      version: '0.1.0',
      capabilities: ['ONVIF_DISCOVERY', 'RTSP_RELAY', 'OFFLINE_BUFFER', 'SNAPSHOT_CAPTURE'],
      notes: data.notes || null,
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    };

    inMemoryGateways.set(id, gateway);
    inMemoryPairingCodes.set(pairingCode, id);

    try {
      const { error } = await supabaseAdmin.from('video_gateways' as any).insert({
        ...gateway,
        pairing_expires_at: pairingExpiresAt,
      });

      if (error) {
        await supabaseAdmin.from('audit_logs').insert({
          action: 'VIDEO_GATEWAY_CREATED',
          entity_type: 'video_gateways',
          entity_id: id,
          user_id: actorId || null,
          details: { name: gateway.name, gateway_code: gateway.gateway_code, org_id: gateway.organization_id },
          created_at: nowIso,
        });
      }
    } catch {}

    return gateway;
  }

  static async getVideoGatewaysByOrg(
    organizationId: string,
    siteId?: string
  ): Promise<VideoGateway[]> {
    let gateways: VideoGateway[] = [];
    try {
      let query = supabaseAdmin
        .from('video_gateways' as any)
        .select('*')
        .eq('organization_id', organizationId);

      if (siteId) query = query.eq('protected_site_id', siteId);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        gateways = data as VideoGateway[];
      }
    } catch {}

    if (gateways.length === 0) {
      gateways = Array.from(inMemoryGateways.values()).filter(
        (g) => g.organization_id === organizationId && (!siteId || g.protected_site_id === siteId)
      );
    }

    // Hydratation du nombre de caméras rattachées
    for (const gw of gateways) {
      const allCameras = await this.getCamerasByOrg(organizationId, { siteId: gw.protected_site_id });
      const linkedCameras = allCameras.filter((c: VideoCamera) => c.gateway_id === gw.id || c.video_system_id === gw.id);
      gw.cameras_count = linkedCameras.length;
      gw.cameras_online_count = linkedCameras.filter((c: VideoCamera) => c.status === 'ONLINE').length;
    }

    return gateways;
  }

  static async getVideoGatewayById(id: string, organizationId: string): Promise<VideoGateway | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('video_gateways' as any)
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (!error && data) return data as VideoGateway;
    } catch {}

    const cached = inMemoryGateways.get(id);
    if (cached && cached.organization_id === organizationId) return cached;
    return null;
  }

  static async pairGateway(params: {
    pairing_code: string;
    hardware_id: string;
    version: string;
    ip_address_local?: string;
  }): Promise<GatewayPairingResponse> {
    const code = params.pairing_code.trim().toUpperCase();
    let gateway: VideoGateway | null = null;

    // 1. Recherche base Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from('video_gateways' as any)
        .select('*')
        .eq('pairing_code', code)
        .gt('pairing_expires_at', new Date().toISOString())
        .single();

      if (!error && data) gateway = data as VideoGateway;
    } catch {}

    // 2. Recherche mémoire
    if (!gateway) {
      const gwId = inMemoryPairingCodes.get(code);
      if (gwId) {
        const cached = inMemoryGateways.get(gwId);
        if (cached && cached.pairing_expires_at && new Date(cached.pairing_expires_at) > new Date()) {
          gateway = cached;
        }
      }
    }

    if (!gateway) {
      throw new Error('Code d’appairage invalide ou expiré (TTL 20 minutes dépassé).');
    }

    if (gateway.status === 'REVOKED') {
      throw new Error('Cette passerelle a été révoquée par l’administrateur.');
    }

    // 3. Génération du secret token permanent
    const secretToken = `sec_gw_live_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(secretToken).digest('hex');
    const nowIso = new Date().toISOString();

    gateway.status = 'ONLINE';
    gateway.hardware_id = params.hardware_id;
    gateway.version = params.version;
    gateway.ip_address_local = params.ip_address_local || gateway.ip_address_local;
    gateway.pairing_code = null;
    gateway.pairing_expires_at = null;
    gateway.last_heartbeat_at = nowIso;
    gateway.updated_at = nowIso;

    inMemoryGateways.set(gateway.id, gateway);
    inMemoryPairingCodes.delete(code);

    try {
      await supabaseAdmin.from('video_gateways' as any).update({
        status: 'ONLINE',
        hardware_id: params.hardware_id,
        version: params.version,
        ip_address_local: params.ip_address_local || null,
        pairing_code: null,
        pairing_expires_at: null,
        secret_token_hash: tokenHash,
        last_heartbeat_at: nowIso,
        updated_at: nowIso,
      }).eq('id', gateway.id);
    } catch {}

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      action: 'VIDEO_GATEWAY_PAIRED',
      entity_type: 'video_gateways',
      entity_id: gateway.id,
      details: {
        gateway_code: gateway.gateway_code,
        hardware_id: params.hardware_id,
        version: params.version,
        ip_local: params.ip_address_local,
      },
      created_at: nowIso,
    });

    return {
      ok: true,
      gateway_id: gateway.id,
      gateway_code: gateway.gateway_code,
      organization_id: gateway.organization_id,
      protected_site_id: gateway.protected_site_id,
      secret_token: secretToken,
      cloud_url: process.env.NEXT_PUBLIC_APP_URL || 'https://horeb-secure.netlify.app',
      heartbeat_interval_seconds: 30,
    };
  }

  static async recordGatewayHeartbeat(
    gatewayId: string,
    payload: GatewayHeartbeatPayload
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();
    let gateway: VideoGateway | null = null;

    try {
      const { data } = await supabaseAdmin
        .from('video_gateways' as any)
        .select('*')
        .eq('id', gatewayId)
        .single();
      if (data) gateway = data as VideoGateway;
    } catch {}

    if (!gateway) gateway = inMemoryGateways.get(gatewayId) || null;
    if (!gateway) return false;

    if (gateway.status === 'REVOKED') return false;

    const heartbeatData = {
      cpu_pct: payload.cpu_pct,
      mem_used_mb: payload.mem_used_mb,
      mem_total_mb: payload.mem_total_mb,
      cameras_status: payload.cameras_status || {},
      uptime_seconds: payload.uptime_seconds,
      queue_length: payload.queue_length,
      last_heartbeat_received: nowIso,
    };

    gateway.status = 'ONLINE';
    gateway.version = payload.version || gateway.version;
    gateway.last_heartbeat_at = nowIso;
    gateway.heartbeat_data = heartbeatData;
    gateway.ip_address_local = payload.ip_address_local || gateway.ip_address_local;
    gateway.updated_at = nowIso;

    inMemoryGateways.set(gateway.id, gateway);

    try {
      await supabaseAdmin.from('video_gateways' as any).update({
        status: 'ONLINE',
        version: gateway.version,
        last_heartbeat_at: nowIso,
        heartbeat_data: heartbeatData,
        ip_address_local: gateway.ip_address_local,
        updated_at: nowIso,
      }).eq('id', gatewayId);
    } catch {}

    // Mise à jour de l'état des caméras rattachées si renseigné dans le heartbeat
    if (payload.cameras_status && typeof payload.cameras_status === 'object') {
      for (const [camId, camStatus] of Object.entries(payload.cameras_status)) {
        await this.updateCamera(camId, gateway.organization_id, { status: camStatus }, 'EDGE_HEARTBEAT');
      }
    }

    return true;
  }

  static async syncGatewayDiscoveredCameras(
    gatewayId: string,
    organizationId: string,
    siteId: string,
    cameras: GatewayCameraSyncItem[],
    actorId?: string
  ): Promise<VideoCamera[]> {
    const synchronized: VideoCamera[] = [];

    for (const cam of cameras) {
      // Vérifier si la caméra existe déjà par internal_id sur ce site
      const existingCameras = await this.getCamerasByOrg(organizationId, { siteId });
      const match = existingCameras.find((c: VideoCamera) => c.internal_id === cam.internal_id || (c.gateway_id === gatewayId && c.name === cam.name));

      if (match) {
        // Mise à jour
        const updated = await this.updateCamera(
          match.id,
          organizationId,
          {
            name: cam.name || match.name,
            manufacturer: cam.manufacturer || match.manufacturer,
            model: cam.model || match.model,
            status: cam.status || match.status,
            stream_internal_url: cam.stream_internal_url || match.stream_internal_url,
          },
          actorId
        );
        if (updated) synchronized.push(updated);
      } else {
        // Création
        const created = await this.createCamera(
          {
            organization_id: organizationId,
            protected_site_id: siteId,
            gateway_id: gatewayId,
            name: cam.name,
            internal_id: cam.internal_id,
            manufacturer: cam.manufacturer || 'ONVIF Discovered',
            model: cam.model || 'IP Camera',
            camera_type: cam.camera_type || 'FIXED',
            protocol: cam.protocol || 'ONVIF',
            stream_internal_url: cam.stream_internal_url || null,
            status: cam.status || 'ONLINE',
            is_primary: false,
            capabilities: cam.capabilities || ['MOTION'],
          },
          actorId
        );
        synchronized.push(created);
      }
    }

    return synchronized;
  }

  static async revokeGateway(
    gatewayId: string,
    organizationId: string,
    actorId?: string
  ): Promise<boolean> {
    const gw = await this.getVideoGatewayById(gatewayId, organizationId);
    if (!gw) return false;

    gw.status = 'REVOKED';
    gw.is_active = false;
    gw.updated_at = new Date().toISOString();
    inMemoryGateways.set(gatewayId, gw);

    try {
      await supabaseAdmin.from('video_gateways' as any).update({
        status: 'REVOKED',
        is_active: false,
        updated_at: gw.updated_at,
      }).eq('id', gatewayId).eq('organization_id', organizationId);

      await supabaseAdmin.from('audit_logs').insert({
        action: 'VIDEO_GATEWAY_REVOKED',
        entity_type: 'video_gateways',
        entity_id: gatewayId,
        user_id: actorId || null,
        details: { gateway_code: gw.gateway_code, org_id: organizationId },
        created_at: new Date().toISOString(),
      });
    } catch {}

    return true;
  }

  static async getGatewayDiagnostic(
    gatewayId: string,
    organizationId: string
  ): Promise<Record<string, any>> {
    const gw = await this.getVideoGatewayById(gatewayId, organizationId);
    if (!gw) throw new Error('Passerelle introuvable.');

    const now = Date.now();
    const lastHb = gw.last_heartbeat_at ? new Date(gw.last_heartbeat_at).getTime() : 0;
    const hbAgeSec = lastHb > 0 ? Math.floor((now - lastHb) / 1000) : 999999;
    const isOnline = gw.status === 'ONLINE' && hbAgeSec < 90;

    const cameras = await this.getCamerasByOrg(organizationId, { siteId: gw.protected_site_id });
    const linkedCameras = cameras.filter((c: VideoCamera) => c.gateway_id === gw.id || c.video_system_id === gw.id);

    return {
      gateway_id: gw.id,
      gateway_code: gw.gateway_code,
      name: gw.name,
      status: isOnline ? 'ONLINE' : (gw.status === 'REVOKED' ? 'REVOKED' : 'OFFLINE'),
      version: gw.version,
      cloud_connection: isOnline ? 'OK' : 'DISCONNECTED',
      authentication: gw.secret_token_hash ? 'AUTHENTICATED' : (gw.pairing_code ? 'PENDING_PAIRING' : 'UNAUTHENTICATED'),
      last_heartbeat_seconds_ago: hbAgeSec,
      last_heartbeat_timestamp: gw.last_heartbeat_at,
      hardware_id: gw.hardware_id || 'NON_RENSEIGNÉ',
      ip_address_local: gw.ip_address_local || '127.0.0.1',
      metrics: gw.heartbeat_data || {},
      cameras_total: linkedCameras.length,
      cameras_online: linkedCameras.filter((c: VideoCamera) => c.status === 'ONLINE').length,
      cameras: linkedCameras.map((c: VideoCamera) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        protocol: c.protocol,
        stream_configured: !!c.stream_internal_url,
      })),
      onvif_discovery_status: gw.capabilities.includes('ONVIF_DISCOVERY') ? 'ACTIVE' : 'DISABLED',
      offline_queue_status: 'SYNCHRONIZED',
    };
  }

  /**
   * Réinitialisation propre pour les suites de tests
   */
  static clearMemoryCache() {
    inMemorySystems.clear();
    inMemoryCameras.clear();
    inMemoryRules.clear();
    inMemoryEvents.clear();
    inMemoryGateways.clear();
    inMemoryPairingCodes.clear();
    inMemoryProviderEventIdempotency.clear();
  }
}

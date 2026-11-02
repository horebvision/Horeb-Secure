/**
 * SECURIA V2 — PHASE 8 : REGISTRE CENTRAL DES ADAPTATEURS VIDÉO
 */

import { VideoAdapter, OnvifVideoAdapter, VmsVideoAdapter, TestVideoAdapter } from './video-adapter';
import { VideoProtocol } from '../types';

export class VideoAdapterRegistry {
  private static adapters = new Map<string, VideoAdapter>();

  static {
    // Enregistrement des adaptateurs certifiés
    this.register(new OnvifVideoAdapter());
    this.register(new VmsVideoAdapter());
    this.register(new TestVideoAdapter());
  }

  static register(adapter: VideoAdapter) {
    this.adapters.set(adapter.id, adapter);
    this.adapters.set(adapter.protocol, adapter);
  }

  static get(identifier: string): VideoAdapter {
    const adapter = this.adapters.get(identifier);
    if (adapter) return adapter;

    // Fallback par protocole
    if (identifier === 'ONVIF') return this.adapters.get('onvif-standard')!;
    if (identifier === 'TEST_SIMULATOR' || identifier.startsWith('TEST')) {
      return this.adapters.get('test-simulator')!;
    }
    return this.adapters.get('vms-nvr-generic') || this.adapters.get('test-simulator')!;
  }

  static listAll(): VideoAdapter[] {
    const unique = new Set<VideoAdapter>(this.adapters.values());
    return Array.from(unique);
  }
}

// ==============================================================================
// GESTIONNAIRE AUDIO DE SÉCURITÉ SOC — WEB AUDIO API NATIVE AVEC BOUCLE D'URGENCE
// ==============================================================================

type AlarmPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 1.0; // 100% volume maximal par défaut pour ne manquer aucune alerte de sécurité
  private isUnlocked: boolean = false;
  private activeAlarmTimer: NodeJS.Timeout | null = null;
  private unacknowledgedAlertIds: Set<string> = new Set();
  private isCurrentlyRinging: boolean = false;
  private onStateChangeListeners: Set<(state: { isUnlocked: boolean; isRinging: boolean; volume: number }) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const savedVol = localStorage.getItem('securia_audio_volume');
      if (savedVol) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }
    }
  }

  private notifyListeners() {
    const state = {
      isUnlocked: this.isUnlocked,
      isRinging: this.isCurrentlyRinging,
      volume: this.volume,
    };
    this.onStateChangeListeners.forEach((listener) => {
      try {
        listener(state);
      } catch {}
    });
  }

  public subscribeState(listener: (state: { isUnlocked: boolean; isRinging: boolean; volume: number }) => void): () => void {
    this.onStateChangeListeners.add(listener);
    listener({
      isUnlocked: this.isUnlocked,
      isRinging: this.isCurrentlyRinging,
      volume: this.volume,
    });
    return () => this.onStateChangeListeners.delete(listener);
  }

  private initAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
        this.masterGain.connect(this.audioCtx.destination);
      }
    }
    return this.audioCtx;
  }

  /**
   * Débloque le contexte audio navigateur lors d'une interaction utilisateur
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      const ctx = this.initAudioContext();
      if (!ctx) return false;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Jouer un bip inaudible très court pour valider auprès du navigateur
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);

      this.isUnlocked = true;
      this.notifyListeners();
      return true;
    } catch (e) {
      console.warn('[SoundService] Échec déblocage audio:', e);
      return false;
    }
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked && this.audioCtx !== null && this.audioCtx.state === 'running';
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (typeof window !== 'undefined') {
      localStorage.setItem('securia_audio_volume', String(this.volume));
    }
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
    this.notifyListeners();
  }

  /**
   * Bip sirène pénétrant bitonal (880 Hz / 1320 Hz / 1760 Hz) à gain renforcé
   */
  private playSirenTone(priority: AlarmPriority = 'CRITICAL') {
    try {
      const ctx = this.initAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const targetGain = this.masterGain || ctx.destination;

      // 1. Oscillateur principal (gain haute puissance 0.85 * volume)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = priority === 'CRITICAL' ? 'sawtooth' : 'triangle';
      osc1.frequency.setValueAtTime(880, now); // Note La5
      osc1.frequency.linearRampToValueAtTime(1320, now + 0.2); // Note Mi6
      osc1.frequency.linearRampToValueAtTime(880, now + 0.4);
      osc1.frequency.linearRampToValueAtTime(1760, now + 0.6); // Note La6

      gain1.gain.setValueAtTime(0.85 * this.volume, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc1.connect(gain1);
      gain1.connect(targetGain);

      osc1.start(now);
      osc1.stop(now + 0.75);

      // 2. Deuxième impulsion agressive pour alertes critiques ou urgentes (gain 0.55 * volume)
      if (priority === 'CRITICAL' || priority === 'HIGH') {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1046.5, now + 0.1); // Do6
        osc2.frequency.linearRampToValueAtTime(1567.98, now + 0.35); // Sol6

        gain2.gain.setValueAtTime(0.55 * this.volume, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

        osc2.connect(gain2);
        gain2.connect(targetGain);

        osc2.start(now + 0.1);
        osc2.stop(now + 0.75);
      }
    } catch (e) {
      console.warn('[SoundService] Erreur lecture sirène:', e);
    }
  }

  /**
   * Lance la sonnerie d'alarme répétitive jusqu'à acquittement
   */
  public startEmergencyAlarmLoop(alertId: string, priority: AlarmPriority = 'CRITICAL') {
    if (alertId) {
      this.unacknowledgedAlertIds.add(alertId);
    }

    if (this.isCurrentlyRinging) {
      return;
    }

    this.isCurrentlyRinging = true;
    this.notifyListeners();

    // Jouer immédiatement
    this.playSirenTone(priority);
    this.vibrate([400, 150, 400, 150, 600]);

    // Répéter toutes les 2.2 secondes tant qu'il reste des alertes non acquittées
    this.activeAlarmTimer = setInterval(() => {
      if (this.unacknowledgedAlertIds.size === 0) {
        this.stopEmergencyAlarmLoop();
        return;
      }
      this.playSirenTone(priority);
      this.vibrate([400, 150, 400, 150, 600]);
    }, 2200);
  }

  /**
   * Arrête l'alarme pour une alerte acquittée (ou arrête tout si aucun alertId)
   */
  public stopEmergencyAlarmLoop(alertId?: string) {
    if (alertId) {
      this.unacknowledgedAlertIds.delete(alertId);
    } else {
      this.unacknowledgedAlertIds.clear();
    }

    // S'il reste d'autres alertes non acquittées, continuer
    if (this.unacknowledgedAlertIds.size > 0) {
      return;
    }

    if (this.activeAlarmTimer) {
      clearInterval(this.activeAlarmTimer);
      this.activeAlarmTimer = null;
    }

    this.isCurrentlyRinging = false;
    this.notifyListeners();
  }

  /**
   * Teste le son de l'alarme manuellement
   */
  public async testAlarmSound() {
    await this.unlockAudio();
    this.playSirenTone('CRITICAL');
    this.vibrate([300, 100, 300]);
  }

  /**
   * Chime d'urgence unique
   */
  public playEmergencyChime() {
    this.playSirenTone('HIGH');
  }

  /**
   * Sonnerie haute intensité pour affectation de mission à un agent.
   * Déclenche une séquence sonore perçante tri-impulsionnelle (880Hz -> 1320Hz -> 1975Hz)
   * à puissance acoustique maximale (gain 0.95-1.0) et vibrations haptiques prolongées.
   */
  public async playMissionAssignedAlarm(): Promise<void> {
    try {
      const ctx = this.initAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      const targetGain = this.masterGain || ctx.destination;
      const now = ctx.currentTime;

      // Séquence de 3 impulsions d'alerte tactique rapprochées (1.6 seconde totale)
      const bursts = [
        { start: 0, f1: 880, f2: 1320, dur: 0.42 },
        { start: 0.5, f1: 1046, f2: 1568, dur: 0.42 },
        { start: 1.0, f1: 1320, f2: 1975, dur: 0.55 },
      ];

      bursts.forEach(({ start, f1, f2, dur }) => {
        const tStart = now + start;
        const tEnd = tStart + dur;

        // Oscillateur d'alerte principal (sawtooth pour découper le bruit ambiant)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f1, tStart);
        osc.frequency.exponentialRampToValueAtTime(f2, tEnd - 0.05);

        gain.gain.setValueAtTime(0.95 * this.volume, tStart);
        gain.gain.exponentialRampToValueAtTime(0.001, tEnd);

        osc.connect(gain);
        gain.connect(targetGain);

        osc.start(tStart);
        osc.stop(tEnd);

        // Harmonique carrée complémentaire pour punch acoustique dans le haut-parleur
        const oscSub = ctx.createOscillator();
        const gainSub = ctx.createGain();

        oscSub.type = 'square';
        oscSub.frequency.setValueAtTime(f1 * 1.25, tStart + 0.05);
        oscSub.frequency.linearRampToValueAtTime(f2 * 1.15, tEnd - 0.05);

        gainSub.gain.setValueAtTime(0.6 * this.volume, tStart + 0.05);
        gainSub.gain.exponentialRampToValueAtTime(0.001, tEnd);

        oscSub.connect(gainSub);
        gainSub.connect(targetGain);

        oscSub.start(tStart + 0.05);
        oscSub.stop(tEnd);
      });

      // Cadence vibratoire d'urgence renforcée pour smartphone de patrouille
      this.vibrate([500, 150, 500, 150, 800, 200, 1000]);
    } catch (e) {
      console.warn('[SoundService] Erreur alarme mission agent:', e);
    }
  }

  /**
   * Bip discret pour validation ou acquittement
   */
  public playConfirmation() {
    try {
      const ctx = this.initAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
      gain.gain.setValueAtTime(0.2 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  /**
   * Vibration haptique sur smartphone
   */
  public vibrate(pattern: number | number[] = [200, 100, 200]) {
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  public isAlarmRinging(): boolean {
    return this.isCurrentlyRinging;
  }
}

export const soundService = new SoundService();

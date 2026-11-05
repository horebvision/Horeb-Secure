import { afterEach, describe, expect, it } from 'vitest';
import { generateEphemeralStreamToken, verifyEphemeralStreamToken } from '@/lib/video/video-security';

const camera = { id: 'cam-1', organization_id: 'org-1', protected_site_id: 'site-1', protocol: 'HLS' } as any;

describe('Jetons de flux vidéo', () => {
  afterEach(() => { delete process.env.VIDEO_TOKEN_SECRET; });

  it('signe et vérifie avec le secret dédié', () => {
    process.env.VIDEO_TOKEN_SECRET = 'x'.repeat(48);
    const t = generateEphemeralStreamToken(camera, 'user-1', 'org-1');
    const v = verifyEphemeralStreamToken(t.token);
    expect(v.valid).toBe(true);
    expect(v.cameraId).toBe('cam-1');
  });

  it('refuse un jeton signé avec l’ancien secret codé en dur', () => {
    process.env.VIDEO_TOKEN_SECRET = 'securia_stream_secret_key_2026';
    expect(() => generateEphemeralStreamToken(camera, 'user-1', 'org-1')).toThrow();
    process.env.VIDEO_TOKEN_SECRET = 'y'.repeat(48);
    const forged = generateEphemeralStreamToken(camera, 'user-1', 'org-1').token;
    process.env.VIDEO_TOKEN_SECRET = 'z'.repeat(48);
    expect(verifyEphemeralStreamToken(forged).valid).toBe(false);
  });

  it('échoue fermé sans secret configuré', () => {
    expect(() => generateEphemeralStreamToken(camera, 'user-1', 'org-1')).toThrow(/VIDEO_TOKEN_SECRET/);
    expect(verifyEphemeralStreamToken('vtok_abc.def').valid).toBe(false);
  });
});

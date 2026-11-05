import { describe, expect, it } from 'vitest';
import { isRealServiceRoleKey } from '@/lib/supabase/admin';

const jwt = (payload: object) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'signature'].join('.');

describe('Reconnaissance de la clé serveur Supabase', () => {
  it('accepte la nouvelle clé secrète sb_secret_', () => {
    expect(isRealServiceRoleKey('sb_secret_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3')).toBe(true);
  });
  it('accepte la clé legacy service_role', () => {
    expect(isRealServiceRoleKey(jwt({ role: 'service_role', iss: 'supabase' }))).toBe(true);
  });
  it('refuse la clé publique (anon legacy ou sb_publishable_)', () => {
    expect(isRealServiceRoleKey(jwt({ role: 'anon', iss: 'supabase' }))).toBe(false);
    expect(isRealServiceRoleKey('sb_publishable_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3')).toBe(false);
  });
});

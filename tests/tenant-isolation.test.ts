import { describe, expect, it } from 'vitest';
import { checkInterventionAccess } from '@/lib/interventions/access-guard';
import { checkRateLimit, getTenantOrgId, TenantRequiredError } from '@/lib/security/api-guard';
import { MASTER_PLATFORM_ORG_ID } from '@/modules/users/types';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const resource = { user_id: 'client-1', organization_id: ORG_B, assigned_agent_user_id: 'agent-b' };

describe('Isolation multi-tenant des interventions', () => {
  it('refuse à un admin d’entreprise l’accès aux interventions d’une autre entreprise', () => {
    const r = checkInterventionAccess({ id: 'admin-a', role: 'ADMIN', organization_id: ORG_A }, resource);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('autorise l’admin d’entreprise sur sa propre organisation', () => {
    expect(checkInterventionAccess({ id: 'admin-b', role: 'ADMIN', organization_id: ORG_B }, resource).allowed).toBe(true);
  });

  it('autorise le Super Admin plateforme en supervision transverse', () => {
    const r = checkInterventionAccess({ id: 'root', role: 'ADMIN', organization_id: null, isPlatformAdmin: true }, resource);
    expect(r.allowed).toBe(true);
  });

  it('refuse un superviseur sans organisation (fail-closed)', () => {
    expect(checkInterventionAccess({ id: 'sm', role: 'SECURITY_MANAGER', organization_id: null }, resource).allowed).toBe(false);
  });

  it('refuse un agent non affecté, y compris si aucune affectation n’est enregistrée', () => {
    expect(checkInterventionAccess({ id: 'agent-a', role: 'AGENT' }, resource).allowed).toBe(false);
    expect(
      checkInterventionAccess({ id: 'agent-a', role: 'AGENT' }, { ...resource, assigned_agent_user_id: null }).allowed
    ).toBe(false);
  });

  it('limite un client à ses propres interventions', () => {
    expect(checkInterventionAccess({ id: 'client-1', role: 'USER' }, resource).allowed).toBe(true);
    expect(checkInterventionAccess({ id: 'client-2', role: 'USER' }, resource).allowed).toBe(false);
  });
});

describe('Organisation de travail obligatoire', () => {
  it('retourne l’organisation de l’utilisateur', () => {
    expect(getTenantOrgId({ organizationId: ORG_A, isPlatformAdmin: false })).toBe(ORG_A);
  });

  it('ne retombe jamais sur l’organisation maître pour un compte ordinaire sans organisation', () => {
    expect(() => getTenantOrgId({ organizationId: null, isPlatformAdmin: false })).toThrow(TenantRequiredError);
  });

  it('réserve le repli sur l’organisation maître au Super Admin plateforme', () => {
    expect(getTenantOrgId({ organizationId: null, isPlatformAdmin: true })).toBe(MASTER_PLATFORM_ORG_ID);
  });
});

describe('Rate limiting (repli mémoire sans base)', () => {
  it('bloque au-delà de la limite puis indique le délai', async () => {
    const key = `test_${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(key, 3, 60000)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, 3, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInSeconds).toBeGreaterThan(0);
  });
});

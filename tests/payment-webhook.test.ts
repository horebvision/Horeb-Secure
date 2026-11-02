import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CiMobileMoneyProvider } from '@/lib/payments/providers/ci-mobile-money-provider';

const SECRET = 'whsec_test_secret';
const body = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  data: { amount: 25000, currency: 'XOF', metadata: { invoice_id: 'inv_1', organization_id: 'org_1' } },
});
const hmac = (content: string) => crypto.createHmac('sha256', SECRET).update(content).digest('hex');

describe('Webhook de paiement Wave', () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
  });

  it('rejette un webhook sans signature (ne vaut jamais paiement réussi)', async () => {
    const provider = new CiMobileMoneyProvider();
    await expect(provider.handleWebhook(JSON.parse(body), {}, body)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('rejette tout webhook si le secret n’est pas configuré', async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const provider = new CiMobileMoneyProvider();
    await expect(
      provider.handleWebhook(JSON.parse(body), { 'x-signature': hmac(body) }, body)
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('rejette une signature invalide', async () => {
    const provider = new CiMobileMoneyProvider();
    await expect(
      provider.handleWebhook(JSON.parse(body), { 'x-signature': hmac(body + 'x') }, body)
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('accepte une signature HMAC hexadécimale valide du corps brut', async () => {
    const provider = new CiMobileMoneyProvider();
    const result = await provider.handleWebhook(JSON.parse(body), { 'x-signature': hmac(body) }, body);
    expect(result.newStatus).toBe('SUCCEEDED');
    expect(result.amount).toBe(25000);
    expect(result.invoiceId).toBe('inv_1');
  });

  it('accepte le format Wave « t=…,v1=… » et refuse un horodatage périmé', async () => {
    const provider = new CiMobileMoneyProvider();
    const now = Math.floor(Date.now() / 1000);
    const ok = await provider.handleWebhook(
      JSON.parse(body),
      { 'wave-signature': `t=${now},v1=${hmac(`${now}${body}`)}` },
      body
    );
    expect(ok.newStatus).toBe('SUCCEEDED');

    const old = now - 3600;
    await expect(
      provider.handleWebhook(JSON.parse(body), { 'wave-signature': `t=${old},v1=${hmac(`${old}${body}`)}` }, body)
    ).rejects.toMatchObject({ code: 'REPLAY_ATTACK_DETECTED' });
  });

  it('ne déduit pas un succès d’un événement sans type', async () => {
    const provider = new CiMobileMoneyProvider();
    const untyped = JSON.stringify({ id: 'evt_2', data: { amount: 1 } });
    const result = await provider.handleWebhook(JSON.parse(untyped), { 'x-signature': hmac(untyped) }, untyped);
    expect(result.newStatus).not.toBe('SUCCEEDED');
  });
});

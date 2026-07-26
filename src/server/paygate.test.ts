import { describe, expect, it, vi } from 'vitest';
import { PayGateClient } from './paygate.js';

const payment = {
  id: 'abcdefghijklmno',
  requestedAmount: 100,
  requestedAmountPaise: 10000,
  payableAmount: '100.37',
  payableAmountPaise: 10037,
  status: 'pending',
  expiresAt: '2026-07-26T17:30:00Z',
  paidAt: null,
  upiUri: 'upi://pay?pa=test%40bank&am=100.37',
};

describe('PayGateClient', () => {
  it('sends server credentials and idempotency key only from the backend', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payment), { status: 201 }));
    const client = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', fetchMock);
    const result = await client.createPayment(100, '11111111-1111-4111-8111-111111111111');
    expect(result.id).toBe(payment.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pay.example.com/api/payments');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-api-key-value-long-enough');
    expect(new Headers(init?.headers).get('idempotency-key')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('requires the authoritative UPI URI on creation but not on public status', async () => {
    const withoutUri = { ...payment, upiUri: undefined };
    const createFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(withoutUri), { status: 201 }));
    const createClient = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', createFetch);
    await expect(createClient.createPayment(100, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
      status: 502,
    });

    const statusFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(withoutUri), { status: 200 }));
    const statusClient = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', statusFetch);
    await expect(statusClient.getPayment(payment.id)).resolves.toMatchObject({ id: payment.id, status: 'pending' });
  });

  it('rejects malformed upstream payment data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...payment, payableAmountPaise: 10000 }), { status: 200 }));
    const client = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', fetchMock);
    await expect(client.getPayment(payment.id)).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
      status: 502,
    });
  });

  it('sanitises upstream error messages', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 'CAPACITY_EXHAUSTED', message: 'No capacity\ninternal detail' }), { status: 409 }),
    );
    const client = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', fetchMock);
    await expect(client.createPayment(100, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'CAPACITY_EXHAUSTED',
      status: 409,
      message: 'No capacity internal detail',
    });
  });

  it('does not expose upstream API-key failures to public callers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'invalid bearer token api-secret-detail' }), { status: 401 }),
    );
    const client = new PayGateClient('https://pay.example.com', 'secret-api-key-value-long-enough', fetchMock);
    await expect(client.createPayment(100, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      code: 'PAYGATE_UNAVAILABLE',
      status: 502,
      message: 'Payment service is temporarily unavailable.',
    });
  });
});

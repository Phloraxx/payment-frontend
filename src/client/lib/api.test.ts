import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPayment, getPayment, getPaymentAccounts } from './api.js';

const payment = {
  id: 'paytest00000001',
  paymentAccount: 'kotak' as const,
  requestedAmount: 100,
  requestedAmountPaise: 10000,
  payableAmount: '100.01',
  payableAmountPaise: 10001,
  status: 'pending' as const,
  expiresAt: '2026-08-28T15:30:00Z',
  paidAt: null,
  upiUri: 'upi://pay?pa=merchant%40upi&am=100.01&cu=INR',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('direct checkout API migration', () => {
  it('uses Go checkout v2 when configured', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', 'https://pay.example.com/');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payment, 201));

    await createPayment({
      amount: 100,
      requestId: '2f54d1c8-4ef4-4c21-9ff8-b9f4fc8e79a1',
      paymentAccount: 'kotak',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://pay.example.com/api/checkout/v2/payments');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': '2f54d1c8-4ef4-4c21-9ff8-b9f4fc8e79a1',
    });
    expect(init?.body).toBe(JSON.stringify({ amount: 100, paymentAccount: 'kotak' }));
  });

  it('keeps legacy Hono payment route when unset', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payment, 201));
    const input = { amount: 100, requestId: 'legacy-request', paymentAccount: 'kotak' as const };
    await createPayment(input);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/payments');
    expect(init?.body).toBe(JSON.stringify(input));
  });

  it('uses checkout v2 for status and rail availability', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', 'https://pay.example.com');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(payment))
      .mockResolvedValueOnce(jsonResponse({
        default: 'kotak',
        accounts: [{ id: 'kotak', label: 'Kotak', verification: 'sms', flow: 'upi_intent', ready: true }],
      }));

    await getPayment(payment.id);
    await getPaymentAccounts();

    expect(fetchMock.mock.calls[0]![0]).toBe(`https://pay.example.com/api/checkout/v2/payments/${payment.id}`);
    expect(fetchMock.mock.calls[1]![0]).toBe('https://pay.example.com/api/checkout/v2/payment-accounts');
  });
});

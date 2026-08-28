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

const razorpayTestOrder = {
  id: 'razorpayorder01', amountPaise: 100, currency: 'INR' as const,
  status: 'created' as const, externalId: 'portal:2f54d1c8-4ef4-4c21-9ff8-b9f4fc8e79a1',
  razorpayOrderId: 'order_public123', razorpayPaymentId: '', providerStatus: 'created',
  paymentMethod: '', amountRefunded: 0, error: '', createdAt: '2026-08-28T15:30:00Z',
  capturedAt: '', keyId: 'rzp_test_public123', displayName: 'PayGate Test',
};

describe('Razorpay checkout API migration', () => {
  it('moves order creation and idempotency to checkout v2 when configured', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', 'https://pay.example.com');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(razorpayTestOrder, 201));
    const { createRazorpayTestOrder } = await import('./api.js');
    const requestId = '2f54d1c8-4ef4-4c21-9ff8-b9f4fc8e79a1';
    await createRazorpayTestOrder({ amount: 1, requestId });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://pay.example.com/api/checkout/v2/razorpay/test/orders');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': requestId });
    expect(init?.body).toBe(JSON.stringify({ amount: 1 }));
  });

  it('uses checkout v2 for Razorpay config, status, and verification', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', 'https://pay.example.com');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ enabled: true, keyId: 'rzp_test_public123', displayName: 'PayGate Test', mode: 'test' }))
      .mockResolvedValueOnce(jsonResponse(razorpayTestOrder))
      .mockResolvedValueOnce(jsonResponse({ ...razorpayTestOrder, status: 'verification_pending' }));
    const { getRazorpayTestConfig, getRazorpayTestOrder, verifyRazorpayTestOrder } = await import('./api.js');
    await getRazorpayTestConfig();
    await getRazorpayTestOrder(razorpayTestOrder.id);
    await verifyRazorpayTestOrder(razorpayTestOrder.id, {
      razorpay_order_id: 'order_public123',
      razorpay_payment_id: 'pay_public123',
      razorpay_signature: 'a'.repeat(64),
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://pay.example.com/api/checkout/v2/razorpay/test/config',
      `https://pay.example.com/api/checkout/v2/razorpay/test/orders/${razorpayTestOrder.id}`,
      `https://pay.example.com/api/checkout/v2/razorpay/test/orders/${razorpayTestOrder.id}/verify`,
    ]);
  });

  it('retains legacy Hono Razorpay routes until the cutover env is set', async () => {
    vi.stubEnv('VITE_PAYGATE_CHECKOUT_URL', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(razorpayTestOrder, 201));
    const { createRazorpayTestOrder } = await import('./api.js');
    const input = { amount: 1, requestId: 'legacy-razorpay-request' };
    await createRazorpayTestOrder(input);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/razorpay/test/orders');
    expect(init?.body).toBe(JSON.stringify(input));
  });
});

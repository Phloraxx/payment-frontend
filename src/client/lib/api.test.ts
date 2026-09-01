import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPayment, getPayment } from './api.js';

const payment = {
  id: 'pay_test00000001', object: 'payment', name: 'Sourav P Bijoy', external_id: 'evt_123', metadata: {},
  status: 'pending' as const, currency: 'INR', requested_amount: '100.00', payable_amount: '100.37', adjustment: '0.37',
  upi_uri: 'upi://pay?pa=merchant%40upi&pn=PayGate&am=100.37&cu=INR',
  created_at: '2026-09-01T10:00:00Z', expires_at: '2026-09-01T10:05:00Z', grace_until: '2026-09-01T10:10:00Z', paid_at: null,
};
function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('PayGate v4 merchant client', () => {
  it('uses the same-origin keyless BFF and sends no collection profile', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payment, 201));
    const requestId = '2f54d1c8-4ef4-4c21-9ff8-b9f4fc8e79a1';
    const result = await createPayment({ amount: 100, name: 'Sourav P Bijoy', externalId: 'evt_123', requestId });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/paygate/v1/payments');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': requestId });
    expect(init?.body).toBe(JSON.stringify({ amount: 100, name: 'Sourav P Bijoy', external_id: 'evt_123', metadata: {} }));
    expect(String(init?.body)).not.toMatch(/paytm|kotak|paymentAccount/i);
    expect(result).toMatchObject({ id: payment.id, payableAmountPaise: 10037, adjustmentPaise: 37 });
  });
  it('polls the same v4 payment resource', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payment));
    await getPayment(payment.id);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/paygate/v1/payments/${payment.id}`);
  });
  it('understands the v4 nested error envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 'collection_unavailable', message: 'No collection destination is currently available' } }, 503));
    await expect(createPayment({ amount: 100, name: 'Sourav', externalId: 'evt_123', requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'collection_unavailable', status: 503 });
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

});

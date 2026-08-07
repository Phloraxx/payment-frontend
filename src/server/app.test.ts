import { describe, expect, it, vi } from 'vitest';
import type { PublicPayment } from '../shared/payment.js';
import type { RazorpayLiveConfig, RazorpayLiveMethods, RazorpayLiveOrder } from '../shared/razorpay-live.js';
import type { RazorpayTestConfig, RazorpayTestMethods, RazorpayTestOrder } from '../shared/razorpay.js';
import { createApiApp } from './app.js';
import type { ServerConfig } from './config.js';
import { FixedWindowLimiter } from './rate-limit.js';

const payment: PublicPayment = {
  id: 'abcdefghijklmno', requestedAmount: 100, requestedAmountPaise: 10000,
  payableAmount: '100.37', payableAmountPaise: 10037, status: 'pending',
  expiresAt: '2026-07-26T17:30:00Z', paidAt: null,
  upiUri: 'upi://pay?pa=test%40bank&am=100.37',
};


const razorpayConfig: RazorpayTestConfig = {
  enabled: true,
  keyId: 'rzp_test_public123',
  displayName: 'IEEE Sahrdaya Razorpay Test',
  mode: 'test',
};


const razorpayMethods: RazorpayTestMethods = {
  mode: 'test',
  netbanking: [
    { code: 'AUBL', name: 'AU Small Finance Bank' },
    { code: 'YESB', name: 'Yes Bank' },
  ],
  upiIntentAvailable: true,
  upiQrAvailable: false,
};

const razorpayOrder: RazorpayTestOrder = {
  id: 'razorpayorder01',
  amountPaise: 10000,
  currency: 'INR',
  status: 'created',
  externalId: 'portal:request',
  razorpayOrderId: 'order_public123',
  razorpayPaymentId: '',
  providerStatus: 'created',
  paymentMethod: '',
  amountRefunded: 0,
  error: '',
  createdAt: '2026-08-02T12:00:00Z',
  capturedAt: '',
  keyId: 'rzp_test_public123',
  displayName: 'IEEE Sahrdaya Razorpay Test',
};

const razorpayLiveConfig: RazorpayLiveConfig = {
  enabled: true,
  keyId: 'rzp_live_public123',
  displayName: 'IEEE Sahrdaya Razorpay Live',
  mode: 'live',
};

const razorpayLiveMethods: RazorpayLiveMethods = {
  mode: 'live',
  netbanking: [{ code: 'AUBL', name: 'AU Small Finance Bank' }],
  upiIntentAvailable: true,
  upiQrAvailable: true,
};

const razorpayLiveOrder: RazorpayLiveOrder = {
  id: 'razorpaylive01', amountPaise: 100, currency: 'INR', status: 'created',
  externalId: 'portal-live:request', razorpayOrderId: 'order_live123', razorpayPaymentId: '',
  providerStatus: 'created', paymentMethod: '', amountRefunded: 0, error: '',
  createdAt: '2026-08-03T12:00:00Z', capturedAt: '', keyId: 'rzp_live_public123',
  displayName: 'IEEE Sahrdaya Razorpay Live',
};

const config: ServerConfig = {
  port: 3000, payGateUrl: 'https://pay.example.com', payGateApiKey: 'x'.repeat(32),
  razorpayTestEnabled: false, razorpayTestUrl: '', razorpayTestApiKey: '',
  razorpayLiveEnabled: false, razorpayLiveUrl: '', razorpayLiveApiKey: '', trustProxyHeaders: true,
  creationRateLimit: 5, creationWindowMs: 300_000, globalCreationRateLimit: 60, globalCreationWindowMs: 60_000,
  statusRateLimit: 180, statusWindowMs: 60_000, globalStatusRateLimit: 1800, globalStatusWindowMs: 60_000,
};

function makeApp({
  createPerIpLimit = 5,
  createGlobalLimit = 60,
  statusPerIpLimit = 180,
  statusGlobalLimit = 1800,
  razorpayEnabled = false,
  razorpayLiveEnabled = false,
} = {}) {
  const payGate = {
    createPayment: vi.fn().mockResolvedValue(payment),
    getPayment: vi.fn().mockResolvedValue(payment),
  };
  const razorpayTest = {
    getConfig: vi.fn().mockResolvedValue(razorpayConfig),
    getMethods: vi.fn().mockResolvedValue(razorpayMethods),
    createOrder: vi.fn().mockResolvedValue(razorpayOrder),
    getOrder: vi.fn().mockResolvedValue(razorpayOrder),
    verifyOrder: vi.fn().mockResolvedValue({ ...razorpayOrder, status: 'captured' as const }),
    forwardWebhook: vi.fn().mockResolvedValue(new Response('{"processed":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  };
  const razorpayLive = {
    getConfig: vi.fn().mockResolvedValue(razorpayLiveConfig),
    getMethods: vi.fn().mockResolvedValue(razorpayLiveMethods),
    createOrder: vi.fn().mockResolvedValue(razorpayLiveOrder),
    getOrder: vi.fn().mockResolvedValue(razorpayLiveOrder),
    verifyOrder: vi.fn().mockResolvedValue({ ...razorpayLiveOrder, status: 'captured' as const }),
    forwardWebhook: vi.fn().mockResolvedValue(new Response('{"processed":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  };
  const app = createApiApp({
    config: {
      ...config,
      razorpayTestEnabled: razorpayEnabled,
      razorpayTestUrl: razorpayEnabled ? 'http://razorpay-test.internal' : '',
      razorpayTestApiKey: razorpayEnabled ? 'r'.repeat(32) : '',
      razorpayLiveEnabled,
      razorpayLiveUrl: razorpayLiveEnabled ? 'http://razorpay-live.internal' : '',
      razorpayLiveApiKey: razorpayLiveEnabled ? 'l'.repeat(32) : '',
    },
    payGate,
    razorpayTest: razorpayEnabled ? razorpayTest : undefined,
    razorpayLive: razorpayLiveEnabled ? razorpayLive : undefined,
    createPerIpLimiter: new FixedWindowLimiter(createPerIpLimit, 300_000),
    createGlobalLimiter: new FixedWindowLimiter(createGlobalLimit, 60_000),
    statusPerIpLimiter: new FixedWindowLimiter(statusPerIpLimit, 60_000),
    statusGlobalLimiter: new FixedWindowLimiter(statusGlobalLimit, 60_000),
  });
  return { app, payGate, razorpayTest, razorpayLive };
}

const headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' };
const createBody = (requestId: string, amount = 100) => JSON.stringify({ amount, requestId });

describe('API', () => {
  it('creates only whole-rupee payments with a UUID', async () => {
    const { app, payGate } = makeApp();
    const response = await app.request('/api/payments', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111'),
    });
    expect(response.status).toBe(201);
    expect(payGate.createPayment).toHaveBeenCalledWith(100, '11111111-1111-4111-8111-111111111111');
    expect((await app.request('/api/payments', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111', 100.01),
    })).status).toBe(400);
    expect((await app.request('/api/payments', {
      method: 'POST', headers,
      body: JSON.stringify({ amount: 100, requestId: '11111111-1111-4111-8111-111111111111', extra: true }),
    })).status).toBe(400);
  });

  it('does not let a throttled IP consume the shared creation quota', async () => {
    const { app } = makeApp({ createPerIpLimit: 1, createGlobalLimit: 2 });
    expect((await app.request('/api/payments', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111', 100.5),
    })).status).toBe(400);
    expect((await app.request('/api/payments', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111'),
    })).status).toBe(201);
    expect((await app.request('/api/payments', {
      method: 'POST', headers, body: createBody('22222222-2222-4222-8222-222222222222'),
    })).status).toBe(429);
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...headers, 'x-forwarded-for': '203.0.113.11' },
      body: createBody('33333333-3333-4333-8333-333333333333'),
    })).status).toBe(201);
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...headers, 'x-forwarded-for': '203.0.113.12' },
      body: createBody('44444444-4444-4444-8444-444444444444'),
    })).status).toBe(429);
  });

  it('uses the rightmost proxy-added X-Forwarded-For address', async () => {
    const { app } = makeApp({ createPerIpLimit: 1 });
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...headers, 'x-forwarded-for': '198.51.100.1, 203.0.113.50' },
      body: createBody('55555555-5555-4555-8555-555555555555'),
    })).status).toBe(201);
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...headers, 'x-forwarded-for': '198.51.100.2, 203.0.113.50' },
      body: createBody('66666666-6666-4666-8666-666666666666'),
    })).status).toBe(429);
  });

  it('prefers a validated Cloudflare visitor IP over X-Forwarded-For', async () => {
    const { app } = makeApp({ createPerIpLimit: 1 });
    const firstHeaders = {
      ...headers,
      'cf-connecting-ip': '192.0.2.44',
      'x-forwarded-for': '198.51.100.1, 203.0.113.50',
    };
    expect((await app.request('/api/payments', {
      method: 'POST', headers: firstHeaders,
      body: createBody('77777777-7777-4777-8777-777777777777'),
    })).status).toBe(201);
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...firstHeaders, 'x-forwarded-for': '198.51.100.2, 203.0.113.51' },
      body: createBody('88888888-8888-4888-8888-888888888888'),
    })).status).toBe(429);
    expect((await app.request('/api/payments', {
      method: 'POST', headers: { ...headers, 'cf-connecting-ip': 'not-an-ip', 'x-forwarded-for': '203.0.113.52' },
      body: createBody('99999999-9999-4999-8999-999999999999'),
    })).status).toBe(201);
  });

  it('bounds public status proxy traffic without charging another scope on rejection', async () => {
    const { app, payGate } = makeApp({ statusPerIpLimit: 1, statusGlobalLimit: 2 });
    expect((await app.request(`/api/payments/${payment.id}`, { headers })).status).toBe(200);
    const sameIp = await app.request(`/api/payments/${payment.id}`, { headers });
    expect(sameIp.status).toBe(429);
    expect(sameIp.headers.get('retry-after')).toBeTruthy();
    expect((await app.request(`/api/payments/${payment.id}`, {
      headers: { ...headers, 'x-forwarded-for': '203.0.113.11' },
    })).status).toBe(200);
    expect((await app.request(`/api/payments/${payment.id}`, {
      headers: { ...headers, 'x-forwarded-for': '203.0.113.12' },
    })).status).toBe(429);
    expect(payGate.getPayment).toHaveBeenCalledTimes(2);
  });

  it('keeps status uncached, liveness local, and unknown API paths as JSON 404', async () => {
    const { app } = makeApp();
    const status = await app.request(`/api/payments/${payment.id}`, { headers });
    expect(status.status).toBe(200);
    expect(status.headers.get('cache-control')).toBe('no-store');
    expect(status.headers.get('content-security-policy')).toContain("default-src 'self'");
    const live = await app.request('/api/health');
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: 'ok' });
    for (const path of ['/api', '/api/nope', '/api/readiness']) {
      const missing = await app.request(path);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('content-type')).toContain('application/json');
    }
  });

  it('keeps Razorpay disabled by default and does not loosen CSP', async () => {
    const { app } = makeApp();
    const configResponse = await app.request('/api/razorpay/test/config');
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toEqual({ enabled: false, keyId: '', displayName: '', mode: 'test' });
    const root = await app.request('/');
    expect(root.headers.get('content-security-policy')).not.toContain('checkout.razorpay.com');
    expect((await app.request('/api/razorpay/test/orders', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111'),
    })).status).toBe(404);
    expect((await app.request('/api/razorpay/test/methods', { headers })).status).toBe(404);
  });

  it('creates and verifies Razorpay Test orders through the private client', async () => {
    const { app, razorpayTest } = makeApp({ razorpayEnabled: true });
    const configResponse = await app.request('/api/razorpay/test/config');
    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toEqual(razorpayConfig);
    const methodsResponse = await app.request('/api/razorpay/test/methods', { headers });
    expect(methodsResponse.status).toBe(200);
    expect(await methodsResponse.json()).toEqual(razorpayMethods);
    expect(razorpayTest.getMethods).toHaveBeenCalledOnce();
    const callback = await app.request(`/api/razorpay/test/callback?order=${razorpayOrder.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        razorpay_order_id: 'order_public123',
        razorpay_payment_id: 'pay_public_123',
        razorpay_signature: 'a'.repeat(64),
      }).toString(),
    });
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(`/razorpay-test/${razorpayOrder.id}?callback=verified`);
    expect(razorpayTest.verifyOrder).toHaveBeenCalledWith(razorpayOrder.id, {
      razorpay_order_id: 'order_public123',
      razorpay_payment_id: 'pay_public_123',
      razorpay_signature: 'a'.repeat(64),
    });
    expect((await app.request(`/api/razorpay/test/callback?order=${razorpayOrder.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'razorpay_order_id=wrong',
    })).status).toBe(400);
    const create = await app.request('/api/razorpay/test/orders', {
      method: 'POST', headers, body: createBody('11111111-1111-4111-8111-111111111111'),
    });
    expect(create.status).toBe(201);
    expect(razorpayTest.createOrder).toHaveBeenCalledWith(10_000, '11111111-1111-4111-8111-111111111111');
    expect((await app.request('/api/razorpay/test/orders', {
      method: 'POST', headers, body: createBody('22222222-2222-4222-8222-222222222222', 100.5),
    })).status).toBe(400);
    const verify = await app.request(`/api/razorpay/test/orders/${razorpayOrder.id}/verify`, {
      method: 'POST', headers,
      body: JSON.stringify({
        razorpay_order_id: 'order_public123',
        razorpay_payment_id: 'pay_public_123',
        razorpay_signature: 'a'.repeat(64),
      }),
    });
    expect(verify.status).toBe(200);
    expect(razorpayTest.verifyOrder).toHaveBeenCalledWith(razorpayOrder.id, {
      razorpay_order_id: 'order_public123',
      razorpay_payment_id: 'pay_public_123',
      razorpay_signature: 'a'.repeat(64),
    });
    expect((await app.request(`/api/razorpay/test/orders/${razorpayOrder.id}/verify`, {
      method: 'POST', headers,
      body: JSON.stringify({
        razorpay_order_id: 'wrong', razorpay_payment_id: 'pay_public_123', razorpay_signature: 'a'.repeat(64),
      }),
    })).status).toBe(400);
  });

  it('forwards the exact signed Razorpay webhook bytes and headers', async () => {
    const { app, razorpayTest } = makeApp({ razorpayEnabled: true });
    const raw = '{"event":"payment.captured","value":"exact bytes"}';
    const response = await app.request('/api/razorpay/test/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-event-id': 'evt_public_123',
        'x-razorpay-signature': 'b'.repeat(64),
      },
      body: raw,
    });
    expect(response.status).toBe(200);
    const forwarded = razorpayTest.forwardWebhook.mock.calls[0];
    expect(new TextDecoder().decode(forwarded[0])).toBe(raw);
    expect(forwarded[1]).toBe('evt_public_123');
    expect(forwarded[2]).toBe('b'.repeat(64));
    expect((await app.request('/api/razorpay/test/webhook', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: raw,
    })).status).toBe(400);
  });

  it('adds only Razorpay Test origins to CSP when enabled', async () => {
    const { app } = makeApp({ razorpayEnabled: true });
    const root = await app.request('/');
    const csp = root.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).toContain('frame-src https://api.razorpay.com https://*.razorpay.com');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });


  it('keeps the Live pilot hidden and disabled by default', async () => {
    const { app } = makeApp();
    const configResponse = await app.request('/api/razorpay/live/config');
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toEqual({ enabled: false, keyId: '', displayName: '', mode: 'live' });
    expect((await app.request('/api/razorpay/live/methods')).status).toBe(404);
  });

  it('creates only exact ₹1 Live orders', async () => {
    const { app, razorpayLive } = makeApp({ razorpayLiveEnabled: true });
    const ok = await app.request('/api/razorpay/live/orders', {
      method: 'POST', headers, body: createBody('33333333-3333-4333-8333-333333333333', 1),
    });
    expect(ok.status).toBe(201);
    expect(razorpayLive.createOrder).toHaveBeenCalledWith(100, '33333333-3333-4333-8333-333333333333');
    const blocked = await app.request('/api/razorpay/live/orders', {
      method: 'POST', headers, body: createBody('44444444-4444-4444-8444-444444444444', 2),
    });
    expect(blocked.status).toBe(400);
    await expect(blocked.json()).resolves.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('verifies the Live signed callback and returns to the hidden order page', async () => {
    const { app, razorpayLive } = makeApp({ razorpayLiveEnabled: true });
    const body = new URLSearchParams({
      razorpay_order_id: 'order_live123',
      razorpay_payment_id: 'pay_live_123',
      razorpay_signature: 'c'.repeat(64),
    });
    const response = await app.request('/api/razorpay/live/callback?order=razorpaylive01', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/razorpay-live/razorpaylive01?callback=verified');
    expect(razorpayLive.verifyOrder).toHaveBeenCalledWith('razorpaylive01', {
      razorpay_order_id: 'order_live123',
      razorpay_payment_id: 'pay_live_123',
      razorpay_signature: 'c'.repeat(64),
    });
  });


  it('adds Razorpay CSP origins for a Live-only deployment', async () => {
    const { app } = makeApp({ razorpayLiveEnabled: true });
    const root = await app.request('/');
    const csp = root.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('marks every response as non-indexable and exposes crawler policy', async () => {
    const { app } = makeApp();
    const health = await app.request('/api/health');
    expect(health.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet, noimageindex');

    const robots = await app.request('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet, noimageindex');
    expect(await robots.text()).toContain('Content-Signal: search=no');

    const sitemap = await app.request('/sitemap.xml');
    expect(sitemap.status).toBe(404);
    expect(sitemap.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive, nosnippet, noimageindex');
  });

});

import { describe, expect, it, vi } from 'vitest';
import type { PublicPayment } from '../shared/payment.js';
import { createApiApp } from './app.js';
import type { ServerConfig } from './config.js';
import { FixedWindowLimiter } from './rate-limit.js';

const payment: PublicPayment = {
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

const config: ServerConfig = {
  port: 3000,
  payGateUrl: 'https://pay.example.com',
  payGateApiKey: 'x'.repeat(32),
  trustProxyHeaders: true,
  creationRateLimit: 5,
  creationWindowMs: 300_000,
  globalCreationRateLimit: 60,
  globalCreationWindowMs: 60_000,
};

function makeApp({ perIpLimit = 5, globalLimit = 60 } = {}) {
  const payGate = {
    createPayment: vi.fn().mockResolvedValue(payment),
    getPayment: vi.fn().mockResolvedValue(payment),
    checkHealth: vi.fn().mockResolvedValue(true),
  };
  const app = createApiApp({
    config,
    payGate,
    perIpLimiter: new FixedWindowLimiter(perIpLimit, 300_000),
    globalLimiter: new FixedWindowLimiter(globalLimit, 60_000),
  });
  return { app, payGate };
}

const headers = {
  'content-type': 'application/json',
  'x-forwarded-for': '203.0.113.10',
};

function createBody(requestId: string, amount = 100) {
  return JSON.stringify({ amount, requestId });
}

describe('API', () => {
  it('creates only whole-rupee payments with a UUID', async () => {
    const { app, payGate } = makeApp();
    const response = await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: createBody('11111111-1111-4111-8111-111111111111'),
    });
    expect(response.status).toBe(201);
    expect(payGate.createPayment).toHaveBeenCalledWith(100, '11111111-1111-4111-8111-111111111111');

    const invalid = await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: createBody('11111111-1111-4111-8111-111111111111', 100.01),
    });
    expect(invalid.status).toBe(400);

    const unknownField = await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: 100, requestId: '11111111-1111-4111-8111-111111111111', extra: true }),
    });
    expect(unknownField.status).toBe(400);
  });

  it('does not let a throttled IP consume the shared creation quota', async () => {
    const { app } = makeApp({ perIpLimit: 1, globalLimit: 2 });

    const malformed = await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: createBody('11111111-1111-4111-8111-111111111111', 100.5),
    });
    expect(malformed.status).toBe(400);

    expect((await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: createBody('11111111-1111-4111-8111-111111111111'),
    })).status).toBe(201);

    const blockedSameIp = await app.request('/api/payments', {
      method: 'POST',
      headers,
      body: createBody('22222222-2222-4222-8222-222222222222'),
    });
    expect(blockedSameIp.status).toBe(429);
    expect(blockedSameIp.headers.get('retry-after')).toBeTruthy();

    const secondIpHeaders = { ...headers, 'x-forwarded-for': '203.0.113.11' };
    expect((await app.request('/api/payments', {
      method: 'POST',
      headers: secondIpHeaders,
      body: createBody('33333333-3333-4333-8333-333333333333'),
    })).status).toBe(201);

    const thirdIpHeaders = { ...headers, 'x-forwarded-for': '203.0.113.12' };
    expect((await app.request('/api/payments', {
      method: 'POST',
      headers: thirdIpHeaders,
      body: createBody('44444444-4444-4444-8444-444444444444'),
    })).status).toBe(429);
  });

  it('uses the rightmost proxy-added X-Forwarded-For address', async () => {
    const { app } = makeApp({ perIpLimit: 1 });
    const first = await app.request('/api/payments', {
      method: 'POST',
      headers: { ...headers, 'x-forwarded-for': '198.51.100.1, 203.0.113.50' },
      body: createBody('55555555-5555-4555-8555-555555555555'),
    });
    expect(first.status).toBe(201);

    const spoofedLeftmost = await app.request('/api/payments', {
      method: 'POST',
      headers: { ...headers, 'x-forwarded-for': '198.51.100.2, 203.0.113.50' },
      body: createBody('66666666-6666-4666-8666-666666666666'),
    });
    expect(spoofedLeftmost.status).toBe(429);
  });

  it('keeps status responses uncached and unknown API paths as JSON 404', async () => {
    const { app } = makeApp();
    const status = await app.request(`/api/payments/${payment.id}`);
    expect(status.status).toBe(200);
    expect(status.headers.get('cache-control')).toBe('no-store');
    expect(status.headers.get('content-security-policy')).toContain("default-src 'self'");

    for (const path of ['/api', '/api/nope']) {
      const missing = await app.request(path);
      expect(missing.status).toBe(404);
      expect(missing.headers.get('content-type')).toContain('application/json');
    }
  });

  it('keeps frontend liveness independent from PayGate readiness', async () => {
    const { app, payGate } = makeApp();
    payGate.checkHealth.mockResolvedValue(false);

    const live = await app.request('/api/health');
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: 'ok' });

    const ready = await app.request('/api/readiness');
    expect(ready.status).toBe(503);
    await expect(ready.json()).resolves.toEqual({ status: 'ok', payGate: 'unreachable' });
  });
});

import { getConnInfo } from '@hono/node-server/conninfo';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { isIP } from 'node:net';

import type { CreatePaymentRequest } from '../shared/payment.js';
import type { VerifyRazorpayTestRequest } from '../shared/razorpay.js';
import type { ServerConfig } from './config.js';
import { PayGateClient, PayGateError } from './paygate.js';
import { RazorpayLiveClient, RazorpayLiveProxyError } from './razorpay-live.js';
import { RazorpayTestClient, RazorpayTestProxyError } from './razorpay-test.js';
import { FixedWindowLimiter, type RateLimitDecision } from './rate-limit.js';

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ID_RE = /^[a-z0-9_-]{8,64}$/i;
const RAZORPAY_ORDER_ID_RE = /^order_[A-Za-z0-9]{6,64}$/;
const RAZORPAY_PAYMENT_ID_RE = /^pay_[A-Za-z0-9_]{6,64}$/;
const HEX_SIGNATURE_RE = /^[a-f0-9]{64}$/i;

export interface AppDependencies {
  config: ServerConfig;
  payGate: Pick<PayGateClient, 'createPayment' | 'getPayment'>;
  razorpayTest?: Pick<RazorpayTestClient, 'getConfig' | 'getMethods' | 'createOrder' | 'getOrder' | 'verifyOrder' | 'forwardWebhook'>;
  razorpayLive?: Pick<RazorpayLiveClient, 'getConfig' | 'getMethods' | 'createOrder' | 'getOrder' | 'verifyOrder' | 'forwardWebhook'>;
  createPerIpLimiter: FixedWindowLimiter;
  createGlobalLimiter: FixedWindowLimiter;
  statusPerIpLimiter: FixedWindowLimiter;
  statusGlobalLimiter: FixedWindowLimiter;
}

function errorBody(code: string, message: string) {
  return { code, message };
}

function extractClientIp(c: Parameters<typeof getConnInfo>[0], trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    // Cloudflare sends the original HTTP visitor address as a single-value
    // CF-Connecting-IP header. Prefer it when present so an additional local
    // reverse proxy (for example Traefik) cannot collapse all clients into its
    // own address in X-Forwarded-For.
    const cloudflareAddress = c.req.header('cf-connecting-ip')?.trim();
    if (cloudflareAddress && isIP(cloudflareAddress)) return cloudflareAddress;

    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const addresses = forwarded
        .split(',')
        .map((value) => value.trim())
        .filter((value) => isIP(value));
      const boundaryAddress = addresses.at(-1);
      if (boundaryAddress) return boundaryAddress;
    }
  }
  return getConnInfo(c).remote.address ?? 'unknown';
}

function takeScopedQuota(
  perIpLimiter: FixedWindowLimiter,
  globalLimiter: FixedWindowLimiter,
  clientIp: string,
): RateLimitDecision | null {
  const perIp = perIpLimiter.check(clientIp);
  if (!perIp.allowed) return perIp;
  const global = globalLimiter.check('global');
  if (!global.allowed) return global;
  perIpLimiter.consume(clientIp);
  globalLimiter.consume('global');
  return null;
}

function parseCreateBody(value: unknown): CreatePaymentRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (
    keys.length !== 2 ||
    !keys.includes('amount') ||
    !keys.includes('requestId') ||
    typeof item.amount !== 'number' ||
    !Number.isSafeInteger(item.amount) ||
    item.amount <= 0 ||
    typeof item.requestId !== 'string' ||
    !REQUEST_ID_RE.test(item.requestId)
  ) {
    return null;
  }
  return { amount: item.amount, requestId: item.requestId };
}

function parseRazorpayVerifyBody(value: unknown): VerifyRazorpayTestRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (
    keys.length !== 3 ||
    !keys.includes('razorpay_order_id') ||
    !keys.includes('razorpay_payment_id') ||
    !keys.includes('razorpay_signature') ||
    typeof item.razorpay_order_id !== 'string' ||
    !RAZORPAY_ORDER_ID_RE.test(item.razorpay_order_id) ||
    typeof item.razorpay_payment_id !== 'string' ||
    !RAZORPAY_PAYMENT_ID_RE.test(item.razorpay_payment_id) ||
    typeof item.razorpay_signature !== 'string' ||
    !HEX_SIGNATURE_RE.test(item.razorpay_signature)
  ) {
    return null;
  }
  return {
    razorpay_order_id: item.razorpay_order_id,
    razorpay_payment_id: item.razorpay_payment_id,
    razorpay_signature: item.razorpay_signature,
  };
}

function razorpayErrorStatus(status: number): 400 | 404 | 409 | 422 | 429 | 502 {
  return clientErrorStatus(status);
}

function clientErrorStatus(status: number): 400 | 404 | 409 | 422 | 429 | 502 {
  switch (status) {
    case 400:
    case 404:
    case 409:
    case 422:
    case 429:
      return status;
    default:
      return 502;
  }
}

export function createApiApp(deps: AppDependencies): Hono {
  const app = new Hono();
  const razorpayEnabled = deps.config.razorpayTestEnabled || deps.config.razorpayLiveEnabled;

  app.use('*', async (c, next) => {
    c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    await next();
  });

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        connectSrc: razorpayEnabled
          ? ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com']
          : ["'self'"],
        fontSrc: razorpayEnabled ? ["'self'", 'https://*.razorpay.com'] : ["'self'"],
        formAction: razorpayEnabled ? ["'self'", 'https://api.razorpay.com'] : ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: razorpayEnabled
          ? ['https://api.razorpay.com', 'https://*.razorpay.com']
          : ["'none'"],
        imgSrc: razorpayEnabled
          ? ["'self'", 'data:', 'blob:', 'https://*.razorpay.com']
          : ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: razorpayEnabled
          ? ["'self'", 'https://checkout.razorpay.com']
          : ["'self'"],
        // Razorpay Custom Checkout opens a secure processing window that
        // inherits the opener policy before navigating. Its SDK applies
        // dynamic inline styles there, so allow styles (not scripts) only
        // while either isolated Razorpay rail is enabled.
        styleSrc: razorpayEnabled ? ["'self'", "'unsafe-inline'"] : ["'self'"],
      },
      permissionsPolicy: {
        camera: [],
        geolocation: [],
        microphone: [],
        payment: ['self'],
      },
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
    }),
  );
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/robots.txt', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.text('User-agent: *\nDisallow:\n');
  });

  // Liveness is local only. A temporary PayGate outage should not cause
  // Dokploy/Docker to restart an otherwise healthy frontend container.
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.post(
    '/api/payments',
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Request body is too large.'), 413),
    }),
    async (c) => {
      if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Content-Type must be application/json.'), 415);
      }

      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody('INVALID_JSON', 'Request body must be valid JSON.'), 400);
      }
      const body = parseCreateBody(raw);
      if (!body) {
        return c.json(
          errorBody('INVALID_REQUEST', 'Amount must be a positive whole number of rupees and requestId must be a UUID.'),
          400,
        );
      }

      const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
      const denied = takeScopedQuota(deps.createPerIpLimiter, deps.createGlobalLimiter, clientIp);
      if (denied) {
        c.header('Retry-After', String(denied.retryAfterSeconds));
        return c.json(errorBody('RATE_LIMITED', 'Too many payment requests. Please wait and try again.'), 429);
      }

      try {
        const payment = await deps.payGate.createPayment(body.amount, body.requestId);
        return c.json(payment, 201);
      } catch (error) {
        if (error instanceof PayGateError) {
          return c.json(errorBody(error.code, error.message), clientErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.get('/api/payments/:id', async (c) => {
    const id = c.req.param('id');
    if (!PAYMENT_ID_RE.test(id)) {
      return c.json(errorBody('INVALID_PAYMENT_ID', 'Invalid payment ID.'), 400);
    }

    const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
    const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
    if (denied) {
      c.header('Retry-After', String(denied.retryAfterSeconds));
      return c.json(errorBody('RATE_LIMITED', 'Too many payment status requests. Please wait and try again.'), 429);
    }

    try {
      const payment = await deps.payGate.getPayment(id);
      return c.json(payment);
    } catch (error) {
      if (error instanceof PayGateError) {
        return c.json(errorBody(error.code, error.message), clientErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.get('/api/razorpay/test/config', async (c) => {
    if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
      return c.json({ enabled: false, keyId: '', displayName: '', mode: 'test' as const });
    }
    try {
      return c.json(await deps.razorpayTest.getConfig());
    } catch (error) {
      if (error instanceof RazorpayTestProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.get('/api/razorpay/test/methods', async (c) => {
    if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
      return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
    }
    const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
    const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
    if (denied) {
      c.header('Retry-After', String(denied.retryAfterSeconds));
      return c.json(errorBody('RATE_LIMITED', 'Too many payment-method requests. Please wait and try again.'), 429);
    }
    try {
      return c.json(await deps.razorpayTest.getMethods());
    } catch (error) {
      if (error instanceof RazorpayTestProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.post(
    '/api/razorpay/test/orders',
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Request body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
        return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
      }
      if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Content-Type must be application/json.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody('INVALID_JSON', 'Request body must be valid JSON.'), 400);
      }
      const body = parseCreateBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Amount must be a positive whole number of rupees and requestId must be a UUID.'), 400);
      }
      const amountPaise = body.amount * 100;
      if (!Number.isSafeInteger(amountPaise) || amountPaise > 100_000_00) {
        return c.json(errorBody('INVALID_REQUEST', 'Razorpay Test amount must be between ₹1 and ₹1,00,000.'), 400);
      }
      const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
      const denied = takeScopedQuota(deps.createPerIpLimiter, deps.createGlobalLimiter, clientIp);
      if (denied) {
        c.header('Retry-After', String(denied.retryAfterSeconds));
        return c.json(errorBody('RATE_LIMITED', 'Too many payment requests. Please wait and try again.'), 429);
      }
      try {
        return c.json(await deps.razorpayTest.createOrder(amountPaise, body.requestId), 201);
      } catch (error) {
        if (error instanceof RazorpayTestProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.get('/api/razorpay/test/orders/:id', async (c) => {
    if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
      return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
    }
    const id = c.req.param('id');
    if (!PAYMENT_ID_RE.test(id)) {
      return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay test order ID.'), 400);
    }
    const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
    const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
    if (denied) {
      c.header('Retry-After', String(denied.retryAfterSeconds));
      return c.json(errorBody('RATE_LIMITED', 'Too many payment status requests. Please wait and try again.'), 429);
    }
    try {
      return c.json(await deps.razorpayTest.getOrder(id));
    } catch (error) {
      if (error instanceof RazorpayTestProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.post(
    '/api/razorpay/test/callback',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Callback body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
        return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
      }
      const id = c.req.query('order')?.trim() ?? '';
      if (!PAYMENT_ID_RE.test(id)) {
        return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay test order ID.'), 400);
      }
      const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/x-www-form-urlencoded' && contentType !== 'multipart/form-data') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Razorpay callback must use form data.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.parseBody();
      } catch {
        return c.json(errorBody('INVALID_FORM', 'Razorpay callback form is invalid.'), 400);
      }
      const body = parseRazorpayVerifyBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Invalid Razorpay callback response.'), 400);
      }
      try {
        await deps.razorpayTest.verifyOrder(id, body);
        return c.redirect(`/razorpay-test/${encodeURIComponent(id)}?callback=verified`, 303);
      } catch (error) {
        if (error instanceof RazorpayTestProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/razorpay/test/orders/:id/verify',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Request body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
        return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
      }
      const id = c.req.param('id');
      if (!PAYMENT_ID_RE.test(id)) {
        return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay test order ID.'), 400);
      }
      if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Content-Type must be application/json.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody('INVALID_JSON', 'Request body must be valid JSON.'), 400);
      }
      const body = parseRazorpayVerifyBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Invalid Razorpay Checkout verification response.'), 400);
      }
      const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
      const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
      if (denied) {
        c.header('Retry-After', String(denied.retryAfterSeconds));
        return c.json(errorBody('RATE_LIMITED', 'Too many payment verification requests. Please wait and try again.'), 429);
      }
      try {
        return c.json(await deps.razorpayTest.verifyOrder(id, body));
      } catch (error) {
        if (error instanceof RazorpayTestProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/razorpay/test/webhook',
    bodyLimit({
      maxSize: 1 << 20,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Webhook body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayTestEnabled || !deps.razorpayTest) {
        return c.json(errorBody('RAZORPAY_TEST_DISABLED', 'Razorpay Test Mode is disabled.'), 404);
      }
      const eventId = c.req.header('x-razorpay-event-id')?.trim() ?? '';
      const signature = c.req.header('x-razorpay-signature')?.trim() ?? '';
      if (!eventId || eventId.length > 128 || !HEX_SIGNATURE_RE.test(signature)) {
        return c.json(errorBody('RAZORPAY_TEST_WEBHOOK_INVALID', 'Missing or invalid Razorpay webhook headers.'), 400);
      }
      const raw = await c.req.arrayBuffer();
      const upstream = await deps.razorpayTest.forwardWebhook(raw, eventId, signature);
      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=UTF-8',
        },
      });
    },
  );

  app.get('/api/razorpay/live/config', async (c) => {
    if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
      return c.json({ enabled: false, keyId: '', displayName: '', mode: 'live' as const });
    }
    try {
      return c.json(await deps.razorpayLive.getConfig());
    } catch (error) {
      if (error instanceof RazorpayLiveProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.get('/api/razorpay/live/methods', async (c) => {
    if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
      return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
    }
    const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
    const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
    if (denied) {
      c.header('Retry-After', String(denied.retryAfterSeconds));
      return c.json(errorBody('RATE_LIMITED', 'Too many payment-method requests. Please wait and try again.'), 429);
    }
    try {
      return c.json(await deps.razorpayLive.getMethods());
    } catch (error) {
      if (error instanceof RazorpayLiveProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.post(
    '/api/razorpay/live/orders',
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Request body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
        return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
      }
      if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Content-Type must be application/json.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody('INVALID_JSON', 'Request body must be valid JSON.'), 400);
      }
      const body = parseCreateBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Amount must be a positive whole number of rupees and requestId must be a UUID.'), 400);
      }
      const amountPaise = body.amount * 100;
      if (amountPaise !== 100) {
        return c.json(errorBody('INVALID_REQUEST', 'Razorpay Live pilot amount must be exactly ₹1.'), 400);
      }
      const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
      const denied = takeScopedQuota(deps.createPerIpLimiter, deps.createGlobalLimiter, clientIp);
      if (denied) {
        c.header('Retry-After', String(denied.retryAfterSeconds));
        return c.json(errorBody('RATE_LIMITED', 'Too many payment requests. Please wait and try again.'), 429);
      }
      try {
        return c.json(await deps.razorpayLive.createOrder(amountPaise, body.requestId), 201);
      } catch (error) {
        if (error instanceof RazorpayLiveProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.get('/api/razorpay/live/orders/:id', async (c) => {
    if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
      return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
    }
    const id = c.req.param('id');
    if (!PAYMENT_ID_RE.test(id)) {
      return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay live order ID.'), 400);
    }
    const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
    const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
    if (denied) {
      c.header('Retry-After', String(denied.retryAfterSeconds));
      return c.json(errorBody('RATE_LIMITED', 'Too many payment status requests. Please wait and try again.'), 429);
    }
    try {
      return c.json(await deps.razorpayLive.getOrder(id));
    } catch (error) {
      if (error instanceof RazorpayLiveProxyError) {
        return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
      }
      throw error;
    }
  });

  app.post(
    '/api/razorpay/live/callback',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Callback body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
        return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
      }
      const id = c.req.query('order')?.trim() ?? '';
      if (!PAYMENT_ID_RE.test(id)) {
        return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay live order ID.'), 400);
      }
      const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/x-www-form-urlencoded' && contentType !== 'multipart/form-data') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Razorpay callback must use form data.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.parseBody();
      } catch {
        return c.json(errorBody('INVALID_FORM', 'Razorpay callback form is invalid.'), 400);
      }
      const body = parseRazorpayVerifyBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Invalid Razorpay callback response.'), 400);
      }
      try {
        await deps.razorpayLive.verifyOrder(id, body);
        return c.redirect(`/razorpay-live/${encodeURIComponent(id)}?callback=verified`, 303);
      } catch (error) {
        if (error instanceof RazorpayLiveProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/razorpay/live/orders/:id/verify',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Request body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
        return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
      }
      const id = c.req.param('id');
      if (!PAYMENT_ID_RE.test(id)) {
        return c.json(errorBody('INVALID_ORDER_ID', 'Invalid Razorpay live order ID.'), 400);
      }
      if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return c.json(errorBody('INVALID_CONTENT_TYPE', 'Content-Type must be application/json.'), 415);
      }
      let raw: unknown;
      try {
        raw = await c.req.json();
      } catch {
        return c.json(errorBody('INVALID_JSON', 'Request body must be valid JSON.'), 400);
      }
      const body = parseRazorpayVerifyBody(raw);
      if (!body) {
        return c.json(errorBody('INVALID_REQUEST', 'Invalid Razorpay Checkout verification response.'), 400);
      }
      const clientIp = extractClientIp(c, deps.config.trustProxyHeaders);
      const denied = takeScopedQuota(deps.statusPerIpLimiter, deps.statusGlobalLimiter, clientIp);
      if (denied) {
        c.header('Retry-After', String(denied.retryAfterSeconds));
        return c.json(errorBody('RATE_LIMITED', 'Too many payment verification requests. Please wait and try again.'), 429);
      }
      try {
        return c.json(await deps.razorpayLive.verifyOrder(id, body));
      } catch (error) {
        if (error instanceof RazorpayLiveProxyError) {
          return c.json(errorBody(error.code, error.message), razorpayErrorStatus(error.status));
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/razorpay/live/webhook',
    bodyLimit({
      maxSize: 1 << 20,
      onError: (c) => c.json(errorBody('REQUEST_TOO_LARGE', 'Webhook body is too large.'), 413),
    }),
    async (c) => {
      if (!deps.config.razorpayLiveEnabled || !deps.razorpayLive) {
        return c.json(errorBody('RAZORPAY_LIVE_DISABLED', 'Razorpay Live Mode is disabled.'), 404);
      }
      const eventId = c.req.header('x-razorpay-event-id')?.trim() ?? '';
      const signature = c.req.header('x-razorpay-signature')?.trim() ?? '';
      if (!eventId || eventId.length > 128 || !HEX_SIGNATURE_RE.test(signature)) {
        return c.json(errorBody('RAZORPAY_LIVE_WEBHOOK_INVALID', 'Missing or invalid Razorpay webhook headers.'), 400);
      }
      const raw = await c.req.arrayBuffer();
      const upstream = await deps.razorpayLive.forwardWebhook(raw, eventId, signature);
      return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=UTF-8',
        },
      });
    },
  );

  app.all('/api', (c) => c.json(errorBody('NOT_FOUND', 'API route not found.'), 404));
  app.all('/api/*', (c) => c.json(errorBody('NOT_FOUND', 'API route not found.'), 404));

  app.onError((error, c) => {
    console.error('Unhandled request error', { path: c.req.path, error: error.message });
    return c.json(errorBody('INTERNAL_ERROR', 'Unexpected server error.'), 500);
  });

  return app;
}

import { getConnInfo } from '@hono/node-server/conninfo';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { isIP } from 'node:net';

import type { CreatePaymentRequest } from '../shared/payment.js';
import type { ServerConfig } from './config.js';
import { PayGateClient, PayGateError } from './paygate.js';
import { FixedWindowLimiter, type RateLimitDecision } from './rate-limit.js';

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ID_RE = /^[a-z0-9_-]{8,64}$/i;

export interface AppDependencies {
  config: ServerConfig;
  payGate: Pick<PayGateClient, 'createPayment' | 'getPayment'>;
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

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'none'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
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

  app.all('/api', (c) => c.json(errorBody('NOT_FOUND', 'API route not found.'), 404));
  app.all('/api/*', (c) => c.json(errorBody('NOT_FOUND', 'API route not found.'), 404));

  app.onError((error, c) => {
    console.error('Unhandled request error', { path: c.req.path, error: error.message });
    return c.json(errorBody('INTERNAL_ERROR', 'Unexpected server error.'), 500);
  });

  return app;
}

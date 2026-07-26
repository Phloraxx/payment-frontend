import { getConnInfo } from '@hono/node-server/conninfo';
import { bodyLimit } from 'hono/body-limit';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { isIP } from 'node:net';

import type { CreatePaymentRequest } from '../shared/payment.js';
import type { ServerConfig } from './config.js';
import { PayGateClient, PayGateError } from './paygate.js';
import { FixedWindowLimiter } from './rate-limit.js';

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_ID_RE = /^[a-z0-9_-]{8,64}$/i;

export interface AppDependencies {
  config: ServerConfig;
  payGate: Pick<PayGateClient, 'createPayment' | 'getPayment' | 'checkHealth'>;
  perIpLimiter: FixedWindowLimiter;
  globalLimiter: FixedWindowLimiter;
}

function errorBody(code: string, message: string) {
  return { code, message };
}

function extractClientIp(c: Parameters<typeof getConnInfo>[0], trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded && isIP(forwarded)) return forwarded;
    const real = c.req.header('x-real-ip')?.trim();
    if (real && isIP(real)) return real;
  }
  return getConnInfo(c).remote.address ?? 'unknown';
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

  // Liveness is intentionally independent of PayGate. A temporary upstream
  // outage should not cause Dokploy/Docker to restart an otherwise healthy UI.
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.get('/api/readiness', async (c) => {
    const payGate = await deps.payGate.checkHealth();
    return c.json({ status: 'ok', payGate: payGate ? 'reachable' : 'unreachable' }, payGate ? 200 : 503);
  });

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

      // Only well-formed payment attempts consume creation quota. Body size and
      // schema checks above are cheap, while the limiter protects the scarce DDM
      // allocation path from valid-looking automated requests.
      const ip = extractClientIp(c, deps.config.trustProxyHeaders);
      const global = deps.globalLimiter.consume('global');
      const perIp = deps.perIpLimiter.consume(ip);
      if (!global.allowed || !perIp.allowed) {
        const retryAfter = Math.max(global.retryAfterSeconds, perIp.retryAfterSeconds);
        c.header('Retry-After', String(retryAfter));
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

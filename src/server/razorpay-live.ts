import {
  isRazorpayLiveConfig,
  isRazorpayLiveMethods,
  isRazorpayLiveOrder,
  type RazorpayLiveConfig,
  type RazorpayLiveMethods,
  type RazorpayLiveOrder,
  type VerifyRazorpayLiveRequest,
} from '../shared/razorpay-live.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_MESSAGE_LENGTH = 240;
const METHODS_URL = 'https://api.razorpay.com/v1/methods';
const METHODS_CACHE_MS = 5 * 60 * 1000;
const MAX_METHODS_RESPONSE_BYTES = 256 * 1024;

export class RazorpayLiveProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface UpstreamErrorPayload {
  error?: { code?: unknown; message?: unknown };
  code?: unknown;
  message?: unknown;
}

function safeMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[\r\n\t]+/g, ' ').trim();
  return clean ? clean.slice(0, MAX_ERROR_MESSAGE_LENGTH) : fallback;
}
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_RESPONSE', 'Razorpay live service returned invalid JSON.');
  }
}

function publicStatus(status: number): 400 | 404 | 409 | 422 | 429 | 502 {
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

function upstreamError(value: unknown, status: number): RazorpayLiveProxyError {
  const payload = (value && typeof value === 'object' ? value : {}) as UpstreamErrorPayload;
  const nested = payload.error && typeof payload.error === 'object' ? payload.error : undefined;
  const codeValue = nested?.code ?? payload.code;
  const messageValue = nested?.message ?? payload.message;
  const safeStatus = publicStatus(status);
  const code = typeof codeValue === 'string' && /^[A-Z0-9_]{1,80}$/.test(codeValue)
    ? codeValue
    : 'RAZORPAY_LIVE_REQUEST_FAILED';
  return new RazorpayLiveProxyError(
    safeStatus,
    [401, 403].includes(status) ? 'RAZORPAY_LIVE_UNAVAILABLE' : code,
    [401, 403].includes(status)
      ? 'Razorpay live service is temporarily unavailable.'
      : safeMessage(messageValue, 'Razorpay live request failed.'),
  );
}


async function readBoundedMethodsJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_METHODS_RESPONSE_BYTES) {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned an oversized payment-method response.');
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_METHODS_RESPONSE_BYTES) {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned an oversized payment-method response.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned invalid payment-method JSON.');
  }
}

interface RazorpayMethodsPayload {
  netbanking?: unknown;
  upi_intent?: unknown;
  upi_config?: unknown;
}

export function normalizeRazorpayLiveMethods(value: unknown): RazorpayLiveMethods {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned invalid payment methods.');
  }
  const payload = value as RazorpayMethodsPayload;
  if (!payload.netbanking || typeof payload.netbanking !== 'object' || Array.isArray(payload.netbanking)) {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned invalid netbanking methods.');
  }
  const banks = Object.entries(payload.netbanking as Record<string, unknown>)
    .filter(([code, name]) => /^[A-Z0-9_]{2,16}$/.test(code) && typeof name === 'string' && name.trim().length >= 2)
    .map(([code, name]) => ({ code, name: (name as string).trim().slice(0, 120) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en-IN'))
    .slice(0, 100);
  const methods: RazorpayLiveMethods = {
    mode: 'live',
    netbanking: banks,
    upiIntentAvailable: payload.upi_intent === true,
    upiQrAvailable: Array.isArray(payload.upi_config) && payload.upi_config.length > 0,
  };
  if (!isRazorpayLiveMethods(methods)) {
    throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_METHODS', 'Razorpay returned invalid payment methods.');
  }
  return methods;
}

export class RazorpayLiveClient {
  private methodsCache?: { expiresAt: number; value: RazorpayLiveMethods };

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getConfig(): Promise<RazorpayLiveConfig> {
    const response = await this.request('/api/razorpay/live/config', { method: 'GET' });
    const value = await readJson(response);
    if (!isRazorpayLiveConfig(value)) {
      throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_RESPONSE', 'Razorpay live service returned invalid configuration.');
    }
    return value;
  }


  async getMethods(): Promise<RazorpayLiveMethods> {
    if (this.methodsCache && this.methodsCache.expiresAt > Date.now()) {
      return this.methodsCache.value;
    }
    const config = await this.getConfig();
    let response: Response;
    try {
      response = await this.fetchImpl(METHODS_URL, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${config.keyId}:`).toString('base64')}`,
        },
      });
    } catch {
      throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_METHODS_UNAVAILABLE', 'Razorpay payment methods are temporarily unavailable.');
    }
    const value = await readBoundedMethodsJson(response);
    if (!response.ok) throw upstreamError(value, response.status);
    const normalized = normalizeRazorpayLiveMethods(value);
    this.methodsCache = { expiresAt: Date.now() + METHODS_CACHE_MS, value: normalized };
    return normalized;
  }

  async createOrder(amountPaise: number, idempotencyKey: string): Promise<RazorpayLiveOrder> {
    const response = await this.request('/api/razorpay/live/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ amountPaise, externalId: `portal-live:${idempotencyKey}` }),
    });
    return this.readOrder(response);
  }

  async getOrder(id: string): Promise<RazorpayLiveOrder> {
    return this.readOrder(await this.request(`/api/razorpay/live/orders/${encodeURIComponent(id)}`, { method: 'GET' }));
  }

  async verifyOrder(id: string, payload: VerifyRazorpayLiveRequest): Promise<RazorpayLiveOrder> {
    const response = await this.request(`/api/razorpay/live/orders/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return this.readOrder(response);
  }
  async forwardWebhook(raw: ArrayBuffer, eventId: string, signature: string): Promise<Response> {
    return this.request('/api/razorpay/live/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Event-Id': eventId,
        'X-Razorpay-Signature': signature,
      },
      body: raw,
    }, false, false);
  }

  private async readOrder(response: Response): Promise<RazorpayLiveOrder> {
    const value = await readJson(response);
    if (!isRazorpayLiveOrder(value)) {
      throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_INVALID_RESPONSE', 'Razorpay live service returned an invalid order.');
    }
    return value;
  }

  private async request(path: string, init: RequestInit, parseErrors = true, authenticated = true): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          ...(authenticated ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          Accept: 'application/json',
          ...init.headers,
        },
      });
    } catch {
      throw new RazorpayLiveProxyError(502, 'RAZORPAY_LIVE_UNAVAILABLE', 'Razorpay live service is temporarily unavailable.');
    }
    if (response.ok || !parseErrors) return response;
    let value: unknown = {};
    try {
      value = await response.json();
    } catch {
      // Use a safe generic error below.
    }
    throw upstreamError(value, response.status);
  }
}

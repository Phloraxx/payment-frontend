import {
  isRazorpayTestConfig,
  isRazorpayTestOrder,
  type RazorpayTestConfig,
  type RazorpayTestOrder,
  type VerifyRazorpayTestRequest,
} from '../shared/razorpay.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_MESSAGE_LENGTH = 240;

export class RazorpayTestProxyError extends Error {
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
    throw new RazorpayTestProxyError(502, 'RAZORPAY_TEST_INVALID_RESPONSE', 'Razorpay test service returned invalid JSON.');
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

function upstreamError(value: unknown, status: number): RazorpayTestProxyError {
  const payload = (value && typeof value === 'object' ? value : {}) as UpstreamErrorPayload;
  const nested = payload.error && typeof payload.error === 'object' ? payload.error : undefined;
  const codeValue = nested?.code ?? payload.code;
  const messageValue = nested?.message ?? payload.message;
  const safeStatus = publicStatus(status);
  const code = typeof codeValue === 'string' && /^[A-Z0-9_]{1,80}$/.test(codeValue)
    ? codeValue
    : 'RAZORPAY_TEST_REQUEST_FAILED';
  return new RazorpayTestProxyError(
    safeStatus,
    [401, 403].includes(status) ? 'RAZORPAY_TEST_UNAVAILABLE' : code,
    [401, 403].includes(status)
      ? 'Razorpay test service is temporarily unavailable.'
      : safeMessage(messageValue, 'Razorpay test request failed.'),
  );
}
export class RazorpayTestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getConfig(): Promise<RazorpayTestConfig> {
    const response = await this.request('/api/razorpay/test/config', { method: 'GET' });
    const value = await readJson(response);
    if (!isRazorpayTestConfig(value)) {
      throw new RazorpayTestProxyError(502, 'RAZORPAY_TEST_INVALID_RESPONSE', 'Razorpay test service returned invalid configuration.');
    }
    return value;
  }

  async createOrder(amountPaise: number, idempotencyKey: string): Promise<RazorpayTestOrder> {
    const response = await this.request('/api/razorpay/test/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ amountPaise, externalId: `portal:${idempotencyKey}` }),
    });
    return this.readOrder(response);
  }

  async getOrder(id: string): Promise<RazorpayTestOrder> {
    return this.readOrder(await this.request(`/api/razorpay/test/orders/${encodeURIComponent(id)}`, { method: 'GET' }));
  }

  async verifyOrder(id: string, payload: VerifyRazorpayTestRequest): Promise<RazorpayTestOrder> {
    const response = await this.request(`/api/razorpay/test/orders/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return this.readOrder(response);
  }
  async forwardWebhook(raw: ArrayBuffer, eventId: string, signature: string): Promise<Response> {
    return this.request('/api/razorpay/test/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Event-Id': eventId,
        'X-Razorpay-Signature': signature,
      },
      body: raw,
    }, false, false);
  }

  private async readOrder(response: Response): Promise<RazorpayTestOrder> {
    const value = await readJson(response);
    if (!isRazorpayTestOrder(value)) {
      throw new RazorpayTestProxyError(502, 'RAZORPAY_TEST_INVALID_RESPONSE', 'Razorpay test service returned an invalid order.');
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
      throw new RazorpayTestProxyError(502, 'RAZORPAY_TEST_UNAVAILABLE', 'Razorpay test service is temporarily unavailable.');
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

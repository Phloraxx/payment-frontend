import {
  isPaymentAccountsResponse,
  isPublicPayment,
  type PaymentAccountId,
  type PaymentAccountsResponse,
  type PublicPayment,
} from '../shared/payment.js';

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ERROR_MESSAGE_LENGTH = 240;

export class PayGateError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface PayGateErrorPayload {
  code?: unknown;
  message?: unknown;
}

function safeErrorMessage(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function normalisePayment(value: unknown): PublicPayment {
  if (!isPublicPayment(value)) {
    throw new PayGateError(502, 'INVALID_UPSTREAM_RESPONSE', 'PayGate returned an invalid payment response.');
  }
  return value;
}

async function readPaymentResponse(response: Response): Promise<PublicPayment> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new PayGateError(502, 'INVALID_UPSTREAM_RESPONSE', 'PayGate returned an invalid payment response.');
  }
  return normalisePayment(value);
}

export class PayGateClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async createPayment(amount: number, idempotencyKey: string, paymentAccount: PaymentAccountId): Promise<PublicPayment> {
    const response = await this.request('/api/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ amount, paymentAccount }),
    });
    const payment = await readPaymentResponse(response);
    if (!payment.upiUri) {
      throw new PayGateError(502, 'INVALID_UPSTREAM_RESPONSE', 'PayGate did not provide a UPI URI for the new payment.');
    }
    return payment;
  }

  async getPaymentAccounts(): Promise<PaymentAccountsResponse> {
    const response = await this.request('/api/payment-accounts', {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.apiKey}` },
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new PayGateError(502, 'INVALID_UPSTREAM_RESPONSE', 'PayGate returned invalid payment accounts.');
    }
    if (!isPaymentAccountsResponse(value)) {
      throw new PayGateError(502, 'INVALID_UPSTREAM_RESPONSE', 'PayGate returned invalid payment accounts.');
    }
    return value;
  }

  async getPayment(id: string): Promise<PublicPayment> {
    const response = await this.request(`/api/payments/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return readPaymentResponse(response);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new PayGateError(502, 'PAYGATE_UNAVAILABLE', 'Payment service is temporarily unavailable.');
    }

    if (response.ok) return response;

    let payload: PayGateErrorPayload = {};
    try {
      payload = (await response.json()) as PayGateErrorPayload;
    } catch {
      // Keep the safe generic message below.
    }

    const upstreamStatus = response.status;
    // Authentication failures indicate a server configuration problem and
    // should not expose the upstream credential boundary to public callers.
    const safeStatus = upstreamStatus >= 400 && upstreamStatus < 500 && ![401, 403].includes(upstreamStatus) ? upstreamStatus : 502;
    const code = typeof payload.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(payload.code) ? payload.code : 'PAYGATE_REQUEST_FAILED';
    const fallback = safeStatus === 429 ? 'Too many payment requests. Please wait and try again.' : 'Payment request failed.';
    const publicCode = [401, 403].includes(upstreamStatus) ? 'PAYGATE_UNAVAILABLE' : code;
    const publicMessage = [401, 403].includes(upstreamStatus)
      ? 'Payment service is temporarily unavailable.'
      : safeErrorMessage(payload.message, fallback);
    throw new PayGateError(safeStatus, publicCode, publicMessage);
  }
}

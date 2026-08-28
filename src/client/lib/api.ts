import type { ApiErrorBody, CreatePaymentRequest, PaymentAccountsResponse, PublicPayment } from '../../shared/payment.js';
import {
  isRazorpayLiveConfig,
  isRazorpayLiveOrder,
  type CreateRazorpayLiveRequest,
  type RazorpayLiveConfig,
  type RazorpayLiveOrder,
  type VerifyRazorpayLiveRequest,
} from '../../shared/razorpay-live.js';
import { isPaymentAccountsResponse, isPublicPayment } from '../../shared/payment.js';
import {
  isRazorpayTestConfig,
  isRazorpayTestOrder,
  type CreateRazorpayTestRequest,
  type RazorpayTestConfig,
  type RazorpayTestOrder,
  type VerifyRazorpayTestRequest,
} from '../../shared/razorpay.js';

export class ClientApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function checkoutBase(): string {
  const raw = import.meta.env.VITE_PAYGATE_CHECKOUT_URL?.trim() || 'https://pay.mulearnscet.in';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ClientApiError('CHECKOUT_NOT_CONFIGURED', 'PayGate checkout is not configured.', 503);
  }
  const localHTTP = url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHTTP) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ClientApiError('CHECKOUT_NOT_CONFIGURED', 'PayGate checkout is not configured.', 503);
  }
  return url.origin;
}

function checkoutURL(path: string): string {
  return `${checkoutBase()}${path}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ClientApiError('INVALID_SERVER_RESPONSE', 'The server returned an invalid response.', 502);
  }
}

async function requestPayment(url: string, init?: RequestInit): Promise<PublicPayment> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = await readJson(response);

  if (!response.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ClientApiError(
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : 'Payment request failed.',
      response.status,
    );
  }
  if (!isPublicPayment(body)) {
    throw new ClientApiError('INVALID_SERVER_RESPONSE', 'The server returned an invalid payment response.', 502);
  }
  return body;
}

export function createPayment(input: CreatePaymentRequest): Promise<PublicPayment> {
  return requestPayment(checkoutURL('/api/checkout/v2/payments'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.requestId },
    body: JSON.stringify({ amount: input.amount, paymentAccount: input.paymentAccount }),
  });
}

export function getPayment(id: string, signal?: AbortSignal): Promise<PublicPayment> {
  return requestPayment(
    checkoutURL(`/api/checkout/v2/payments/${encodeURIComponent(id)}`),
    { signal },
  );
}

export async function getPaymentAccounts(): Promise<PaymentAccountsResponse> {
  const response = await fetch(checkoutURL('/api/checkout/v2/payment-accounts'), {
    headers: { Accept: 'application/json' }, cache: 'no-store' });
  const body = await readJson(response);
  if (!response.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ClientApiError(
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : 'Payment accounts are unavailable.',
      response.status,
    );
  }
  if (!isPaymentAccountsResponse(body)) {
    throw new ClientApiError('INVALID_SERVER_RESPONSE', 'The server returned invalid payment accounts.', 502);
  }
  return body;
}


async function requestRazorpay<T>(
  url: string,
  validate: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ClientApiError(
      typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error.message === 'string' ? error.message : 'Razorpay test request failed.',
      response.status,
    );
  }
  if (!validate(body)) {
    throw new ClientApiError('INVALID_SERVER_RESPONSE', 'The server returned an invalid Razorpay test response.', 502);
  }
  return body;
}

function razorpayPath(mode: 'test' | 'live', suffix: string): string {
  return checkoutURL(`/api/checkout/v2/razorpay/${mode}${suffix}`);
}

export function getRazorpayTestConfig(): Promise<RazorpayTestConfig> {
  return requestRazorpay(razorpayPath('test', '/config'), isRazorpayTestConfig);
}

export function createRazorpayTestOrder(input: CreateRazorpayTestRequest): Promise<RazorpayTestOrder> {
  return requestRazorpay(razorpayPath('test', '/orders'), isRazorpayTestOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.requestId },
    body: JSON.stringify({ amount: input.amount }),
  });
}

export function getRazorpayTestOrder(id: string, signal?: AbortSignal): Promise<RazorpayTestOrder> {
  return requestRazorpay(razorpayPath('test', `/orders/${encodeURIComponent(id)}`), isRazorpayTestOrder, { signal });
}

export function verifyRazorpayTestOrder(
  id: string,
  input: VerifyRazorpayTestRequest,
): Promise<RazorpayTestOrder> {
  return requestRazorpay(razorpayPath('test', `/orders/${encodeURIComponent(id)}/verify`), isRazorpayTestOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getRazorpayLiveConfig(): Promise<RazorpayLiveConfig> {
  return requestRazorpay(razorpayPath('live', '/config'), isRazorpayLiveConfig);
}

export function createRazorpayLiveOrder(input: CreateRazorpayLiveRequest): Promise<RazorpayLiveOrder> {
  return requestRazorpay(razorpayPath('live', '/orders'), isRazorpayLiveOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.requestId },
    body: JSON.stringify({ amount: input.amount }),
  });
}

export function getRazorpayLiveOrder(id: string, signal?: AbortSignal): Promise<RazorpayLiveOrder> {
  return requestRazorpay(razorpayPath('live', `/orders/${encodeURIComponent(id)}`), isRazorpayLiveOrder, { signal });
}

export function verifyRazorpayLiveOrder(
  id: string,
  input: VerifyRazorpayLiveRequest,
): Promise<RazorpayLiveOrder> {
  return requestRazorpay(razorpayPath('live', `/orders/${encodeURIComponent(id)}/verify`), isRazorpayLiveOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}


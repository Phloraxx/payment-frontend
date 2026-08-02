import type { ApiErrorBody, CreatePaymentRequest, PublicPayment } from '../../shared/payment.js';
import { isPublicPayment } from '../../shared/payment.js';
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
  return requestPayment('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getPayment(id: string, signal?: AbortSignal): Promise<PublicPayment> {
  return requestPayment(`/api/payments/${encodeURIComponent(id)}`, { signal });
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

export function getRazorpayTestConfig(): Promise<RazorpayTestConfig> {
  return requestRazorpay('/api/razorpay/test/config', isRazorpayTestConfig);
}

export function createRazorpayTestOrder(input: CreateRazorpayTestRequest): Promise<RazorpayTestOrder> {
  return requestRazorpay('/api/razorpay/test/orders', isRazorpayTestOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getRazorpayTestOrder(id: string, signal?: AbortSignal): Promise<RazorpayTestOrder> {
  return requestRazorpay(`/api/razorpay/test/orders/${encodeURIComponent(id)}`, isRazorpayTestOrder, { signal });
}

export function verifyRazorpayTestOrder(
  id: string,
  input: VerifyRazorpayTestRequest,
): Promise<RazorpayTestOrder> {
  return requestRazorpay(`/api/razorpay/test/orders/${encodeURIComponent(id)}/verify`, isRazorpayTestOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

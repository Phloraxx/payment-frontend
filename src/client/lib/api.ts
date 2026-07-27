import type { ApiErrorBody, CreatePaymentRequest, PublicPayment } from '../../shared/payment.js';
import { isPublicPayment } from '../../shared/payment.js';

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

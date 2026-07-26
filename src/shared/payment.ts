export const PAYMENT_STATUSES = ['pending', 'paid', 'expired', 'cancelled', 'late'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PublicPayment {
  id: string;
  requestedAmount: number;
  requestedAmountPaise: number;
  payableAmount: string;
  payableAmountPaise: number;
  status: PaymentStatus;
  expiresAt: string;
  paidAt: string | null;
  upiUri?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  requestId: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

function parseFormattedPaise(value: string): number | undefined {
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) return undefined;
  const rupees = Number(match[1]);
  const paise = Number(match[2]);
  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise)) return undefined;
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : undefined;
}

export function isPublicPayment(value: unknown): value is PublicPayment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const formattedPayablePaise = typeof item.payableAmount === 'string' ? parseFormattedPaise(item.payableAmount) : undefined;
  if (
    typeof item.id !== 'string' ||
    !/^[a-z0-9_-]{8,64}$/i.test(item.id) ||
    typeof item.requestedAmount !== 'number' ||
    !Number.isSafeInteger(item.requestedAmount) ||
    item.requestedAmount <= 0 ||
    typeof item.requestedAmountPaise !== 'number' ||
    !Number.isSafeInteger(item.requestedAmountPaise) ||
    item.requestedAmountPaise !== item.requestedAmount * 100 ||
    typeof item.payableAmount !== 'string' ||
    formattedPayablePaise === undefined ||
    typeof item.payableAmountPaise !== 'number' ||
    !Number.isSafeInteger(item.payableAmountPaise) ||
    item.payableAmountPaise <= item.requestedAmountPaise ||
    item.payableAmountPaise >= item.requestedAmountPaise + 100 ||
    formattedPayablePaise !== item.payableAmountPaise ||
    !isPaymentStatus(item.status) ||
    typeof item.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(item.expiresAt)) ||
    !(item.paidAt === null || (typeof item.paidAt === 'string' && Number.isFinite(Date.parse(item.paidAt)))) ||
    !(item.upiUri === undefined || (typeof item.upiUri === 'string' && item.upiUri.length <= 4096 && item.upiUri.startsWith('upi://pay?')))
  ) {
    return false;
  }
  return true;
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return status !== 'pending';
}

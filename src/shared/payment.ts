export const PAYMENT_STATUSES = ['pending', 'paid', 'expired', 'cancelled', 'late'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_ACCOUNTS = ['kotak', 'slice', 'paytm'] as const;
export type PaymentAccountId = (typeof PAYMENT_ACCOUNTS)[number];

export interface PaymentAccountOption {
  id: PaymentAccountId;
  label: string;
  verification: 'sms' | 'email' | 'notification';
}

export interface PaymentAccountsResponse {
  default: PaymentAccountId;
  accounts: PaymentAccountOption[];
}

export interface PublicPayment {
  id: string;
  paymentAccount: PaymentAccountId;
  paymentAccountLabel?: string;
  verificationMethod?: 'sms' | 'email' | 'notification';
  paymentFlow?: 'upi_intent' | 'merchant_qr';
  requestedAmount: number;
  requestedAmountPaise: number;
  payableAmount: string;
  payableAmountPaise: number;
  status: PaymentStatus;
  expiresAt: string;
  paidAt: string | null;
  upiUri?: string;
  qrPayload?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  requestId: string;
  paymentAccount: PaymentAccountId;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isPaymentAccount(value: unknown): value is PaymentAccountId {
  return typeof value === 'string' && (PAYMENT_ACCOUNTS as readonly string[]).includes(value);
}

export function isPaymentAccountsResponse(value: unknown): value is PaymentAccountsResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!isPaymentAccount(item.default) || !Array.isArray(item.accounts) || item.accounts.length < 1 || item.accounts.length > 3) return false;
  return item.accounts.every((account) => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) return false;
    const option = account as Record<string, unknown>;
    return isPaymentAccount(option.id) && typeof option.label === 'string' && option.label.length > 0 && option.label.length <= 40 &&
      (option.verification === 'sms' || option.verification === 'email' || option.verification === 'notification');
  }) && item.accounts.some((account) => (account as PaymentAccountOption).id === item.default);
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
    !isPaymentAccount(item.paymentAccount) ||
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
    !(item.paymentAccountLabel === undefined || (typeof item.paymentAccountLabel === 'string' && item.paymentAccountLabel.length <= 40)) ||
    !(item.verificationMethod === undefined || item.verificationMethod === 'sms' || item.verificationMethod === 'email' || item.verificationMethod === 'notification') ||
    !(item.paymentFlow === undefined || item.paymentFlow === 'upi_intent' || item.paymentFlow === 'merchant_qr') ||
    !(item.upiUri === undefined || (typeof item.upiUri === 'string' && item.upiUri.length <= 4096 && item.upiUri.startsWith('upi://pay?'))) ||
    !(item.qrPayload === undefined || (typeof item.qrPayload === 'string' && item.qrPayload.length > 0 && item.qrPayload.length <= 8192)) ||
    (item.paymentFlow === 'upi_intent' && item.qrPayload !== undefined) ||
    (item.paymentFlow === 'merchant_qr' && item.upiUri !== undefined)
  ) {
    return false;
  }
  return true;
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return status !== 'pending';
}

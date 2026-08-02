export const RAZORPAY_TEST_STATUSES = [
  'creating',
  'create_failed',
  'created',
  'verification_pending',
  'authorized',
  'captured',
  'failed',
  'partially_refunded',
  'refunded',
] as const;

export type RazorpayTestStatus = (typeof RAZORPAY_TEST_STATUSES)[number];

export interface RazorpayTestConfig {
  enabled: boolean;
  keyId: string;
  displayName: string;
  mode: 'test';
}

export interface RazorpayTestOrder {
  id: string;
  amountPaise: number;
  currency: 'INR';
  status: RazorpayTestStatus;
  externalId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  providerStatus: string;
  paymentMethod: string;
  amountRefunded: number;
  error: string;
  createdAt: string;
  capturedAt: string;
  keyId: string;
  displayName: string;
}
export interface CreateRazorpayTestRequest {
  amount: number;
  requestId: string;
}

export interface VerifyRazorpayTestRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function isOptionalDate(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || Number.isFinite(Date.parse(value)));
}

export function isRazorpayTestStatus(value: unknown): value is RazorpayTestStatus {
  return typeof value === 'string' && (RAZORPAY_TEST_STATUSES as readonly string[]).includes(value);
}

export function isRazorpayTestConfig(value: unknown): value is RazorpayTestConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.enabled === 'boolean' &&
    typeof item.keyId === 'string' &&
    (!item.enabled || /^rzp_test_[A-Za-z0-9]+$/.test(item.keyId)) &&
    typeof item.displayName === 'string' &&
    item.displayName.length <= 120 &&
    item.mode === 'test'
  );
}

export function isRazorpayTestOrder(value: unknown): value is RazorpayTestOrder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && /^[a-z0-9_-]{8,64}$/i.test(item.id) &&
    typeof item.amountPaise === 'number' && Number.isSafeInteger(item.amountPaise) && item.amountPaise >= 100 &&
    item.currency === 'INR' && isRazorpayTestStatus(item.status) &&
    typeof item.externalId === 'string' && item.externalId.length <= 255 &&
    typeof item.razorpayOrderId === 'string' && (item.razorpayOrderId === '' || /^order_[A-Za-z0-9]+$/.test(item.razorpayOrderId)) &&
    typeof item.razorpayPaymentId === 'string' && (item.razorpayPaymentId === '' || /^pay_[A-Za-z0-9_]+$/.test(item.razorpayPaymentId)) &&
    typeof item.providerStatus === 'string' && item.providerStatus.length <= 64 &&
    typeof item.paymentMethod === 'string' && item.paymentMethod.length <= 64 &&
    typeof item.amountRefunded === 'number' && Number.isSafeInteger(item.amountRefunded) && item.amountRefunded >= 0 &&
    typeof item.error === 'string' && item.error.length <= 4096 &&
    typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) &&
    isOptionalDate(item.capturedAt) &&
    typeof item.keyId === 'string' && /^rzp_test_[A-Za-z0-9]+$/.test(item.keyId) &&
    typeof item.displayName === 'string' && item.displayName.length <= 120
  );
}

export function isRazorpayTestTerminal(status: RazorpayTestStatus): boolean {
  return ['captured', 'failed', 'partially_refunded', 'refunded', 'create_failed'].includes(status);
}

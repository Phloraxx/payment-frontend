export const RAZORPAY_LIVE_STATUSES = [
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

export type RazorpayLiveStatus = (typeof RAZORPAY_LIVE_STATUSES)[number];

export interface RazorpayLiveConfig {
  enabled: boolean;
  keyId: string;
  displayName: string;
  mode: 'live';
}


export interface RazorpayLiveBank {
  code: string;
  name: string;
}

export interface RazorpayLiveMethods {
  mode: 'live';
  netbanking: RazorpayLiveBank[];
  upiIntentAvailable: boolean;
  upiQrAvailable: boolean;
}

export interface RazorpayLiveOrder {
  id: string;
  amountPaise: number;
  currency: 'INR';
  status: RazorpayLiveStatus;
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
export interface CreateRazorpayLiveRequest {
  amount: number;
  requestId: string;
}

export interface VerifyRazorpayLiveRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

function isOptionalDate(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || Number.isFinite(Date.parse(value)));
}

export function isRazorpayLiveStatus(value: unknown): value is RazorpayLiveStatus {
  return typeof value === 'string' && (RAZORPAY_LIVE_STATUSES as readonly string[]).includes(value);
}

export function isRazorpayLiveConfig(value: unknown): value is RazorpayLiveConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.enabled === 'boolean' &&
    typeof item.keyId === 'string' &&
    (!item.enabled || /^rzp_live_[A-Za-z0-9]+$/.test(item.keyId)) &&
    typeof item.displayName === 'string' &&
    item.displayName.length <= 120 &&
    item.mode === 'live'
  );
}


export function isRazorpayLiveMethods(value: unknown): value is RazorpayLiveMethods {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    item.mode !== 'live' ||
    typeof item.upiIntentAvailable !== 'boolean' ||
    typeof item.upiQrAvailable !== 'boolean' ||
    !Array.isArray(item.netbanking) ||
    item.netbanking.length > 100
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const bank of item.netbanking) {
    if (!bank || typeof bank !== 'object' || Array.isArray(bank)) return false;
    const entry = bank as Record<string, unknown>;
    if (
      typeof entry.code !== 'string' ||
      !/^[A-Z0-9_]{2,16}$/.test(entry.code) ||
      seen.has(entry.code) ||
      typeof entry.name !== 'string' ||
      entry.name.trim() !== entry.name ||
      entry.name.length < 2 ||
      entry.name.length > 120
    ) {
      return false;
    }
    seen.add(entry.code);
  }
  return true;
}

export function isRazorpayLiveOrder(value: unknown): value is RazorpayLiveOrder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' && /^[a-z0-9_-]{8,64}$/i.test(item.id) &&
    typeof item.amountPaise === 'number' && Number.isSafeInteger(item.amountPaise) && item.amountPaise === 100 &&
    item.currency === 'INR' && isRazorpayLiveStatus(item.status) &&
    typeof item.externalId === 'string' && item.externalId.length <= 255 &&
    typeof item.razorpayOrderId === 'string' && (item.razorpayOrderId === '' || /^order_[A-Za-z0-9]+$/.test(item.razorpayOrderId)) &&
    typeof item.razorpayPaymentId === 'string' && (item.razorpayPaymentId === '' || /^pay_[A-Za-z0-9_]+$/.test(item.razorpayPaymentId)) &&
    typeof item.providerStatus === 'string' && item.providerStatus.length <= 64 &&
    typeof item.paymentMethod === 'string' && item.paymentMethod.length <= 64 &&
    typeof item.amountRefunded === 'number' && Number.isSafeInteger(item.amountRefunded) && item.amountRefunded >= 0 &&
    typeof item.error === 'string' && item.error.length <= 4096 &&
    typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) &&
    isOptionalDate(item.capturedAt) &&
    typeof item.keyId === 'string' && /^rzp_live_[A-Za-z0-9]+$/.test(item.keyId) &&
    typeof item.displayName === 'string' && item.displayName.length <= 120
  );
}

export function isRazorpayLiveTerminal(status: RazorpayLiveStatus): boolean {
  return ['captured', 'failed', 'partially_refunded', 'refunded', 'create_failed'].includes(status);
}

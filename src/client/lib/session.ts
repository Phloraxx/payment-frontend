import { isPublicPayment, type PaymentAccountId, type PublicPayment } from '../../shared/payment.js';

const PREFIX = 'paygate:payment:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CREATE_DRAFT_KEY = 'paygate:create-draft';
const RAZORPAY_CREATE_DRAFT_KEY = 'paygate:razorpay-test-create-draft';
const RAZORPAY_LIVE_CREATE_DRAFT_KEY = 'paygate:razorpay-live-create-draft';
const CREATE_DRAFT_MAX_AGE_MS = 15 * 60 * 1000;

interface StoredPaymentSession {
  savedAt: number;
  payment: PublicPayment;
}

interface StoredCreateDraft {
  savedAt: number;
  amount: number;
  paymentAccount?: PaymentAccountId;
  requestId: string;
}

function key(id: string): string {
  return `${PREFIX}${id}`;
}

function safeRemove(storageKey: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Browser storage is optional client-side resilience only.
  }
}

function safeRemoveSession(storageKey: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Optional client-side resilience only.
  }
}

export function savePaymentSession(payment: PublicPayment): void {
  if (!payment.upiUri || typeof localStorage === 'undefined') return;
  const payload: StoredPaymentSession = { savedAt: Date.now(), payment };
  try {
    localStorage.setItem(key(payment.id), JSON.stringify(payload));
  } catch {
    // Browser storage is an optional refresh convenience, never a correctness dependency.
  }
}

export function loadPaymentSession(id: string): PublicPayment | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredPaymentSession;
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS || !isPublicPayment(parsed.payment)) {
      safeRemove(key(id));
      return undefined;
    }
    return parsed.payment;
  } catch {
    safeRemove(key(id));
    return undefined;
  }
}

export function clearPaymentSession(id: string): void {
  safeRemove(key(id));
}

function getOrCreateDraftRequestId(storageKey: string, amount: number, paymentAccount?: PaymentAccountId): string {
  const fresh = () => {
    const requestId = crypto.randomUUID();
    if (typeof sessionStorage !== 'undefined') {
      try {
        const draft: StoredCreateDraft = { savedAt: Date.now(), amount, paymentAccount, requestId };
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // The in-flight request still has a valid UUID even if persistence is unavailable.
      }
    }
    return requestId;
  };

  if (typeof sessionStorage === 'undefined') return fresh();
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return fresh();
    const draft = JSON.parse(raw) as StoredCreateDraft;
    const valid =
      draft &&
      draft.amount === amount &&
      draft.paymentAccount === paymentAccount &&
      typeof draft.savedAt === 'number' &&
      Date.now() - draft.savedAt <= CREATE_DRAFT_MAX_AGE_MS &&
      typeof draft.requestId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.requestId);
    return valid ? draft.requestId : fresh();
  } catch {
    return fresh();
  }
}

export function getOrCreateRequestId(amount: number, paymentAccount: PaymentAccountId): string {
  return getOrCreateDraftRequestId(CREATE_DRAFT_KEY, amount, paymentAccount);
}

export function getOrCreateRazorpayRequestId(amount: number): string {
  return getOrCreateDraftRequestId(RAZORPAY_CREATE_DRAFT_KEY, amount);
}

export function getOrCreateRazorpayLiveRequestId(amount: number): string {
  return getOrCreateDraftRequestId(RAZORPAY_LIVE_CREATE_DRAFT_KEY, amount);
}

export function clearRazorpayLiveCreateDraft(): void {
  safeRemoveSession(RAZORPAY_LIVE_CREATE_DRAFT_KEY);
}

export function clearCreateDraft(): void {
  safeRemoveSession(CREATE_DRAFT_KEY);
}

export function clearRazorpayCreateDraft(): void {
  safeRemoveSession(RAZORPAY_CREATE_DRAFT_KEY);
}

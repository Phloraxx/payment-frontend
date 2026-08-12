import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCreateDraft, clearRazorpayCreateDraft, getOrCreateRazorpayRequestId, getOrCreateRequestId, loadPaymentSession, savePaymentSession } from './session.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const payment = {
  id: 'abcdefghijklmno',
  paymentAccount: 'kotak' as const,
  requestedAmount: 100,
  requestedAmountPaise: 10000,
  payableAmount: '100.37',
  payableAmountPaise: 10037,
  status: 'pending' as const,
  expiresAt: '2026-07-26T17:30:00Z',
  paidAt: null,
  upiUri: 'upi://pay?pa=test%40bank&am=100.37',
};

describe('client session resilience', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('reuses an idempotency UUID for the same amount until creation succeeds', () => {
    const first = getOrCreateRequestId(100, 'kotak');
    const retry = getOrCreateRequestId(100, 'kotak');
    expect(retry).toBe(first);

    const differentAmount = getOrCreateRequestId(101, 'kotak');
    expect(differentAmount).not.toBe(first);

    clearCreateDraft();
    expect(getOrCreateRequestId(101, 'kotak')).not.toBe(differentAmount);
  });

  it('stores only validated pending payment session data', () => {
    savePaymentSession(payment);
    expect(loadPaymentSession(payment.id)).toEqual(payment);
  });

  it('treats storage as optional rather than breaking a successful payment', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
      },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
      },
    });
    expect(() => savePaymentSession(payment)).not.toThrow();
    expect(loadPaymentSession(payment.id)).toBeUndefined();
    expect(() => getOrCreateRequestId(100, 'kotak')).not.toThrow();
  });

  it('keeps Razorpay Test idempotency separate from direct UPI', () => {
    const upi = getOrCreateRequestId(100, 'kotak');
    const razorpay = getOrCreateRazorpayRequestId(100);
    expect(razorpay).not.toBe(upi);
    expect(getOrCreateRazorpayRequestId(100)).toBe(razorpay);
    clearRazorpayCreateDraft();
    expect(getOrCreateRazorpayRequestId(100)).not.toBe(razorpay);
  });

});

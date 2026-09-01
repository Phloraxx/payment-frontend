import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCreateDraft, clearRazorpayCreateDraft, getOrCreateRazorpayRequestId, getOrCreateRequestId, loadPaymentSession, savePaymentSession } from './session.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}
const payment = {
  id: 'pay_abcdefghijklmno', name: 'Sourav P Bijoy', externalId: 'evt_123', metadata: {}, status: 'pending' as const,
  requestedAmount: '100.00', requestedAmountPaise: 10000, payableAmount: '100.37', payableAmountPaise: 10037,
  adjustment: '0.37', adjustmentPaise: 37, upiUri: 'upi://pay?pa=test%40bank&am=100.37&cu=INR',
  createdAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-01T10:05:00Z', graceUntil: '2026-09-01T10:10:00Z', paidAt: null,
};

describe('client session resilience', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  });
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(globalThis, 'localStorage'); Reflect.deleteProperty(globalThis, 'sessionStorage'); });

  it('scopes a retry id to amount + person name + event id', () => {
    const first = getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_123');
    expect(getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_123')).toBe(first);
    expect(getOrCreateRequestId(100, 'Another Person', 'evt_123')).not.toBe(first);
    expect(getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_124')).not.toBe(first);
    clearCreateDraft();
    expect(getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_124')).not.toBe(first);
  });
  it('stores only validated payment session data', () => { savePaymentSession(payment); expect(loadPaymentSession(payment.id)).toEqual(payment); });
  it('treats browser storage as optional', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: blocked });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: blocked });
    expect(() => savePaymentSession(payment)).not.toThrow(); expect(loadPaymentSession(payment.id)).toBeUndefined();
    expect(() => getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_123')).not.toThrow();
  });
  it('keeps Razorpay Test idempotency separate from PayGate v4', () => {
    const paygate = getOrCreateRequestId(100, 'Sourav P Bijoy', 'evt_123');
    const razorpay = getOrCreateRazorpayRequestId(100);
    expect(razorpay).not.toBe(paygate); expect(getOrCreateRazorpayRequestId(100)).toBe(razorpay);
    clearRazorpayCreateDraft(); expect(getOrCreateRazorpayRequestId(100)).not.toBe(razorpay);
  });
});

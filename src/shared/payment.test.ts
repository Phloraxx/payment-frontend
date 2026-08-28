import { describe, expect, it } from 'vitest';

import { isPaymentAccountsResponse, isPublicPayment } from './payment.js';

const payment = {
  id: 'abcdefghijklmno',
  paymentAccount: 'kotak',
  requestedAmount: 100,
  requestedAmountPaise: 10000,
  payableAmount: '100.37',
  payableAmountPaise: 10037,
  status: 'pending',
  expiresAt: '2026-07-26T17:30:00Z',
  paidAt: null,
  upiUri: 'upi://pay?pa=test%40bank&am=100.37',
};

describe('isPublicPayment', () => {
  it('accepts an exact DDM response without floating-point money arithmetic', () => {
    expect(isPublicPayment(payment)).toBe(true);
    expect(isPublicPayment({ ...payment, payableAmount: '999999999999.99', payableAmountPaise: 99999999999999 })).toBe(false);
  });

  it('rejects inconsistent or unsafe UPI data', () => {
    expect(isPublicPayment({ ...payment, payableAmount: '100.38' })).toBe(false);
    expect(isPublicPayment({ ...payment, upiUri: 'javascript:alert(1)' })).toBe(false);
    expect(isPublicPayment({ ...payment, status: 'refunded' })).toBe(false);
  });
});


describe('isPaymentAccountsResponse', () => {
  it('accepts readiness and QR-only metadata from PayGate', () => {
    expect(isPaymentAccountsResponse({
      default: 'paytm',
      accounts: [
        { id: 'kotak', label: 'Kotak', verification: 'sms', flow: 'upi_intent', ready: true },
        { id: 'paytm', label: 'Paytm', verification: 'notification', flow: 'qr_only', ready: false, unavailableReason: 'Relay offline' },
      ],
    })).toBe(true);
  });

  it('rejects invalid readiness metadata', () => {
    expect(isPaymentAccountsResponse({
      default: 'paytm',
      accounts: [{ id: 'paytm', label: 'Paytm', verification: 'notification', flow: 'unknown', ready: 'yes' }],
    })).toBe(false);
  });

  it('requires capability and readiness metadata', () => {
    expect(isPaymentAccountsResponse({
      default: 'paytm',
      accounts: [{ id: 'paytm', label: 'Paytm', verification: 'notification' }],
    })).toBe(false);
  });
});

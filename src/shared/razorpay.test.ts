import { describe, expect, it } from 'vitest';

import { isRazorpayTestConfig, isRazorpayTestMethods, isRazorpayTestOrder } from './razorpay.js';

const order = {
  id: 'razorpayorder01', amountPaise: 100, currency: 'INR', status: 'created', externalId: 'portal:test',
  razorpayOrderId: 'order_public123', razorpayPaymentId: '', providerStatus: 'created', paymentMethod: '',
  amountRefunded: 0, error: '', createdAt: '2026-08-02T12:00:00Z', capturedAt: '',
  keyId: 'rzp_test_public123', displayName: 'IEEE Sahrdaya Razorpay Test',
};

describe('Razorpay Test response validation', () => {
  it('accepts only Test Mode public configuration', () => {
    expect(isRazorpayTestConfig({ enabled: true, keyId: 'rzp_test_public123', displayName: 'Test', mode: 'test' })).toBe(true);
    expect(isRazorpayTestConfig({ enabled: true, keyId: 'rzp_live_public123', displayName: 'Test', mode: 'test' })).toBe(false);
  });

  it('rejects inconsistent order values and live keys', () => {
    expect(isRazorpayTestOrder(order)).toBe(true);
    expect(isRazorpayTestOrder({ ...order, amountPaise: 1.5 })).toBe(false);
    expect(isRazorpayTestOrder({ ...order, keyId: 'rzp_live_public123' })).toBe(false);
    expect(isRazorpayTestOrder({ ...order, razorpayOrderId: 'javascript:bad' })).toBe(false);
  });

  it('accepts only normalized unique enabled bank methods', () => {
    const methods = {
      mode: 'test',
      netbanking: [
        { code: 'AUBL', name: 'AU Small Finance Bank' },
        { code: 'YESB', name: 'Yes Bank' },
      ],
      upiIntentAvailable: true,
      upiQrAvailable: false,
    };
    expect(isRazorpayTestMethods(methods)).toBe(true);
    expect(isRazorpayTestMethods({ ...methods, netbanking: [...methods.netbanking, methods.netbanking[0]] })).toBe(false);
    expect(isRazorpayTestMethods({ ...methods, netbanking: [{ code: 'bad code', name: 'Bad Bank' }] })).toBe(false);
  });

});

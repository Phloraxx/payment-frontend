import { describe, expect, it } from 'vitest';

import { isRazorpayLiveConfig, isRazorpayLiveMethods, isRazorpayLiveOrder } from './razorpay-live.js';

const order = {
  id: 'razorpayorder01', amountPaise: 100, currency: 'INR', status: 'created', externalId: 'portal:test',
  razorpayOrderId: 'order_public123', razorpayPaymentId: '', providerStatus: 'created', paymentMethod: '',
  amountRefunded: 0, error: '', createdAt: '2026-08-02T12:00:00Z', capturedAt: '',
  keyId: 'rzp_live_public123', displayName: 'IEEE Sahrdaya Razorpay Live',
};

describe('Razorpay Live response validation', () => {
  it('accepts only Live Mode public configuration', () => {
    expect(isRazorpayLiveConfig({ enabled: true, keyId: 'rzp_live_public123', displayName: 'Test', mode: 'live' })).toBe(true);
    expect(isRazorpayLiveConfig({ enabled: true, keyId: 'rzp_test_public123', displayName: 'Live', mode: 'live' })).toBe(false);
  });

  it('rejects inconsistent order values and live keys', () => {
    expect(isRazorpayLiveOrder(order)).toBe(true);
    expect(isRazorpayLiveOrder({ ...order, amountPaise: 200 })).toBe(false);
    expect(isRazorpayLiveOrder({ ...order, keyId: 'rzp_test_public123' })).toBe(false);
    expect(isRazorpayLiveOrder({ ...order, razorpayOrderId: 'javascript:bad' })).toBe(false);
  });

  it('accepts only normalized unique enabled bank methods', () => {
    const methods = {
      mode: 'live',
      netbanking: [
        { code: 'AUBL', name: 'AU Small Finance Bank' },
        { code: 'YESB', name: 'Yes Bank' },
      ],
      upiIntentAvailable: true,
      upiQrAvailable: false,
    };
    expect(isRazorpayLiveMethods(methods)).toBe(true);
    expect(isRazorpayLiveMethods({ ...methods, netbanking: [...methods.netbanking, methods.netbanking[0]] })).toBe(false);
    expect(isRazorpayLiveMethods({ ...methods, netbanking: [{ code: 'bad code', name: 'Bad Bank' }] })).toBe(false);
  });

});

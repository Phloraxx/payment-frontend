import { describe, expect, it } from 'vitest';

import type { RazorpayTestOrder } from '../../shared/razorpay.js';
import { buildNetbankingTestPayment, buildRazorpayCallbackUrl, razorpayPaymentErrorMessage, RAZORPAY_CUSTOM_SCRIPT_URL } from './razorpay-custom.js';

const order: RazorpayTestOrder = {
  id: 'razorpayorder01', amountPaise: 12500, currency: 'INR', status: 'created', externalId: 'portal:test',
  razorpayOrderId: 'order_public123', razorpayPaymentId: '', providerStatus: 'created', paymentMethod: '',
  amountRefunded: 0, error: '', createdAt: '2026-08-02T12:00:00Z', capturedAt: '',
  keyId: 'rzp_test_public123', displayName: 'IEEE Sahrdaya Razorpay Test',
};

describe('Razorpay Custom Checkout data', () => {
  it('uses Razorpay’s official headless Custom Checkout script', () => {
    expect(RAZORPAY_CUSTOM_SCRIPT_URL).toBe('https://checkout.razorpay.com/v1/razorpay.js');
    expect(RAZORPAY_CUSTOM_SCRIPT_URL).not.toContain('checkout.js');
  });

  it("uses Razorpay's documented redirect flow for bank authentication", () => {
    const options: ConstructorParameters<NonNullable<Window['Razorpay']>>[0] = {
      key: 'rzp_test_public123',
      redirect: true,
      callback_url: buildRazorpayCallbackUrl('razorpayorder01', 'https://pay.ieeesahrdaya.com'),
    };
    expect(options.redirect).toBe(true);
    expect(options.callback_url).toBe('https://pay.ieeesahrdaya.com/api/razorpay/test/callback?order=razorpayorder01');
  });

  it('builds a bank-specific Test Mode payment without collecting customer data', () => {
    expect(buildNetbankingTestPayment(order, 'AUBL')).toEqual({
      amount: 12500,
      currency: 'INR',
      order_id: 'order_public123',
      method: 'netbanking',
      bank: 'AUBL',
      email: 'test@example.com',
      contact: '9123456780',
      description: 'IEEE Sahrdaya Razorpay Test payment',
    });
  });

  it('refuses invalid banks or a missing server-created order', () => {
    expect(() => buildNetbankingTestPayment(order, 'bad bank')).toThrow(/valid enabled bank/i);
    expect(() => buildNetbankingTestPayment({ ...order, razorpayOrderId: '' }, 'AUBL')).toThrow(/not ready/i);
  });

  it('keeps a safe provider error visible to the customer', () => {
    expect(razorpayPaymentErrorMessage({ error: { description: ' Payment\nwas cancelled. ' } })).toBe('Payment was cancelled.');
    expect(razorpayPaymentErrorMessage({})).toMatch(/failed or cancelled/i);
  });


  it('builds only same-origin HTTP(S) callback URLs', () => {
    expect(buildRazorpayCallbackUrl('razorpayorder01', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/razorpay/test/callback?order=razorpayorder01',
    );
    expect(() => buildRazorpayCallbackUrl('bad', 'https://pay.ieeesahrdaya.com')).toThrow(/callback ID/i);
    expect(() => buildRazorpayCallbackUrl('razorpayorder01', 'file:///tmp')).toThrow(/callback origin/i);
  });

});

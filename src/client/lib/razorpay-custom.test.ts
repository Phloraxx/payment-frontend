import { describe, expect, it } from 'vitest';

import type { RazorpayTestOrder } from '../../shared/razorpay.js';
import { buildNetbankingTestPayment, razorpayPaymentErrorMessage, RAZORPAY_CUSTOM_SCRIPT_URL } from './razorpay-custom.js';

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

  it('initializes Custom Checkout with only the public Key ID', () => {
    const options: ConstructorParameters<NonNullable<Window['Razorpay']>>[0] = {
      key: 'rzp_test_public123',
    };
    expect(options).toEqual({ key: 'rzp_test_public123' });
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


});

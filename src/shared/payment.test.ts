import { describe, expect, it } from 'vitest';
import { parsePublicPayment } from './payment.js';

const rawPayment = {
  id: 'pay_abcdefghijklmno', object: 'payment', name: 'Sourav P Bijoy', external_id: 'evt_123', metadata: {},
  status: 'pending', currency: 'INR', requested_amount: '100.00', payable_amount: '100.37', adjustment: '0.37',
  upi_uri: 'upi://pay?pa=test%40bank&pn=PayGate&am=100.37&cu=INR',
  created_at: '2026-09-01T10:00:00Z', expires_at: '2026-09-01T10:05:00Z', grace_until: '2026-09-01T10:10:00Z', paid_at: null,
};

describe('parsePublicPayment', () => {
  it('normalizes the v4 snake_case merchant response without provider fields', () => {
    expect(parsePublicPayment(rawPayment)).toMatchObject({
      id: rawPayment.id, name: 'Sourav P Bijoy', externalId: 'evt_123', requestedAmountPaise: 10000,
      payableAmountPaise: 10037, adjustmentPaise: 37, status: 'pending',
    });
  });
  it('rejects inconsistent money, legacy statuses, and unsafe UPI data', () => {
    expect(parsePublicPayment({ ...rawPayment, adjustment: '0.38' })).toBeUndefined();
    expect(parsePublicPayment({ ...rawPayment, status: 'late' })).toBeUndefined();
    expect(parsePublicPayment({ ...rawPayment, upi_uri: 'javascript:alert(1)' })).toBeUndefined();
  });
  it('returns observed payer information only when present', () => {
    const paid = parsePublicPayment({ ...rawPayment, status: 'paid', paid_at: '2026-09-01T10:03:00Z', payer: { name: 'Bijoy P', upi_id: 'bijoy@okaxis' } });
    expect(paid).toMatchObject({ payerName: 'Bijoy P', payerUpiId: 'bijoy@okaxis' });
  });
});

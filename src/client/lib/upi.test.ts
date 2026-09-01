import { describe, expect, it } from 'vitest';
import { getUpiId, getUpiPayeeName, isCanonicalUpiUri } from './upi.js';

describe('UPI helpers', () => {
  const uri = 'upi://pay?pa=sourav%40oksbi&pn=Sourav%20P%20Bijoy&am=100.37&cu=INR&tn=server-owned';
  it('reads display fields without rewriting the server-owned UPI string', () => {
    expect(getUpiId(uri)).toBe('sourav@oksbi');
    expect(getUpiPayeeName(uri)).toBe('Sourav P Bijoy');
    expect(isCanonicalUpiUri(uri)).toBe(true);
  });
  it('rejects non-UPI or incomplete instructions', () => {
    expect(isCanonicalUpiUri('https://example.com')).toBe(false);
    expect(isCanonicalUpiUri('upi://pay?pn=Sourav&am=100.37')).toBe(false);
  });
});

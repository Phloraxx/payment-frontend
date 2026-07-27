import { describe, expect, it } from 'vitest';

import { getUpiId, isAndroidUserAgent, toAndroidGooglePayIntent, toAndroidUpiIntent, toGooglePayUri, toPersonalUpiUri } from './upi.js';

describe('UPI launch helpers', () => {
  const merchantLike = 'upi://pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR&tr=payment_123&tn=payment_123&mc=1234';

  it('strips transaction and merchant fields for the personal P2P experiment', () => {
    expect(toPersonalUpiUri(merchantLike)).toBe('upi://pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR');
  });

  it('builds an Android intent wrapper around the minimal URI', () => {
    expect(toAndroidUpiIntent(merchantLike)).toBe(
      'intent://pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR#Intent;scheme=upi;end',
    );
  });

  it('builds Google Pay-specific links from the same personal URI', () => {
    expect(toGooglePayUri(merchantLike)).toBe('gpay://upi/pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR');
    expect(toAndroidGooglePayIntent(merchantLike)).toBe(
      'intent://upi/pay?pa=sourav%40oksbi&pn=Sourav&am=100.37&cu=INR#Intent;scheme=gpay;package=com.google.android.apps.nbu.paisa.user;end',
    );
  });

  it('extracts the payee UPI ID', () => {
    expect(getUpiId(merchantLike)).toBe('sourav@oksbi');
  });

  it('rejects non-UPI and malformed links', () => {
    expect(toPersonalUpiUri('https://example.com')).toBeNull();
    expect(toPersonalUpiUri('upi://pay?pn=Sourav&am=100.37')).toBeNull();
  });

  it('detects Android user agents', () => {
    expect(isAndroidUserAgent('Mozilla/5.0 (Linux; Android 16; Pixel 9)')).toBe(true);
    expect(isAndroidUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
  });
});

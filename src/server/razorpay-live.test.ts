import { describe, expect, it, vi } from 'vitest';

import { normalizeRazorpayLiveMethods, RazorpayLiveClient, RazorpayLiveProxyError } from './razorpay-live.js';

const config = {
  enabled: true,
  keyId: 'rzp_live_public123',
  displayName: 'IEEE Sahrdaya Razorpay Live',
  mode: 'live',
};

const rawMethods = {
  netbanking: {
    YESB: 'Yes Bank',
    AUBL: 'AU Small Finance Bank',
    'bad code': 'Invalid',
  },
  upi_intent: true,
  upi_config: [],
};

describe('Razorpay Live methods', () => {
  it('normalizes and alphabetically sorts enabled banks', () => {
    expect(normalizeRazorpayLiveMethods(rawMethods)).toEqual({
      mode: 'live',
      netbanking: [
        { code: 'AUBL', name: 'AU Small Finance Bank' },
        { code: 'YESB', name: 'Yes Bank' },
      ],
      upiIntentAvailable: true,
      upiQrAvailable: false,
    });
  });

  it('fetches methods with only the public Live Key ID and caches them', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/api/razorpay/live/config')) {
        return Response.json(config);
      }
      expect(String(url)).toBe('https://api.razorpay.com/v1/methods');
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Basic ${Buffer.from('rzp_live_public123:').toString('base64')}`);
      return Response.json(rawMethods);
    });
    const client = new RazorpayLiveClient('http://internal.test', 'i'.repeat(32), fetchMock);
    await expect(client.getMethods()).resolves.toMatchObject({ netbanking: [{ code: 'AUBL' }, { code: 'YESB' }] });
    await expect(client.getMethods()).resolves.toMatchObject({ upiIntentAvailable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('key_secret');
  });

  it('fails closed on malformed provider method data', () => {
    expect(() => normalizeRazorpayLiveMethods({ netbanking: [] })).toThrow(RazorpayLiveProxyError);
  });

  it('rejects an oversized external Methods API response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/api/razorpay/live/config')) return Response.json(config);
      return new Response('x'.repeat(300_000), { status: 200 });
    });
    const client = new RazorpayLiveClient('http://internal.test', 'i'.repeat(32), fetchMock);
    await expect(client.getMethods()).rejects.toMatchObject({ code: 'RAZORPAY_LIVE_INVALID_METHODS' });
  });

});

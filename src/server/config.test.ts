import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const goodEnv = {
  PAYGATE_URL: 'https://pay.example.com/',
  PAYGATE_API_KEY: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('normalises defaults and trailing slashes', () => {
    const config = loadConfig(goodEnv);
    expect(config.payGateUrl).toBe('https://pay.example.com');
    expect(config.port).toBe(3000);
    expect(config.trustProxyHeaders).toBe(false);
    expect(config.creationRateLimit).toBe(5);
    expect(config.statusRateLimit).toBe(180);
    expect(config.globalStatusRateLimit).toBe(1800);
  });

  it('rejects missing or weak API keys', () => {
    expect(() => loadConfig({ PAYGATE_URL: 'https://pay.example.com' })).toThrow(/PAYGATE_API_KEY/);
    expect(() => loadConfig({ ...goodEnv, PAYGATE_API_KEY: 'short' })).toThrow(/24 characters/);
  });

  it('rejects malformed booleans and non-http URLs', () => {
    expect(() => loadConfig({ ...goodEnv, TRUST_PROXY_HEADERS: 'yes' })).toThrow(/true or false/);
    expect(() => loadConfig({ ...goodEnv, PAYGATE_URL: 'ftp://pay.example.com' })).toThrow(/http or https/);
    expect(() => loadConfig({ ...goodEnv, PAYGATE_URL: 'https://user:pass@pay.example.com/api?x=1' })).toThrow(/must be an origin/);
    expect(() => loadConfig({ ...goodEnv, PORT: '70000' })).toThrow(/1 and 65535/);
    expect(() => loadConfig({ ...goodEnv, PAYMENT_STATUS_LIMIT: '0' })).toThrow(/positive integer/);
  });
});


it('requires an isolated Razorpay Test origin and API key only when enabled', () => {
  const disabled = loadConfig(goodEnv);
  expect(disabled.razorpayTestEnabled).toBe(false);
  expect(disabled.razorpayTestUrl).toBe('');
  expect(() => loadConfig({ ...goodEnv, RAZORPAY_TEST_ENABLED: 'true' })).toThrow(/RAZORPAY_TEST_URL/);
  expect(() => loadConfig({
    ...goodEnv,
    RAZORPAY_TEST_ENABLED: 'true',
    RAZORPAY_TEST_URL: 'https://user:pass@test.example.com/api',
    RAZORPAY_TEST_API_KEY: 'x'.repeat(32),
  })).toThrow(/must be an origin/);
  const enabled = loadConfig({
    ...goodEnv,
    RAZORPAY_TEST_ENABLED: 'true',
    RAZORPAY_TEST_URL: 'http://paygate-razorpay-test:3000/',
    RAZORPAY_TEST_API_KEY: 'r'.repeat(32),
  });
  expect(enabled.razorpayTestEnabled).toBe(true);
  expect(enabled.razorpayTestUrl).toBe('http://paygate-razorpay-test:3000');
});

it('requires an isolated Razorpay Live origin and API key only when enabled', () => {
  const disabled = loadConfig(goodEnv);
  expect(disabled.razorpayLiveEnabled).toBe(false);
  expect(disabled.razorpayLiveUrl).toBe('');
  expect(() => loadConfig({ ...goodEnv, RAZORPAY_LIVE_ENABLED: 'true' })).toThrow(/RAZORPAY_LIVE_URL/);
  expect(() => loadConfig({
    ...goodEnv,
    RAZORPAY_LIVE_ENABLED: 'true',
    RAZORPAY_LIVE_URL: 'https://user:pass@live.example.com/api',
    RAZORPAY_LIVE_API_KEY: 'x'.repeat(32),
  })).toThrow(/must be an origin/);
  const enabled = loadConfig({
    ...goodEnv,
    RAZORPAY_LIVE_ENABLED: 'true',
    RAZORPAY_LIVE_URL: 'http://paygate-razorpay-live:3000/',
    RAZORPAY_LIVE_API_KEY: 'l'.repeat(32),
  });
  expect(enabled.razorpayLiveEnabled).toBe(true);
  expect(enabled.razorpayLiveUrl).toBe('http://paygate-razorpay-live:3000');
});

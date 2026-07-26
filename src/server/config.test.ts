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
  });
});

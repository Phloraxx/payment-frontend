import { describe, expect, it } from 'vitest';
import { FixedWindowLimiter } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('limits a key and resets after the configured window', () => {
    let now = 1_000;
    const limiter = new FixedWindowLimiter(2, 5_000, 10, () => now);
    expect(limiter.consume('ip').allowed).toBe(true);
    expect(limiter.consume('ip').allowed).toBe(true);
    const denied = limiter.consume('ip');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(5);
    now += 5_001;
    expect(limiter.consume('ip').allowed).toBe(true);
  });
});

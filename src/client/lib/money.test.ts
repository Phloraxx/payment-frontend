import { describe, expect, it } from 'vitest';
import { formatCountdown, verificationAdjustmentPaise } from './money.js';

describe('money helpers', () => {
  it('calculates only the DDM adjustment', () => {
    expect(verificationAdjustmentPaise(10000, 10037)).toBe(37);
    expect(verificationAdjustmentPaise(10000, 9999)).toBe(0);
  });

  it('formats countdowns defensively', () => {
    expect(formatCountdown(241)).toBe('04:01');
    expect(formatCountdown(-1)).toBe('00:00');
  });
});

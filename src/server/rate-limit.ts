interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowState>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const now = this.now();
    this.sweep(now);
    const state = this.windows.get(key);
    if (!state || state.resetAt <= now) {
      return { allowed: true, remaining: this.limit, retryAfterSeconds: 0 };
    }
    if (state.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - state.count),
      retryAfterSeconds: 0,
    };
  }

  consume(key: string): RateLimitDecision {
    const now = this.now();
    this.sweep(now);

    let state = this.windows.get(key);
    if (!state || state.resetAt <= now) {
      if (!state && this.windows.size >= this.maxKeys) {
        this.evictExpiredOrOldest(now);
      }
      state = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, state);
    }

    if (state.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      };
    }

    state.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - state.count),
      retryAfterSeconds: 0,
    };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < Math.min(this.windowMs, 60_000)) return;
    this.lastSweep = now;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key);
    }
  }

  private evictExpiredOrOldest(now: number): void {
    let oldestKey: string | undefined;
    let oldestResetAt = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) {
        this.windows.delete(key);
        return;
      }
      if (state.resetAt < oldestResetAt) {
        oldestResetAt = state.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.windows.delete(oldestKey);
  }
}

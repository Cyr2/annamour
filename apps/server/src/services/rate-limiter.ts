/** Above this many tracked keys, stale ones are dropped so memory stays bounded. */
const PRUNE_ABOVE = 10_000;

/** Sliding-window counter: at most `max` attempts per key within `windowMs`. */
export class RateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor({ max, windowMs }: { max: number; windowMs: number }) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Counts an attempt; returns false (without counting it) once the limit is reached. */
  tryAcquire(key: string, now: number): boolean {
    if (this.attempts.size > PRUNE_ABOVE) this.prune(now);
    const recent = this.recent(key, now);
    if (recent.length >= this.max) return false;
    this.attempts.set(key, [...recent, now]);
    return true;
  }

  private recent(key: string, now: number): number[] {
    return (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }

  private prune(now: number): void {
    for (const key of [...this.attempts.keys()]) {
      if (this.recent(key, now).length === 0) this.attempts.delete(key);
    }
  }
}

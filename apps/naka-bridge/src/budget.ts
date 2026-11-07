/**
 * Calls to Naka allowed per sliding window, for everyone together: Naka's team
 * agreed to this use as long as it never weighs on their site.
 */
export class CallBudget {
  private calls: number[] = [];
  private readonly max: number;
  private readonly windowMs: number;

  constructor({ max, windowMs }: { max: number; windowMs: number }) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Spends one call; false (nothing spent) once the window is full. */
  trySpend(now: number): boolean {
    this.calls = this.calls.filter((at) => now - at < this.windowMs);
    if (this.calls.length >= this.max) return false;
    this.calls.push(now);
    return true;
  }
}

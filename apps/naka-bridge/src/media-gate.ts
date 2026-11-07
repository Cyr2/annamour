import { CallBudget } from "./budget.ts";

/**
 * How hard the bridge may pull on Naka's video servers: a few files at a
 * time, and per minute both a number of files and a volume. Naka's team
 * allowed getting past their anti-bot as long as their site never suffers
 * from it; 150 MB a minute is about 20 Mb/s, a film downloaded ~6× faster
 * than it plays, once per séance. Audio segments are tiny: counting bytes
 * keeps them from eating the video's share.
 */
export interface MediaGateLimits {
  parallel?: number;
  perMinute?: number;
  bytesPerMinute?: number;
}

const WINDOW_MS = 60_000;

export class MediaGate {
  private running = 0;
  private readonly parallel: number;
  private readonly bytesPerMinute: number;
  private readonly budget: CallBudget;
  private transfers: Array<{ at: number; bytes: number }> = [];

  constructor({ parallel = 3, perMinute = 120, bytesPerMinute = 150 * 1024 * 1024 }: MediaGateLimits = {}) {
    this.parallel = parallel;
    this.bytesPerMinute = bytesPerMinute;
    this.budget = new CallBudget({ max: perMinute, windowMs: WINDOW_MS });
  }

  /** Runs `work` if a slot is free and the minute's budget allows it; null otherwise. */
  async run<T>(now: number, work: () => Promise<T>, size: (result: T) => number = () => 0): Promise<T | null> {
    this.transfers = this.transfers.filter((transfer) => now - transfer.at < WINDOW_MS);
    const spent = this.transfers.reduce((sum, transfer) => sum + transfer.bytes, 0);
    if (this.running >= this.parallel || spent >= this.bytesPerMinute || !this.budget.trySpend(now)) return null;
    this.running++;
    try {
      const result = await work();
      this.transfers.push({ at: now, bytes: size(result) });
      return result;
    } finally {
      this.running--;
    }
  }
}

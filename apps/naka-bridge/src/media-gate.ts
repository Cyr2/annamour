import { CallBudget } from "./budget.ts";

/**
 * How hard the bridge may pull on Naka's video servers: a few segments at a
 * time and a cap per minute. Naka's team allowed getting past their anti-bot
 * as long as their site never suffers from it; 40 segments of 10 s a minute
 * is about 20 Mb/s, a film downloaded ~6× faster than it plays, once per séance.
 */
export class MediaGate {
  private running = 0;
  private readonly parallel: number;
  private readonly budget: CallBudget;

  constructor({ parallel = 2, perMinute = 40 }: { parallel?: number; perMinute?: number } = {}) {
    this.parallel = parallel;
    this.budget = new CallBudget({ max: perMinute, windowMs: 60_000 });
  }

  /** Runs `work` if a slot is free and the minute's budget allows it; null otherwise. */
  async run<T>(now: number, work: () => Promise<T>): Promise<T | null> {
    if (this.running >= this.parallel || !this.budget.trySpend(now)) return null;
    this.running++;
    try {
      return await work();
    } finally {
      this.running--;
    }
  }
}

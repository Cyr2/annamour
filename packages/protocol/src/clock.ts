/**
 * NTP-style clock offset estimation.
 * The client sends t0, the server answers with its time ts, the client
 * receives at t1. Assuming a symmetric path, offset = ts - (t0 + t1) / 2.
 */
export interface ClockSample {
  offset: number;
  rtt: number;
}

export function sampleFrom(t0: number, ts: number, t1: number): ClockSample {
  return { offset: ts - (t0 + t1) / 2, rtt: Math.max(0, t1 - t0) };
}

/** Median of a non-empty, ascending-sorted list. */
function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) throw new RangeError("median of an empty list");
  if (sorted.length % 2) return upper;
  // Even length: mid >= 1, so the lower middle exists.
  const lower = sorted[mid - 1] ?? upper;
  return (lower + upper) / 2;
}

/**
 * Keeps the most recent samples and trusts the fastest round trips: they
 * carry the least queuing noise. Returns the median offset of the best half.
 */
export class ClockEstimator {
  private samples: ClockSample[] = [];
  private readonly capacity: number;

  constructor(capacity = 12) {
    this.capacity = capacity;
  }

  add(sample: ClockSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get ready(): boolean {
    return this.samples.length >= 3;
  }

  get size(): number {
    return this.samples.length;
  }

  /** Server time minus local time, in ms. */
  get offset(): number {
    if (this.samples.length === 0) return 0;
    const best = [...this.samples]
      .sort((a, b) => a.rtt - b.rtt)
      .slice(0, Math.max(1, Math.ceil(this.samples.length / 2)))
      .map((s) => s.offset)
      .sort((a, b) => a - b);
    return median(best);
  }

  get rtt(): number {
    if (this.samples.length === 0) return 0;
    return Math.min(...this.samples.map((s) => s.rtt));
  }

  /** Converts a local timestamp to server time. */
  toServer(local: number): number {
    return local + this.offset;
  }
}

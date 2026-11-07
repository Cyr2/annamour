import { type PlaybackReport, type PlaybackStatsEntry, rebufferRatio } from "@annamour/protocol";
import type { Repositories } from "../storage/repositories.ts";
import { RateLimiter } from "./rate-limiter.ts";

/** Reports are kept this long: enough to compare evenings, short enough to hold nothing for good. */
export const REPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** A device reports about once a minute; this leaves room for several devices behind one address. */
const REPORT_LIMIT = { windowMs: 60_000, max: 30 };

export type RecordResult = "saved" | "unknown_room" | "too_many";

/**
 * How well each device plays each séance, so the lighter qualities can be
 * tuned on real evenings (rebuffering, startup time, quality actually seen).
 */
export class PlaybackStatsService {
  private readonly repositories: Pick<Repositories, "rooms" | "playbackReports">;
  private readonly now: () => number;
  private readonly limiter = new RateLimiter(REPORT_LIMIT);

  constructor({
    repositories,
    now,
  }: {
    repositories: Pick<Repositories, "rooms" | "playbackReports">;
    now: () => number;
  }) {
    this.repositories = repositories;
    this.now = now;
  }

  record(code: string, report: PlaybackReport, clientKey: string): RecordResult {
    const now = this.now();
    if (!this.limiter.tryAcquire(clientKey, now)) return "too_many";
    if (!this.repositories.rooms.exists(code)) return "unknown_room";
    this.repositories.playbackReports.save(code, report, now);
    return "saved";
  }

  /** A séance's reports, newest first, each with its share of time frozen. */
  list(code: string): PlaybackStatsEntry[] {
    return this.repositories.playbackReports
      .listForRoom(code)
      .map(({ report, updatedAt }) => ({ ...report, updatedAt, rebufferRatio: rebufferRatio(report) }));
  }

  sweep(): number {
    return this.repositories.playbackReports.deleteOlderThan(this.now() - REPORT_RETENTION_MS);
  }
}

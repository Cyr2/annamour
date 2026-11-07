import { describe, expect, it } from "vitest";
import type { PlaybackStatsEntry } from "../src/playback-stats.ts";
import { heightBucket, SeanceReport, seanceReport } from "../src/seance-report.ts";

const entry = (overrides: Partial<PlaybackStatsEntry>): PlaybackStatsEntry => ({
  viewingId: "viewing-0001",
  name: "Annou",
  device: "iPad",
  engine: "native",
  watchedSeconds: 2400,
  stallCount: 0,
  stallSeconds: 0,
  startupMs: 800,
  heights: [{ height: 480, seconds: 2400 }],
  updatedAt: 1,
  rebufferRatio: 0,
  ...overrides,
});

describe("a séance's evening, per device", () => {
  it("adds up the page loads of one person on one device and player", () => {
    const report = seanceReport([
      entry({ viewingId: "viewing-0001", watchedSeconds: 2515, stallCount: 3, stallSeconds: 58.9 }),
      entry({ viewingId: "viewing-0002", watchedSeconds: 777.5, stallCount: 2, stallSeconds: 46.9, updatedAt: 2 }),
    ]);
    expect(report.devices).toHaveLength(1);
    expect(report.devices[0]).toMatchObject({ name: "Annou", watchedSeconds: 3292.5, stallCount: 5 });
    expect(report.devices[0]?.stallSeconds).toBeCloseTo(105.8);
  });

  it("keeps people, devices and players apart, the one who watched the most first", () => {
    const report = seanceReport([
      entry({ name: "Darius", device: "Windows", engine: "hls.js", watchedSeconds: 100 }),
      entry({ watchedSeconds: 300 }),
      entry({ engine: "hls.js", watchedSeconds: 200 }),
    ]);
    expect(report.devices.map((d) => `${d.name} ${d.device} ${d.engine}`)).toEqual([
      "Annou iPad native",
      "Annou iPad hls.js",
      "Darius Windows hls.js",
    ]);
    expect(SeanceReport.safeParse(report).success).toBe(true);
  });

  it("checks the evening against the targets for a weak link", () => {
    const [annou] = seanceReport([
      entry({
        watchedSeconds: 2400,
        stallCount: 3,
        stallSeconds: 60,
        heights: [
          { height: 234, seconds: 800 },
          { height: 480, seconds: 1600 },
        ],
      }),
    ]).devices;
    expect(annou?.targets.rebuffer).toEqual({ value: 60 / 2460, met: false });
    expect(annou?.targets.stalls).toEqual({ value: 3, met: false });
    expect(annou?.targets.stallLength).toEqual({ value: 20, met: false });
    expect(annou?.targets.lowest.met).toBe(false);
    expect(annou?.targets.lowest.value).toBeCloseTo(1 / 3);
    expect(annou?.targets.startup).toEqual({ value: 800, met: true });
  });

  it("meets every target on a smooth evening", () => {
    const [smooth] = seanceReport([entry({ stallCount: 1, stallSeconds: 2 })]).devices;
    expect(Object.values(smooth?.targets ?? {}).every((target) => target.met)).toBe(true);
  });

  it("says what cannot be measured yet rather than guessing", () => {
    const [fresh] = seanceReport([entry({ watchedSeconds: 0, startupMs: null, heights: [] })]).devices;
    expect(fresh?.targets.rebuffer).toEqual({ value: null, met: null });
    expect(fresh?.targets.stalls).toEqual({ value: null, met: null });
    expect(fresh?.targets.lowest).toEqual({ value: null, met: null });
    expect(fresh?.targets.startup).toEqual({ value: null, met: null });
    expect(fresh?.targets.stallLength).toEqual({ value: 0, met: true });
  });

  it("takes the middle start-up time of several page loads", () => {
    const [many] = seanceReport([
      entry({ startupMs: 100 }),
      entry({ startupMs: 3000 }),
      entry({ startupMs: 500 }),
      entry({ startupMs: 700 }),
    ]).devices;
    expect(many?.targets.startup.value).toBe(600);
  });

  it("has nothing to say about a séance nobody watched", () => {
    expect(seanceReport([])).toEqual({ devices: [] });
  });
});

describe("time per quality", () => {
  it("puts each picture height in the ladder's bucket, a 640 px source with the 720p ones", () => {
    expect([200, 234, 270, 288, 360, 400, 480, 540, 640, 720].map(heightBucket)).toEqual([
      234, 234, 288, 288, 360, 480, 480, 540, 640, 640,
    ]);
  });

  it("gives the share of the time at each quality seen, lightest first", () => {
    const [annou] = seanceReport([
      entry({
        heights: [
          { height: 540, seconds: 737.5 },
          { height: 234, seconds: 1022 },
          { height: 360, seconds: 715.4 },
          { height: 480, seconds: 40.1 },
        ],
      }),
    ]).devices;
    expect(annou?.heights.map((h) => h.height)).toEqual([234, 360, 480, 540]);
    expect(annou?.heights.reduce((sum, h) => sum + h.share, 0)).toBeCloseTo(1);
  });
});

import { describe, expect, it } from "vitest";
import { addHeightTime, deviceKind, MAX_HEIGHT_BUCKETS, PlaybackReport, rebufferRatio } from "../src/playback-stats.ts";

const report = {
  viewingId: "v-12345678",
  name: "Anna",
  device: "iPhone",
  engine: "native",
  watchedSeconds: 3600,
  stallCount: 2,
  stallSeconds: 12,
  startupMs: 1800,
  heights: [{ height: 480, seconds: 3000 }],
};

describe("a playback report", () => {
  it("is accepted when it stays within sensible bounds", () => {
    expect(PlaybackReport.safeParse(report).success).toBe(true);
    expect(PlaybackReport.safeParse({ ...report, startupMs: null }).success).toBe(true);
  });

  it("is refused when it is out of bounds or carries a strange id", () => {
    expect(PlaybackReport.safeParse({ ...report, watchedSeconds: -1 }).success).toBe(false);
    expect(PlaybackReport.safeParse({ ...report, stallCount: 1.5 }).success).toBe(false);
    expect(PlaybackReport.safeParse({ ...report, viewingId: "../../etc" }).success).toBe(false);
    expect(PlaybackReport.safeParse({ ...report, device: "Toaster" }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_HEIGHT_BUCKETS + 1 }, (_, i) => ({ height: i, seconds: 1 }));
    expect(PlaybackReport.safeParse({ ...report, heights: tooMany }).success).toBe(false);
  });
});

describe("the share of the evening spent frozen", () => {
  it("is the frozen time over the time watched or frozen", () => {
    expect(rebufferRatio({ watchedSeconds: 90, stallSeconds: 10 })).toBeCloseTo(0.1);
  });

  it("is zero before anything played", () => {
    expect(rebufferRatio({ watchedSeconds: 0, stallSeconds: 0 })).toBe(0);
  });
});

describe("time at each picture height", () => {
  it("adds up per height", () => {
    const once = addHeightTime([], 480, 2);
    const twice = addHeightTime(once, 480, 2);
    expect(addHeightTime(twice, 720, 2)).toEqual([
      { height: 480, seconds: 4 },
      { height: 720, seconds: 2 },
    ]);
  });

  it("stops opening new heights once the limit is reached, still counting known ones", () => {
    const full = Array.from({ length: MAX_HEIGHT_BUCKETS }, (_, i) => ({ height: i, seconds: 1 }));
    expect(addHeightTime(full, 9999, 5)).toHaveLength(MAX_HEIGHT_BUCKETS);
    expect(addHeightTime(full, 3, 5).find((bucket) => bucket.height === 3)?.seconds).toBe(6);
  });
});

describe("the kind of device", () => {
  const ua = {
    iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    iPadOld: "Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    androidTv: "Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 Chrome/150.0 Safari/537.36",
    android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36",
  };

  it("is told from the user agent, without keeping it", () => {
    expect(deviceKind(ua.iPhone)).toBe("iPhone");
    expect(deviceKind(ua.iPadOld)).toBe("iPad");
    expect(deviceKind(ua.androidTv)).toBe("Android TV");
    expect(deviceKind(ua.android)).toBe("Android");
    expect(deviceKind(ua.windows)).toBe("Windows");
    expect(deviceKind(ua.linux)).toBe("Linux");
    expect(deviceKind("curl/8")).toBe("Autre");
  });

  it("recognises a recent iPad, which says « Macintosh » but has a touch screen", () => {
    expect(deviceKind(ua.mac, 5)).toBe("iPad");
    expect(deviceKind(ua.mac, 0)).toBe("Mac");
  });
});

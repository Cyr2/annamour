import { describe, expect, it } from "vitest";
import { ConfigError, DEV_PEPPER, loadConfig } from "../src/config.ts";
import { RateLimiter } from "../src/services/rate-limiter.ts";

describe("server configuration", () => {
  it("refuses to start in production without a key pepper", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: "production", KEY_PEPPER: "  " })).toThrow(/KEY_PEPPER/);
    const config = loadConfig({ NODE_ENV: "production", KEY_PEPPER: "s3cret" });
    expect(config).toMatchObject({ production: true, pepper: "s3cret" });
  });

  it("makes lighter qualities with 2 ffmpeg at once unless told otherwise, 0 turning them off", () => {
    expect(loadConfig({}).transcodeWorkers).toBe(2);
    expect(loadConfig({ TRANSCODE_WORKERS: "0" }).transcodeWorkers).toBe(0);
    expect(loadConfig({ TRANSCODE_WORKERS: " " }).transcodeWorkers).toBe(2);
    expect(() => loadConfig({ TRANSCODE_WORKERS: "lots" })).toThrow(/TRANSCODE_WORKERS/);
    expect(() => loadConfig({ TRANSCODE_WORKERS: "64" })).toThrow(ConfigError);
  });

  it("keeps the lighter audio off unless asked for", () => {
    expect(loadConfig({}).lightAudio).toBe(false);
    expect(loadConfig({ LIGHT_AUDIO: "on" }).lightAudio).toBe(true);
    expect(loadConfig({ LIGHT_AUDIO: "yes" }).lightAudio).toBe(false);
  });

  it("has development defaults", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 8787,
      production: false,
      pepper: DEV_PEPPER,
      relyingParty: { id: "localhost", name: "Annamour", origins: ["http://localhost:5173"] },
    });
    expect(config.dataDir).toMatch(/data$/);
  });

  it("reads the passkey domain and every origin the app is served from", () => {
    const config = loadConfig({
      RP_ID: "annamour.example",
      ORIGIN: "https://annamour.example, https://www.annamour.example,",
      DATA_DIR: "/srv/annamour",
      PORT: "9000",
    });
    expect(config.relyingParty).toEqual({
      id: "annamour.example",
      name: "Annamour",
      origins: ["https://annamour.example", "https://www.annamour.example"],
    });
    expect(config.port).toBe(9000);
    expect(config.dataDir).toMatch(/annamour$/);
  });
});

describe("rate limiter", () => {
  it("allows a burst, then waits for the window to slide", () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.tryAcquire("a", 0)).toBe(true);
    expect(limiter.tryAcquire("a", 500)).toBe(true);
    expect(limiter.tryAcquire("a", 900)).toBe(false);
    expect(limiter.tryAcquire("b", 900)).toBe(true);
    expect(limiter.tryAcquire("a", 1000)).toBe(true);
  });

  it("forgets stale addresses instead of growing forever", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    for (let i = 0; i <= 10_001; i++) limiter.tryAcquire(`ip-${i}`, 0);
    expect(limiter.tryAcquire("late", 5000)).toBe(true);
    expect(limiter.tryAcquire("ip-1", 5000)).toBe(true);
  });
});

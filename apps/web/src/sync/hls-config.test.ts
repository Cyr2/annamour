import { describe, expect, it } from "vitest";
import { hlsConfig } from "./hls-config.ts";

const browser = (vendor: string) => ({ vendor }) as Navigator;

describe("our player's settings", () => {
  it("download up to ten minutes ahead in Chrome and on the TV", () => {
    const config = hlsConfig(0, browser("Google Inc."));
    expect(config).toMatchObject({ maxBufferLength: 600, maxMaxBufferLength: 600 });
  });

  it("stay under WebKit's memory caps on an iPad, on full Media Source, and climb carefully on 4G", () => {
    const config = hlsConfig(0, browser("Apple Computer, Inc."));
    expect(config).toMatchObject({
      preferManagedMediaSource: false,
      maxBufferLength: 300,
      maxMaxBufferLength: 300,
      maxBufferSize: 100 * 1024 * 1024,
      abrBandWidthUpFactor: 0.6,
    });
  });
});

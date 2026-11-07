import { describe, expect, it } from "vitest";
import { fullscreenPlan } from "./fullscreen.ts";

describe("full screen", () => {
  it("leaves full screen when already in it", () => {
    expect(fullscreenPlan({ active: true, pageAllowed: true, videoAllowed: true })).toBe("exit");
  });

  it("puts the whole player full screen where the page may (Android, desktop, iPad)", () => {
    expect(fullscreenPlan({ active: false, pageAllowed: true, videoAllowed: true })).toBe("element");
  });

  it("falls back to the video's own full screen on iPhone, which rotates by itself", () => {
    expect(fullscreenPlan({ active: false, pageAllowed: false, videoAllowed: true })).toBe("video");
    expect(fullscreenPlan({ active: false, pageAllowed: false, videoAllowed: false })).toBe("none");
  });
});

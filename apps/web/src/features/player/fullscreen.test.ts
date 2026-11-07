import { afterEach, describe, expect, it, vi } from "vitest";
import { fullscreenPlan, leaveFullscreen } from "./fullscreen.ts";

describe("leaving the player", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "fullscreenElement");
    Reflect.deleteProperty(document, "exitFullscreen");
    Reflect.deleteProperty(screen, "orientation");
  });

  it("gives back the portrait app when the film was full screen in landscape", () => {
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
    Object.defineProperty(document, "exitFullscreen", { value: exit, configurable: true });
    const unlock = vi.fn();
    Object.defineProperty(screen, "orientation", { value: { unlock }, configurable: true });

    leaveFullscreen();

    expect(exit).toHaveBeenCalledOnce();
    expect(unlock).toHaveBeenCalledOnce();
  });

  it("only frees the rotation when nothing is full screen", () => {
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "exitFullscreen", { value: exit, configurable: true });
    const unlock = vi.fn();
    Object.defineProperty(screen, "orientation", { value: { unlock }, configurable: true });

    leaveFullscreen();

    expect(exit).not.toHaveBeenCalled();
    expect(unlock).toHaveBeenCalledOnce();
  });
});

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

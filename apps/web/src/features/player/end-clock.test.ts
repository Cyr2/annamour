import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("the clock at the end of the timeline", () => {
  it("shows the film's length, or what is left with a minus sign", async () => {
    const { endClockText } = await import("./end-clock.ts");
    expect(endClockText({ current: 600, duration: 6000 }, "total")).toBe("1:40:00");
    expect(endClockText({ current: 600, duration: 6000 }, "remaining")).toBe("−1:30:00");
  });

  it("never says nothing is left before the film really ends", async () => {
    const { endClockText } = await import("./end-clock.ts");
    expect(endClockText({ current: 5999.6, duration: 6000 }, "remaining")).toBe("−0:00:01");
    expect(endClockText({ current: 6000, duration: 6000 }, "remaining")).toBe("−0:00:00");
    expect(endClockText({ current: 10, duration: 0 }, "remaining")).toBe("−0:00:00");
  });

  it("starts on the total, then remembers the choice on this device", async () => {
    const first = await import("./end-clock.ts");
    expect(first.useEndClock.getState().mode).toBe("total");
    first.toggleEndClock();
    expect(first.useEndClock.getState().mode).toBe("remaining");
    vi.resetModules();
    const reloaded = await import("./end-clock.ts");
    expect(reloaded.useEndClock.getState().mode).toBe("remaining");
    reloaded.toggleEndClock();
    expect(reloaded.useEndClock.getState().mode).toBe("total");
  });
});
